import { z } from "zod";
import { CLINIC } from "@/lib/clinic";

export const clinicalEmailPayloadSchema = z.object({
  from: z.string().min(3),
  to: z.array(z.string().email()).length(1),
  subject: z.string().min(1),
  html: z.string().min(1),
  text: z.string().min(1),
  template_version: z.literal(1),
});
export type ClinicalEmailPayload = z.infer<typeof clinicalEmailPayloadSchema>;
export interface SendClinicalEmailResult {
  status: "accepted" | "retryable" | "permanent" | "uncertain";
  providerId?: string;
  errorCategory?: string;
  retryAfterSeconds?: number;
}

export function getClinicalEmailConfiguration() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.CLINICAL_EMAIL_FROM || process.env.CLINICAL_FROM_EMAIL;
  const to = process.env.CLINICAL_EMAIL_TO || process.env.CLINICAL_ALERT_EMAIL || CLINIC.email;
  if (!apiKey || !from || !z.string().email().safeParse(to).success) {
    throw new Error("Serviço de e-mail não configurado.");
  }
  return { apiKey, from, to };
}

export async function sendClinicalEmail(
  payload: ClinicalEmailPayload,
  idempotencyKey: string,
): Promise<SendClinicalEmailResult> {
  const { apiKey } = getClinicalEmailConfiguration();
  const { template_version: _version, ...body } = clinicalEmailPayloadSchema.parse(payload);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify(body),
    });
    const result = (await response.json().catch(() => null)) as {
      id?: string;
      name?: string;
    } | null;
    if (response.ok) {
      return result?.id
        ? { status: "accepted", providerId: result.id }
        : { status: "uncertain", errorCategory: "provider_uncertain" };
    }
    const retryAfter = response.headers.get("retry-after");
    const seconds =
      retryAfter && /^\d+$/.test(retryAfter)
        ? Number(retryAfter)
        : retryAfter
          ? Math.ceil((Date.parse(retryAfter) - Date.now()) / 1000)
          : NaN;
    if (
      response.status === 429 ||
      response.status >= 500 ||
      (response.status === 409 && result?.name === "concurrent_idempotent_requests")
    ) {
      return {
        status: "retryable",
        errorCategory: "provider_retryable",
        retryAfterSeconds:
          Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 2147483647) : undefined,
      };
    }
    return { status: "permanent", errorCategory: "provider_permanent" };
  } catch {
    return { status: "uncertain", errorCategory: "provider_uncertain" };
  }
}
