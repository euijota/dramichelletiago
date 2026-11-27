import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Ban,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Eye,
  FileSignature,
  Loader2,
  QrCode,
  Send,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  SIGNATURE_DOCUMENT_TYPES,
  type SignatureDocumentType,
  createSignatureRequest,
  getSignedPdfUrl,
  revokeSignatureRequest,
} from "@/lib/signature";

const DOC_LABELS: Record<SignatureDocumentType, string> = {
  tcle: "TCLE",
  plano_tratamento: "Plano de tratamento",
  orcamento: "Orçamento",
};

// Tabela fora do types.ts gerado (mesmo padrão das RPCs clínicas): tipo local.
interface SignatureRow {
  id: string;
  document_type: SignatureDocumentType;
  signer_name: string;
  signer_role: "paciente" | "responsavel_legal";
  channel: "link" | "qr";
  status: "pending" | "signed" | "revoked";
  created_at: string;
  expires_at: string;
  opened_at: string | null;
  otp_verified_at: string | null;
  verify_code: string;
  signature_evidence: { signed_at: string } | { signed_at: string }[] | null;
}

export interface SignaturePrefill {
  pdf: Blob;
  documentType: SignatureDocumentType;
  label: string;
}

function signedAt(row: SignatureRow): string | null {
  const e = row.signature_evidence;
  return (Array.isArray(e) ? e[0]?.signed_at : e?.signed_at) ?? null;
}

function statusOf(row: SignatureRow) {
  if (row.status === "signed") return { label: "Assinado", tone: "emerald", Icon: CheckCircle2 };
  if (row.status === "revoked") return { label: "Revogado", tone: "muted", Icon: Ban };
  if (new Date(row.expires_at) < new Date())
    return { label: "Expirado", tone: "muted", Icon: Clock };
  if (row.otp_verified_at)
    return { label: "Identidade confirmada", tone: "primary", Icon: ShieldCheck };
  if (row.opened_at) return { label: "Aberto pelo paciente", tone: "primary", Icon: Eye };
  return { label: "Aguardando", tone: "amber", Icon: Clock };
}

const TONES: Record<string, string> = {
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  primary: "bg-primary/10 text-primary border-primary/20",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  muted: "bg-muted text-muted-foreground border-border",
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Belem",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

export function PatientSignatures({
  patientId,
  hasGuardian,
  prefill,
  onPrefillConsumed,
}: {
  patientId: string;
  hasGuardian: boolean;
  prefill?: SignaturePrefill | null;
  onPrefillConsumed?: () => void;
}) {
  const queryClient = useQueryClient();
  const queryKey = ["signature_requests", patientId];
  const [requestOpen, setRequestOpen] = useState(false);
  const [qr, setQr] = useState<{ requestId: string; url: string; expiresAt: string } | null>(null);
  const [fallbackLink, setFallbackLink] = useState<string | null>(null);

  const list = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("signature_requests")
        .select(
          "id, document_type, signer_name, signer_role, channel, status, created_at, expires_at, opened_at, otp_verified_at, verify_code, signature_evidence(signed_at)",
        )
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false });
      if (error) throw new Error("Não foi possível carregar as assinaturas.");
      return data as SignatureRow[];
    },
  });

  // "✓ Assinado" aparece sem recarregar (RLS limita o Realtime ao admin).
  useEffect(() => {
    const channel = supabase
      .channel(`signatures-${patientId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "signature_requests",
          filter: `patient_id=eq.${patientId}`,
        },
        (payload) => {
          queryClient.invalidateQueries({ queryKey });
          const row = payload.new as Partial<SignatureRow>;
          const old = payload.old as Partial<SignatureRow>;
          if (row?.status === "signed" && old?.status !== "signed") {
            toast.success("Documento assinado pelo paciente!");
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  useEffect(() => {
    if (prefill) setRequestOpen(true);
  }, [prefill]);

  const revoke = useMutation({
    mutationFn: (requestId: string) => revokeSignatureRequest({ data: { requestId } }),
    onSuccess: () => {
      toast.success("Pedido revogado. O link deixou de funcionar.");
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const download = useMutation({
    // A janela é aberta no clique (antes do await): aberta depois, o bloqueador de pop-up barra.
    mutationFn: async ({ requestId, win }: { requestId: string; win: Window | null }) => {
      try {
        const { url } = await getSignedPdfUrl({ data: { requestId } });
        if (win) {
          win.location.href = url;
          return "opened" as const;
        }
        // Pop-up bloqueado: baixa o arquivo sem sair do painel.
        const blob = await fetch(url).then((r) => {
          if (!r.ok) throw new Error("Não foi possível baixar o PDF assinado.");
          return r.blob();
        });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "documento-assinado.pdf";
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
        return "downloaded" as const;
      } catch (e) {
        win?.close();
        throw e;
      }
    },
    onSuccess: (how) => how === "downloaded" && toast.success("PDF assinado baixado."),
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = list.data ?? [];
  const qrRow = qr ? rows.find((r) => r.id === qr.requestId) : undefined;

  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-petal space-y-5">
      <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="flex items-center gap-2 font-display text-xl text-foreground">
            <FileSignature className="h-5 w-5 text-primary" aria-hidden />
            Assinatura eletrônica do paciente
          </h4>
          <p className="mt-1 text-xs text-muted-foreground">
            TCLE, plano de tratamento e orçamento assinados pelo celular, com código de verificação
            e QR de autenticidade (Lei 14.063/2020).
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRequestOpen(true)}
          className="inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <FileSignature className="h-4 w-4" aria-hidden /> Pedir assinatura
        </button>
      </div>

      {list.isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Carregando" />
        </div>
      ) : list.error ? (
        <p className="text-sm text-rose-600">{list.error.message}</p>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-6 text-center">
          <FileSignature className="mx-auto h-8 w-8 text-muted-foreground/60" aria-hidden />
          <p className="mt-2 text-sm font-semibold text-foreground">Nenhum pedido ainda</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Envie um PDF para o paciente assinar por link ou QR code no consultório.
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((row) => {
            const s = statusOf(row);
            const signed = signedAt(row);
            const pending =
              s.label !== "Assinado" && s.label !== "Revogado" && s.label !== "Expirado";
            return (
              <li
                key={row.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4 text-xs sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-foreground">
                      {DOC_LABELS[row.document_type]}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold",
                        TONES[s.tone],
                      )}
                    >
                      <s.Icon className="h-3 w-3" aria-hidden /> {s.label}
                    </span>
                  </div>
                  <p className="text-muted-foreground">
                    {row.signer_role === "responsavel_legal" ? "Responsável: " : ""}
                    {row.signer_name} · {row.channel === "qr" ? "QR no consultório" : "Link"} ·
                    pedido em {fmt(row.created_at)}
                  </p>
                  {signed && (
                    <p className="font-medium text-emerald-700">Assinado em {fmt(signed)}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {row.status === "signed" && (
                    <button
                      type="button"
                      onClick={() => {
                        const win = window.open("", "_blank");
                        if (win) win.opener = null;
                        download.mutate({ requestId: row.id, win });
                      }}
                      disabled={download.isPending}
                      className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 font-semibold text-foreground hover:bg-muted disabled:opacity-50"
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden /> PDF assinado
                    </button>
                  )}
                  {pending && (
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm("Revogar este pedido? O link deixará de funcionar.")) {
                          revoke.mutate(row.id);
                        }
                      }}
                      disabled={revoke.isPending}
                      className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-rose-200 px-3 font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                    >
                      <Ban className="h-3.5 w-3.5" aria-hidden /> Revogar
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <RequestDialog
        open={requestOpen}
        onOpenChange={(open) => {
          setRequestOpen(open);
          if (!open) onPrefillConsumed?.();
        }}
        patientId={patientId}
        hasGuardian={hasGuardian}
        prefill={prefill}
        onCreated={(result, channel) => {
          setRequestOpen(false);
          onPrefillConsumed?.();
          queryClient.invalidateQueries({ queryKey });
          if (channel === "qr") {
            setQr({ requestId: result.requestId, url: result.url, expiresAt: result.expiresAt });
          } else if (result.deliveredVia) {
            toast.success(
              `Link enviado por ${result.deliveredVia === "whatsapp" ? "WhatsApp" : "e-mail"}.`,
            );
          } else {
            setFallbackLink(result.url);
          }
        }}
      />

      <QrDialog qr={qr} row={qrRow} onClose={() => setQr(null)} />

      <Dialog open={Boolean(fallbackLink)} onOpenChange={(o) => !o && setFallbackLink(null)}>
        <DialogContent>
          <DialogTitle>Não foi possível enviar automaticamente</DialogTitle>
          <DialogDescription>
            O pedido foi criado, mas o WhatsApp/e-mail não aceitou a mensagem. Copie o link e envie
            ao paciente. Ele vale por 72 horas e só funciona com o código enviado ao contato
            cadastrado.
          </DialogDescription>
          <div className="mt-2 flex gap-2">
            <input
              readOnly
              value={fallbackLink ?? ""}
              aria-label="Link de assinatura"
              className="min-w-0 flex-1 rounded-lg border border-input bg-muted/40 px-3 py-2 font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(fallbackLink ?? "");
                toast.success("Link copiado.");
              }}
              className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground"
            >
              <Copy className="h-3.5 w-3.5" aria-hidden /> Copiar
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Choice<T extends string>({
  name,
  value,
  onChange,
  options,
}: {
  name: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; disabled?: boolean; hint?: string }[];
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
      {options.map((o) => (
        <label
          key={o.value}
          className={cn(
            "flex min-h-11 cursor-pointer items-start gap-2 rounded-xl border p-3 text-xs transition-colors",
            value === o.value
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/40",
            o.disabled && "cursor-not-allowed opacity-50",
          )}
        >
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            disabled={o.disabled}
            onChange={() => onChange(o.value)}
            className="mt-0.5 accent-[var(--primary)]"
          />
          <span>
            <span className="block font-semibold text-foreground">{o.label}</span>
            {o.hint && <span className="block text-muted-foreground">{o.hint}</span>}
          </span>
        </label>
      ))}
    </div>
  );
}

function RequestDialog({
  open,
  onOpenChange,
  patientId,
  hasGuardian,
  prefill,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  hasGuardian: boolean;
  prefill?: SignaturePrefill | null;
  onCreated: (
    result: Awaited<ReturnType<typeof createSignatureRequest>>,
    channel: "link" | "qr",
  ) => void;
}) {
  const [documentType, setDocumentType] = useState<SignatureDocumentType>("tcle");
  const [file, setFile] = useState<File | null>(null);
  const [signerRole, setSignerRole] = useState<"paciente" | "responsavel_legal">("paciente");
  const [channel, setChannel] = useState<"link" | "qr">("qr");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setFile(null);
    setSignerRole(hasGuardian ? "responsavel_legal" : "paciente");
    if (prefill) setDocumentType(prefill.documentType);
  }, [open, prefill, hasGuardian]);

  const pdf: Blob | null = prefill?.pdf ?? file;

  const create = useMutation({
    mutationFn: async () => {
      if (!pdf) throw new Error("Selecione o PDF do documento.");
      if (pdf.size > 5 * 1024 * 1024) throw new Error("O PDF deve ter no máximo 5 MB.");
      return createSignatureRequest({
        data: {
          patientId,
          documentType,
          signerRole,
          channel,
          pdfBase64: await blobToBase64(pdf),
        },
      });
    },
    onMutate: () => setError(null),
    onSuccess: (result) => onCreated(result, channel),
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogTitle>Pedir assinatura</DialogTitle>
        <DialogDescription>
          O documento é congelado no envio: qualquer alteração depois invalida a assinatura.
        </DialogDescription>

        <form
          className="mt-2 space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <fieldset className="space-y-2">
            <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Documento
            </legend>
            <Choice
              name="documentType"
              value={documentType}
              onChange={setDocumentType}
              options={SIGNATURE_DOCUMENT_TYPES.map((t) => ({ value: t, label: DOC_LABELS[t] }))}
            />
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Arquivo PDF
            </legend>
            {prefill ? (
              <p className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs font-semibold text-foreground">
                <FileSignature className="h-4 w-4 text-primary" aria-hidden /> {prefill.label}
              </p>
            ) : (
              <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-input p-3 text-xs hover:border-primary/50 focus-within:ring-2 focus-within:ring-primary/40">
                <Upload className="h-4 w-4 text-primary" aria-hidden />
                <span className="truncate font-semibold text-foreground">
                  {file ? file.name : "Selecionar PDF (até 5 MB)"}
                </span>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="sr-only"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
            )}
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Quem assina
            </legend>
            <Choice
              name="signerRole"
              value={signerRole}
              onChange={setSignerRole}
              options={[
                { value: "paciente", label: "Paciente" },
                {
                  value: "responsavel_legal",
                  label: "Responsável legal",
                  disabled: !hasGuardian,
                  hint: hasGuardian ? "Do cadastro do paciente" : "Cadastre um responsável antes",
                },
              ]}
            />
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Como assinar
            </legend>
            <Choice
              name="channel"
              value={channel}
              onChange={setChannel}
              options={[
                {
                  value: "qr",
                  label: "QR code agora",
                  hint: "Paciente no consultório · vale 15 min",
                },
                { value: "link", label: "Enviar link", hint: "WhatsApp ou e-mail · vale 72 h" },
              ]}
            />
          </fieldset>

          <p role="alert" className="min-h-4 text-xs font-medium text-rose-600">
            {error}
          </p>

          <button
            type="submit"
            disabled={create.isPending || !pdf}
            className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {create.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : channel === "qr" ? (
              <QrCode className="h-4 w-4" aria-hidden />
            ) : (
              <Send className="h-4 w-4" aria-hidden />
            )}
            {create.isPending
              ? "Preparando..."
              : channel === "qr"
                ? "Gerar QR code"
                : "Enviar link ao paciente"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function QrDialog({
  qr,
  row,
  onClose,
}: {
  qr: { requestId: string; url: string; expiresAt: string } | null;
  row?: SignatureRow;
  onClose: () => void;
}) {
  const [image, setImage] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!qr) return setImage(null);
    let cancelled = false;
    import("qrcode")
      .then(({ default: QRCode }) => QRCode.toDataURL(qr.url, { margin: 1, width: 320 }))
      .then((src) => !cancelled && setImage(src));
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [qr]);

  if (!qr) return null;
  const left = Math.max(0, Math.floor((new Date(qr.expiresAt).getTime() - now) / 1000));
  const signed = row?.status === "signed";
  // Spec S3: o QR some da tela assim que é escaneado (opened_at) ou expira.
  const showQr = !signed && !row?.opened_at && left > 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="text-center">
        <DialogTitle>
          {signed
            ? "Documento assinado"
            : showQr
              ? "Peça ao paciente para escanear"
              : left === 0 && !row?.opened_at
                ? "QR code expirado"
                : "Paciente assinando no celular"}
        </DialogTitle>
        <DialogDescription>
          {signed
            ? `Assinatura registrada em ${fmt(signedAt(row!) ?? new Date().toISOString())}.`
            : showQr
              ? "Com a câmera do próprio celular. O código de verificação vai para o contato cadastrado."
              : left === 0 && !row?.opened_at
                ? "Gere um novo pedido se o paciente ainda for assinar."
                : row?.otp_verified_at
                  ? "Identidade confirmada. Aguardando a assinatura..."
                  : "Link aberto. Aguardando o código de verificação..."}
        </DialogDescription>

        <div className="mx-auto mt-2 flex h-72 w-72 items-center justify-center rounded-2xl border border-border bg-white">
          {signed ? (
            <CheckCircle2 className="h-24 w-24 text-emerald-600" aria-hidden />
          ) : showQr ? (
            image ? (
              <img src={image} alt="QR code para assinar o documento" className="h-64 w-64" />
            ) : (
              <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Gerando QR" />
            )
          ) : left === 0 && !row?.opened_at ? (
            <Clock className="h-20 w-20 text-muted-foreground" aria-hidden />
          ) : (
            <Loader2 className="h-12 w-12 animate-spin text-primary" aria-label="Aguardando" />
          )}
        </div>

        {showQr && (
          <p className="mt-2 font-mono text-sm text-muted-foreground" aria-live="off">
            Expira em {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
          </p>
        )}
        <button
          type="button"
          onClick={onClose}
          className="mt-4 inline-flex min-h-11 w-full cursor-pointer items-center justify-center rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted"
        >
          {signed ? "Concluir" : "Fechar"}
        </button>
      </DialogContent>
    </Dialog>
  );
}
