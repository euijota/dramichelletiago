import { useEffect, useImperativeHandle, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Download,
  Eraser,
  ExternalLink,
  FileSignature,
  KeyRound,
  Loader2,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";
import { CLINIC } from "@/lib/clinic";
import { cn } from "@/lib/utils";
import {
  CONSENT_TEXT,
  completeSignature,
  openSignature,
  sendSignatureOtp,
  verifySignatureOtp,
} from "@/lib/signature";

export const Route = createFileRoute("/assinar/$token")({
  head: () => ({
    meta: [
      { title: `Assinar documento - ${CLINIC.name}` },
      { name: "description", content: "Assinatura eletrônica de documento odontológico" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: SignDocumentPage,
});

const STEPS = ["Identidade", "Leitura", "Assinatura"] as const;

function Shell({ step, children }: { step?: number; children: React.ReactNode }) {
  // Cada etapa é um componente próprio: ao montar, volta ao topo para mostrar o novo conteúdo.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="container mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-16">
        {step !== undefined && (
          <ol className="mb-6 flex items-center gap-2" aria-label="Etapas da assinatura">
            {STEPS.map((label, i) => (
              <li key={label} className="flex flex-1 items-center gap-2">
                <span
                  aria-current={i === step ? "step" : undefined}
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors",
                    i < step && "bg-primary text-primary-foreground",
                    i === step && "bg-primary/15 text-primary ring-2 ring-primary",
                    i > step && "bg-muted text-muted-foreground",
                  )}
                >
                  {i < step ? "✓" : i + 1}
                </span>
                <span
                  className={cn(
                    "text-xs font-semibold",
                    i === step ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {label}
                </span>
                {i < STEPS.length - 1 && <span className="h-px flex-1 bg-border" />}
              </li>
            ))}
          </ol>
        )}
        <div className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
          {children}
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Dúvidas? Fale com o consultório pelo WhatsApp {CLINIC.phone}.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}

function ErrorText({ message }: { message: string | null }) {
  return (
    <p role="alert" aria-live="assertive" className="min-h-5 text-sm font-medium text-rose-600">
      {message}
    </p>
  );
}

/** Baixa um URL assinado (vale 60s) logo que chega e devolve um blob: URL estável. */
function useBlobUrl(remoteUrl: string | null | undefined) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!remoteUrl) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    setFailed(false);
    fetch(remoteUrl)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [remoteUrl]);
  return { blobUrl, failed };
}

function SignDocumentPage() {
  const { token } = Route.useParams();
  const queryClient = useQueryClient();
  const queryKey = ["signature", token];
  const [done, setDone] = useState<Awaited<ReturnType<typeof completeSignature>> | null>(null);

  const open = useQuery({
    queryKey,
    queryFn: () => openSignature({ data: token }),
    retry: false,
    refetchOnWindowFocus: false,
  });

  if (done) return <DoneStep result={done} />;

  if (open.isLoading) {
    return (
      <Shell>
        <div className="flex flex-col items-center py-10 text-center" aria-busy="true">
          <Loader2 className="h-10 w-10 animate-spin text-primary" aria-hidden />
          <p className="mt-4 text-sm text-muted-foreground">Abrindo documento...</p>
        </div>
      </Shell>
    );
  }

  if (open.error || !open.data) {
    const msg = open.error?.message ?? "";
    return (
      <Shell>
        <div className="text-center">
          <XCircle className="mx-auto h-14 w-14 text-rose-600" aria-hidden />
          <h1 className="mt-5 font-display text-2xl text-foreground">
            Não foi possível abrir o documento
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {msg.startsWith("Muitas tentativas")
              ? msg
              : "O link pode ter expirado, sido cancelado ou já utilizado. Peça um novo link ao consultório."}
          </p>
        </div>
      </Shell>
    );
  }

  const info = open.data;
  if (!info.otpVerified) {
    return (
      <IdentityStep
        token={token}
        info={info}
        onVerified={() => queryClient.invalidateQueries({ queryKey })}
      />
    );
  }
  return (
    <ReviewStep
      token={token}
      info={info}
      onSigned={setDone}
      onExpired={() => queryClient.invalidateQueries({ queryKey })}
    />
  );
}

type OpenInfo = Awaited<ReturnType<typeof openSignature>>;

function DocumentSummary({ info }: { info: OpenInfo }) {
  return (
    <div className="mt-6 grid gap-3 rounded-2xl bg-muted/50 p-4 text-sm sm:grid-cols-2">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Documento
        </p>
        <p className="mt-1 font-semibold text-foreground">{info.documentLabel}</p>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {info.signerRole === "responsavel_legal" ? "Responsável legal" : "Paciente"}
        </p>
        <p className="mt-1 font-semibold text-foreground">{info.signerNameMasked}</p>
      </div>
    </div>
  );
}

function IdentityStep({
  token,
  info,
  onVerified,
}: {
  token: string;
  info: OpenInfo;
  onVerified: () => void;
}) {
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const send = useMutation({
    mutationFn: () => sendSignatureOtp({ data: token }),
    onMutate: () => setError(null),
    onSuccess: () => setTimeout(() => inputRef.current?.focus(), 50),
    onError: (e: Error) => setError(e.message),
  });

  const verify = useMutation({
    mutationFn: () => verifySignatureOtp({ data: { token, otp } }),
    onMutate: () => setError(null),
    onSuccess: (r) => {
      if (r.ok) return onVerified();
      setOtp("");
      setError(
        r.reason === "invalid"
          ? `Código incorreto. ${r.attemptsLeft} tentativa(s) restante(s).`
          : r.reason === "expired"
            ? "O código expirou. Peça um novo código."
            : "Muitas tentativas erradas. Peça um novo link ao consultório.",
      );
      inputRef.current?.focus();
    },
    onError: (e: Error) => setError(e.message),
  });

  const sent = send.data;
  return (
    <Shell step={0}>
      <div className="text-center">
        <ShieldCheck className="mx-auto h-12 w-12 text-primary" aria-hidden />
        <h1 className="mt-5 font-display text-2xl text-foreground sm:text-3xl">
          Confirme que é você
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Para proteger seus dados, enviamos um código de 6 dígitos ao contato cadastrado no
          consultório antes de mostrar o documento.
        </p>
      </div>
      <DocumentSummary info={info} />

      {!sent ? (
        <div className="mt-6 space-y-3">
          <Button
            onClick={() => send.mutate()}
            disabled={send.isPending}
            className="h-12 w-full rounded-full text-base font-semibold"
          >
            {send.isPending ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            ) : (
              <KeyRound className="h-5 w-5" aria-hidden />
            )}
            {send.isPending ? "Enviando código..." : "Receber código"}
          </Button>
          <ErrorText message={error} />
        </div>
      ) : (
        <form
          className="mt-6 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (otp.length === 6) verify.mutate();
          }}
        >
          <p className="text-sm text-foreground" aria-live="polite">
            Enviamos o código por{" "}
            <strong>{sent.sentVia === "whatsapp" ? "WhatsApp" : "e-mail"}</strong> para{" "}
            <strong>{sent.contactMasked}</strong>. Ele vale por 10 minutos.
          </p>
          <label htmlFor="otp" className="block text-sm font-semibold text-foreground">
            Código de verificação
          </label>
          <input
            ref={inputRef}
            id="otp"
            name="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
            aria-invalid={Boolean(error)}
            aria-describedby="otp-help"
            className="h-14 w-full rounded-2xl border border-input bg-background text-center font-mono text-2xl tracking-[0.5em] text-foreground outline-none transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/40"
          />
          <p id="otp-help" className="text-xs text-muted-foreground">
            Não compartilhe este código com ninguém, nem com quem diz ser do consultório.
          </p>
          <ErrorText message={error} />
          <Button
            type="submit"
            disabled={otp.length !== 6 || verify.isPending}
            className="h-12 w-full rounded-full text-base font-semibold"
          >
            {verify.isPending && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
            {verify.isPending ? "Conferindo..." : "Confirmar código"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={send.isPending || sent.sendsLeft <= 0}
            onClick={() => send.mutate()}
            className="h-auto min-h-11 w-full whitespace-normal rounded-full text-sm"
          >
            {sent.sendsLeft > 0
              ? `Não recebi — reenviar (${sent.sendsLeft} restante${sent.sendsLeft > 1 ? "s" : ""})`
              : "Limite de reenvios atingido"}
          </Button>
        </form>
      )}
    </Shell>
  );
}

function ReviewStep({
  token,
  info,
  onSigned,
  onExpired,
}: {
  token: string;
  info: OpenInfo;
  onSigned: (r: Awaited<ReturnType<typeof completeSignature>>) => void;
  onExpired: () => void;
}) {
  const { blobUrl, failed } = useBlobUrl(info.documentUrl);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const padRef = useRef<SignaturePadHandle>(null);

  const sign = useMutation({
    mutationFn: () =>
      completeSignature({
        data: { token, accepted: true, rubricPngBase64: padRef.current?.toPngBase64() ?? null },
      }),
    onMutate: () => setError(null),
    onSuccess: onSigned,
    onError: (e: Error) => {
      setError(e.message);
      if (e.message.includes("código expirou")) onExpired();
    },
  });

  return (
    <Shell step={accepted ? 2 : 1}>
      <div className="flex items-start gap-3">
        <FileSignature className="mt-1 h-8 w-8 shrink-0 text-primary" aria-hidden />
        <div>
          <h1 className="font-display text-2xl text-foreground sm:text-3xl">Leia o documento</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Role até o fim antes de assinar. Se preferir, abra em tela cheia.
          </p>
        </div>
      </div>
      <DocumentSummary info={info} />

      <div className="mt-5 overflow-hidden rounded-2xl border border-border bg-muted/30">
        {blobUrl ? (
          <iframe
            src={blobUrl}
            title={`Documento: ${info.documentLabel}`}
            className="h-[60vh] min-h-[360px] w-full bg-white"
          />
        ) : (
          <div className="flex h-[40vh] flex-col items-center justify-center gap-3 p-6 text-center">
            {failed ? (
              <>
                <p className="text-sm text-muted-foreground">Não foi possível carregar o PDF.</p>
                <Button variant="outline" className="rounded-full" onClick={onExpired}>
                  Tentar de novo
                </Button>
              </>
            ) : (
              <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Carregando PDF" />
            )}
          </div>
        )}
      </div>
      {blobUrl && (
        <a
          href={blobUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full px-2 text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <ExternalLink className="h-4 w-4" aria-hidden /> Abrir documento em tela cheia
        </a>
      )}

      <label
        htmlFor="consent"
        className={cn(
          "mt-6 flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors",
          accepted ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
        )}
      >
        <input
          id="consent"
          type="checkbox"
          checked={accepted}
          disabled={!blobUrl}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--primary)]"
        />
        <span className="text-sm leading-relaxed text-foreground">{CONSENT_TEXT}</span>
      </label>

      <details className="group mt-4 rounded-2xl border border-border p-4">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-semibold text-foreground">
          Desenhar rubrica (opcional)
          <span
            className="text-muted-foreground transition-transform group-open:-scale-y-100"
            aria-hidden
          >
            ▾
          </span>
        </summary>
        <p className="mb-3 text-xs text-muted-foreground">
          A rubrica é só um complemento: a validade vem do código confirmado e do registro da
          assinatura.
        </p>
        <SignaturePad ref={padRef} />
      </details>

      <div className="mt-6 space-y-2">
        <ErrorText message={error} />
        <Button
          onClick={() => sign.mutate()}
          disabled={!accepted || sign.isPending}
          className="h-12 w-full rounded-full text-base font-semibold"
        >
          {sign.isPending ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          ) : (
            <FileSignature className="h-5 w-5" aria-hidden />
          )}
          {sign.isPending ? "Registrando assinatura..." : "Assinar documento"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Ao assinar, registramos data, hora, IP e dispositivo como prova (Lei 14.063/2020).
        </p>
      </div>
    </Shell>
  );
}

function DoneStep({ result }: { result: Awaited<ReturnType<typeof completeSignature>> }) {
  const { blobUrl } = useBlobUrl(result.signedPdfUrl);
  const when = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Belem",
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(result.signedAt));

  return (
    <Shell step={3}>
      <div className="text-center">
        <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-600" aria-hidden />
        <h1 className="mt-5 font-display text-2xl text-foreground sm:text-3xl">
          Documento assinado
        </h1>
        <p className="mt-2 text-sm text-muted-foreground" aria-live="polite">
          Assinatura registrada em {when}. O consultório já recebeu sua via.
        </p>
      </div>
      <div className="mt-6 space-y-3">
        <Button
          asChild={Boolean(blobUrl)}
          disabled={!blobUrl}
          className="h-12 w-full rounded-full text-base font-semibold"
        >
          {blobUrl ? (
            <a href={blobUrl} download="documento-assinado.pdf">
              <Download className="h-5 w-5" aria-hidden /> Baixar minha via (PDF)
            </a>
          ) : (
            <span>
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Preparando sua via...
            </span>
          )}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Qualquer pessoa pode conferir a autenticidade pelo QR code no PDF ou em{" "}
          <a
            href={result.verifyUrl}
            className="font-semibold text-primary underline-offset-4 hover:underline"
          >
            página de verificação
          </a>
          .
        </p>
      </div>
    </Shell>
  );
}

// ----------------------------------------------------------------------------
// Rubrica (canvas com pointer events: dedo, caneta ou mouse)
// ----------------------------------------------------------------------------

interface SignaturePadHandle {
  toPngBase64: () => string | null;
}

function SignaturePad({ ref }: { ref: React.Ref<SignaturePadHandle> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#1f1a1c";
      setHasInk(false);
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  useImperativeHandle(
    ref,
    () => ({
      toPngBase64: () =>
        hasInk && canvasRef.current ? canvasRef.current.toDataURL("image/png").split(",")[1] : null,
    }),
    [hasInk],
  );

  return (
    <div>
      <canvas
        ref={canvasRef}
        aria-label="Área para desenhar a rubrica"
        role="img"
        className="h-40 w-full touch-none rounded-xl border border-dashed border-input bg-white"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          const ctx = e.currentTarget.getContext("2d");
          const p = point(e);
          ctx?.beginPath();
          ctx?.moveTo(p.x, p.y);
          drawing.current = true;
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = e.currentTarget.getContext("2d");
          const p = point(e);
          ctx?.lineTo(p.x, p.y);
          ctx?.stroke();
          if (!hasInk) setHasInk(true);
        }}
        onPointerUp={() => (drawing.current = false)}
        onPointerCancel={() => (drawing.current = false)}
      />
      <Button
        type="button"
        variant="ghost"
        disabled={!hasInk}
        onClick={() => {
          const c = canvasRef.current;
          c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
          setHasInk(false);
        }}
        className="mt-2 h-11 rounded-full text-sm"
      >
        <Eraser className="h-4 w-4" aria-hidden /> Limpar rubrica
      </Button>
    </div>
  );
}
