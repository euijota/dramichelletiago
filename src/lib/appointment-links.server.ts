import crypto from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export function generateRandomLinkToken(): { rawToken: string; tokenHash: string } {
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  return { rawToken, tokenHash };
}

export function hashLinkToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Emite um novo token aleatório com registro por hash SHA-256 no banco (Opção B).
 * Revoga automaticamente links anteriores da mesma consulta.
 */
export async function issueRevocableAppointmentLink(appointmentId: string): Promise<{
  token: string;
  confirmUrl: string;
  cancelUrl: string;
  expiresAt: string;
  snapshot: {
    patient_name: string;
    patient_phone: string | null;
    appointment_date: string;
    appointment_time: string;
  };
}> {
  const { rawToken, tokenHash } = generateRandomLinkToken();
  const baseUrl = "https://dramichelletiago.com.br";

  const { data, error } = await (supabaseAdmin.rpc as any)("clinical_issue_appointment_link", {
    p_appointment_id: appointmentId,
    p_token_hash: tokenHash,
  });

  if (error || !data || data.code !== "ok") {
    throw new Error(
      `Não foi possível emitir o link: ${data?.code || error?.message || "erro desconhecido"}`,
    );
  }

  return {
    token: rawToken,
    confirmUrl: `${baseUrl}/confirmar/${rawToken}`,
    cancelUrl: `${baseUrl}/cancelar/${rawToken}`,
    expiresAt: data.expires_at,
    snapshot: data.snapshot,
  };
}
