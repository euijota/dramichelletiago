import { CLINIC } from "@/lib/clinic";

export interface SendClinicalEmailParams {
  idempotencyKey: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendClinicalEmailResult {
  status: "accepted" | "retryable" | "permanent" | "uncertain";
  providerId?: string;
  errorCategory?: string;
  retryAfterSeconds?: number;
}

/**
 * Adaptador de e-mail de notificações clínicas via Resend API.
 * Suporta Idempotency-Key estável, timeout explícito de 10s e categorização determinística de erros.
 */
export async function sendClinicalEmail({
  idempotencyKey,
  subject,
  html,
  text,
}: SendClinicalEmailParams): Promise<SendClinicalEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return {
      status: "retryable",
      errorCategory: "configuration_unavailable",
    };
  }

  const fromAddress =
    process.env.CLINICAL_FROM_EMAIL || "Agenda Dra. Michelle <onboarding@resend.dev>";
  const toAddress = process.env.CLINICAL_ALERT_EMAIL || CLINIC.email;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        from: fromAddress,
        to: [toAddress],
        subject,
        html,
        text,
      }),
    });

    if (res.ok) {
      const data = (await res.json().catch(() => ({}))) as { id?: string };
      return {
        status: "accepted",
        providerId: data.id || "resend-accepted",
      };
    }

    // Tratamento de cabeçalho Retry-After
    const retryAfterHeader = res.headers.get("retry-after");
    let retryAfterSeconds: number | undefined;
    if (retryAfterHeader) {
      const parsed = parseInt(retryAfterHeader, 10);
      if (!isNaN(parsed) && parsed > 0) {
        retryAfterSeconds = parsed;
      }
    }

    if (res.status === 429 || res.status >= 500) {
      return {
        status: "retryable",
        errorCategory: "provider_retryable",
        retryAfterSeconds,
      };
    }

    // 4xx permanente (exceto rate limit)
    return {
      status: "permanent",
      errorCategory: "provider_permanent",
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[sendClinicalEmail] Falha de transporte/timeout (${idempotencyKey}):`, msg);
    return {
      status: "uncertain",
      errorCategory: "provider_uncertain",
    };
  }
}
