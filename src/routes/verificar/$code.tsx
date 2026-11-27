import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BadgeCheck,
  FileCheck2,
  FileWarning,
  Loader2,
  SearchX,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { CLINIC } from "@/lib/clinic";
import { cn } from "@/lib/utils";
import { verifySignaturePublic } from "@/lib/signature";

export const Route = createFileRoute("/verificar/$code")({
  head: () => ({
    meta: [
      { title: `Verificar assinatura - ${CLINIC.name}` },
      {
        name: "description",
        content: "Confira a autenticidade de um documento assinado eletronicamente",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: VerifyPage,
});

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

type FileCheck = "signed" | "original" | "different" | null;

function VerifyPage() {
  const { code } = Route.useParams();
  const query = useQuery({
    queryKey: ["verify-signature", code],
    queryFn: () => verifySignaturePublic({ data: code }),
    retry: false,
    refetchOnWindowFocus: false,
  });

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="container mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-16">
        <div className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
          {query.isLoading ? (
            <div className="flex flex-col items-center py-10" aria-busy="true">
              <Loader2 className="h-10 w-10 animate-spin text-primary" aria-hidden />
              <p className="mt-4 text-sm text-muted-foreground">Consultando assinatura...</p>
            </div>
          ) : query.data?.found ? (
            <Found result={query.data} />
          ) : (
            <div className="text-center">
              <SearchX className="mx-auto h-14 w-14 text-rose-600" aria-hidden />
              <h1 className="mt-5 font-display text-2xl text-foreground">
                {query.error ? "Não foi possível consultar" : "Assinatura não encontrada"}
              </h1>
              <p className="mt-3 text-sm text-muted-foreground">
                {query.error?.message.startsWith("Muitas tentativas")
                  ? query.error.message
                  : query.error
                    ? "Tente novamente em instantes."
                    : "Este código não corresponde a nenhum documento assinado no consultório. Confira se o endereço foi digitado corretamente."}
              </p>
            </div>
          )}
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Esta página confirma apenas a existência e a integridade da assinatura. O conteúdo do
          documento é sigiloso e não é exibido aqui.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}

function Found({
  result,
}: {
  result: Extract<Awaited<ReturnType<typeof verifySignaturePublic>>, { found: true }>;
}) {
  const [check, setCheck] = useState<FileCheck>(null);
  const [checking, setChecking] = useState(false);
  const when = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Belem",
    dateStyle: "long",
    timeStyle: "medium",
  }).format(new Date(result.signedAt));

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setChecking(true);
    try {
      // Conferência 100% no navegador: o arquivo não é enviado a lugar nenhum.
      const hash = await sha256Hex(file);
      setCheck(
        hash === result.signedPdfSha256
          ? "signed"
          : hash === result.documentSha256
            ? "original"
            : "different",
      );
    } finally {
      setChecking(false);
    }
  };

  return (
    <>
      <div className="text-center">
        <BadgeCheck className="mx-auto h-14 w-14 text-emerald-600" aria-hidden />
        <h1 className="mt-5 font-display text-2xl text-foreground sm:text-3xl">
          Assinatura válida
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Documento assinado eletronicamente no consultório da {CLINIC.name}.
        </p>
      </div>

      <dl className="mt-6 grid gap-4 rounded-2xl bg-muted/50 p-5 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Documento
          </dt>
          <dd className="mt-1 font-semibold text-foreground">{result.documentLabel}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {result.signerRole === "responsavel_legal" ? "Responsável legal" : "Assinado por"}
          </dt>
          <dd className="mt-1 font-semibold text-foreground">{result.signerNameMasked}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Data e hora (Macapá)
          </dt>
          <dd className="mt-1 text-foreground">{when}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Hash SHA-256 do PDF assinado
          </dt>
          <dd className="mt-1 break-all font-mono text-xs text-foreground">
            {result.signedPdfSha256}
          </dd>
        </div>
      </dl>

      <section className="mt-6 rounded-2xl border border-border p-5" aria-labelledby="check-title">
        <h2 id="check-title" className="flex items-center gap-2 font-semibold text-foreground">
          <ShieldCheck className="h-5 w-5 text-primary" aria-hidden /> Conferir um arquivo
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Tem o PDF em mãos? Selecione-o para saber se é exatamente o que foi assinado. A
          conferência acontece no seu aparelho; o arquivo não é enviado.
        </p>
        <label
          className={cn(
            "mt-4 flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-full border border-primary/40 px-5 text-sm font-semibold text-primary transition-colors hover:bg-primary/5",
            "focus-within:ring-2 focus-within:ring-primary/40",
          )}
        >
          {checking ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Upload className="h-4 w-4" aria-hidden />
          )}
          {checking ? "Conferindo..." : "Selecionar PDF"}
          <input
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </label>

        <div aria-live="polite">
          {check === "signed" && (
            <p className="mt-4 flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
              <FileCheck2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              Arquivo idêntico ao documento assinado. Nenhuma alteração.
            </p>
          )}
          {check === "original" && (
            <p className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
              <FileCheck2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              Este é o documento original, antes da assinatura (sem a página de manifesto). O
              conteúdo é o mesmo que foi assinado.
            </p>
          )}
          {check === "different" && (
            <p className="mt-4 flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">
              <FileWarning className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              Este arquivo é diferente do documento assinado. Pode ter sido alterado ou ser outro
              documento.
            </p>
          )}
        </div>
      </section>
    </>
  );
}
