import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import crypto from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireAdmin } from "@/integrations/supabase/auth-middleware";
import { CLINIC } from "@/lib/clinic";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TOKEN_LENGTH = 512;

/**
 * Segredo HMAC exclusivo do servidor. Falha fechada: sem segredo configurado,
 * nenhum token é emitido nem aceito (não existe valor padrão embutido no código).
 */
function getTokenSecret(): string {
  const secret = process.env.APPOINTMENT_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || secret.length < 32) {
    throw new Error("APPOINTMENT_TOKEN_SECRET não configurado no servidor.");
  }
  return secret;
}

function signTokenData(data: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(data).digest("base64url");
}

function verifySignature(data: string, signature: string, secret: string): boolean {
  try {
    const expected = signTokenData(data, secret);
    const expectedBuf = Buffer.from(expected);
    const actualBuf = Buffer.from(signature);
    if (expectedBuf.length !== actualBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, actualBuf);
  } catch {
    return false;
  }
}

/**
 * Generates a cryptographically signed HMAC-SHA256 token for an appointment (cancellation or confirmation).
 * Token format: v2.<appointmentId>.<purpose>.<expiresAt>.<nonce>.<signature>
 * Cannot be forged without server secret and expires automatically.
 */
export function generateAppointmentToken(
  appointmentId: string,
  purpose: "confirm" | "cancel" = "confirm",
  expiryDays = 30,
): string {
  if (!UUID_REGEX.test(appointmentId)) {
    throw new Error("ID de agendamento inválido.");
  }
  const secret = getTokenSecret();
  const expiresAt = Date.now() + expiryDays * 24 * 60 * 60 * 1000;
  const nonce = crypto.randomBytes(12).toString("base64url");
  const dataToSign = `v2:${appointmentId}:${purpose}:${expiresAt}:${nonce}`;
  const signature = signTokenData(dataToSign, secret);

  const tokenPayload = `v2.${appointmentId}.${purpose}.${expiresAt}.${nonce}.${signature}`;
  return Buffer.from(tokenPayload).toString("base64url");
}

/**
 * @deprecated Use generateAppointmentToken instead
 */
export function generateCancellationToken(appointmentId: string): string {
  return generateAppointmentToken(appointmentId, "cancel");
}

/**
 * Decodes, verifies signature and checks expiration of an appointment token.
 * Returns appointmentId ONLY if the token is valid, signed, and not expired.
 */
export function validateAppointmentToken(
  token: string,
  expectedPurpose?: "confirm" | "cancel",
): string | null {
  try {
    if (!token || typeof token !== "string" || token.length > MAX_TOKEN_LENGTH) return null;

    let decoded = "";
    try {
      decoded = Buffer.from(token, "base64url").toString("utf-8");
    } catch {
      return null;
    }

    // Formato v2 assinado: v2.<appointmentId>.<purpose>.<expiresAt>.<nonce>.<signature>
    if (decoded.startsWith("v2.")) {
      const parts = decoded.split(".");
      if (parts.length !== 6) return null;

      const [, appointmentId, purpose, expStr, nonce, signature] = parts;
      if (!appointmentId || !purpose || !expStr || !nonce || !signature) return null;
      if (!UUID_REGEX.test(appointmentId)) return null;
      if (purpose !== "confirm" && purpose !== "cancel") return null;

      if (expectedPurpose && purpose !== expectedPurpose) return null;

      const expiresAt = Number(expStr);
      if (isNaN(expiresAt) || Date.now() > expiresAt) {
        return null; // Expirado
      }

      const secret = getTokenSecret();
      const dataToSign = `v2:${appointmentId}:${purpose}:${expStr}:${nonce}`;
      const isValid = verifySignature(dataToSign, signature, secret);

      return isValid ? appointmentId : null;
    }

    // Formatos legados (sem assinatura) são recusados: conhecer o ID da consulta
    // não pode bastar para ler dados, confirmar ou cancelar.
    return null;
  } catch {
    return null;
  }
}

/**
 * @deprecated Use validateAppointmentToken instead
 */
export function validateCancellationToken(token: string): string | null {
  return validateAppointmentToken(token, "cancel");
}

/**
 * Resolve o ID do agendamento a partir de um token HMAC v2 ou token revogável (Opção B).
 * Permite convivência transparente entre links já enviados no WhatsApp e o novo core do banco.
 */
export async function resolveAppointmentIdFromToken(
  token: string,
  expectedPurpose?: "confirm" | "cancel",
): Promise<string | null> {
  // 1. Tenta validação síncrona HMAC v2 (formato: v2.<id>.<purpose>.<exp>.<nonce>.<sig>)
  const hmacId = validateAppointmentToken(token, expectedPurpose);
  if (hmacId) return hmacId;

  // 2. Tenta token revogável Opção B (hash SHA-256 no banco)
  if (token && typeof token === "string" && token.length >= 32 && !token.includes(".")) {
    try {
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const { data, error } = await supabaseAdmin
        .from("appointment_link_tokens")
        .select("appointment_id, allowed_actions, expires_at, revoked_at")
        .eq("token_hash", tokenHash)
        .is("revoked_at", null)
        .maybeSingle();

      if (error || !data) return null;
      const row = data as {
        appointment_id: string;
        allowed_actions: string[];
        expires_at: string;
        revoked_at: string | null;
      };
      if (new Date(row.expires_at) <= new Date()) return null;
      if (expectedPurpose && !row.allowed_actions?.includes(expectedPurpose)) return null;

      return row.appointment_id;
    } catch {
      return null;
    }
  }

  return null;
}

async function dispatchClinicAlert({
  subject,
  message,
  patientName,
  patientPhone,
  appointmentDate,
  appointmentTime,
  status,
}: {
  subject: string;
  message: string;
  patientName: string;
  patientPhone?: string | null;
  appointmentDate: string;
  appointmentTime: string;
  status: "confirmed" | "cancelled";
}) {
  const channelsSent: string[] = [];
  const errors: string[] = [];

  // 1. Notificação WhatsApp via Webhook se configurado com timeout explícito
  if (process.env.WHATSAPP_WEBHOOK_URL) {
    try {
      const res = await fetch(process.env.WHATSAPP_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(8000),
        body: JSON.stringify({
          phone: CLINIC.whatsapp,
          event: status === "confirmed" ? "appointment_confirmed" : "appointment_cancelled",
          subject,
          text: message,
          patientName,
          patientPhone,
          appointmentDate,
          appointmentTime,
        }),
      });
      if (res.ok) {
        channelsSent.push("whatsapp_webhook");
      } else {
        const errText = await res.text().catch(() => "");
        errors.push(`WhatsApp Webhook HTTP ${res.status}: ${errText.slice(0, 100)}`);
        console.warn(`[dispatchClinicAlert] WhatsApp webhook HTTP ${res.status}:`, errText);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`WhatsApp Webhook Error: ${msg}`);
      console.warn("[dispatchClinicAlert] WhatsApp webhook warning:", msg);
    }
  }

  // 2. Notificação por E-mail: Resend primário (se configurado) com timeout
  let emailDelivered = false;
  if (process.env.RESEND_API_KEY) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(8000),
        body: JSON.stringify({
          from: "Agenda Dra. Michelle <onboarding@resend.dev>",
          to: [CLINIC.email],
          subject,
          text: message,
        }),
      });
      if (res.ok) {
        emailDelivered = true;
        channelsSent.push("resend_email");
      } else {
        const errText = await res.text().catch(() => "");
        errors.push(`Resend HTTP ${res.status}: ${errText.slice(0, 100)}`);
        console.warn(`[dispatchClinicAlert] Resend HTTP ${res.status}:`, errText);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`Resend Error: ${msg}`);
      console.warn("[dispatchClinicAlert] Resend warning:", msg);
    }
  }

  // 3. Fallback de e-mail via FormSubmit se o Resend não entregou
  if (!emailDelivered) {
    try {
      const res = await fetch(`https://formsubmit.co/ajax/${CLINIC.email}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Origin: "https://dramichelletiago.com.br",
          Referer: "https://dramichelletiago.com.br",
        },
        signal: AbortSignal.timeout(8000),
        body: JSON.stringify({
          _subject: subject,
          _template: "table",
          _captcha: "false",
          Status: status === "confirmed" ? "CONFIRMADO" : "CANCELADO",
          Paciente: patientName,
          Telefone: patientPhone || "Não informado",
          Data: appointmentDate,
          Horario: appointmentTime,
          Mensagem: message,
        }),
      });
      if (res.ok) {
        emailDelivered = true;
        channelsSent.push("formsubmit_email");
      } else {
        const errText = await res.text().catch(() => "");
        errors.push(`FormSubmit HTTP ${res.status}: ${errText.slice(0, 100)}`);
        console.warn(`[dispatchClinicAlert] FormSubmit HTTP ${res.status}:`, errText);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`FormSubmit Error: ${msg}`);
      console.warn("[dispatchClinicAlert] FormSubmit warning:", msg);
    }
  }

  // 4. Fallback final via Formspree se nenhum outro e-mail teve sucesso
  if (!emailDelivered) {
    try {
      const res = await fetch("https://formspree.io/f/xbjnqpyz", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
        body: JSON.stringify({
          _replyto: "consultorio@dramichelletiago.com.br",
          subject,
          message,
          patientName,
          patientPhone: patientPhone || "Não informado",
          status,
          appointmentDate,
          appointmentTime,
        }),
      });
      if (res.ok) {
        emailDelivered = true;
        channelsSent.push("formspree_email");
      } else {
        const errText = await res.text().catch(() => "");
        errors.push(`Formspree HTTP ${res.status}: ${errText.slice(0, 100)}`);
        console.warn(`[dispatchClinicAlert] Formspree HTTP ${res.status}:`, errText);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`Formspree Error: ${msg}`);
      console.warn("[dispatchClinicAlert] Formspree warning:", msg);
    }
  }

  return {
    delivered: channelsSent.length > 0,
    channelsSent,
    errors,
  };
}

const cancelAppointmentSchema = z.object({
  token: z.string().min(10),
  reason: z.string().max(500).optional(),
});

const confirmAppointmentSchema = z.object({
  token: z.string().min(10),
});

/**
 * Confirms an appointment using a cryptographically verified confirmation token.
 * Updates status to 'confirmed', records confirmed_at and dispatches alerts to clinic.
 */
export const confirmAppointmentByToken = createServerFn({ method: "POST" })
  .validator((input) => confirmAppointmentSchema.parse(input))
  .handler(async ({ data }) => {
    const appointmentId = await resolveAppointmentIdFromToken(data.token, "confirm");

    if (!appointmentId) {
      throw new Error("Token de confirmação inválido ou expirado.");
    }

    // Busca agendamento para verificar integridade e regras de negócio
    const { data: appointment, error: fetchError } = await supabaseAdmin
      .from("appointments")
      .select("id, status, appointment_date, appointment_time, patient_name, patient_phone, notes")
      .eq("id", appointmentId)
      .maybeSingle();

    if (fetchError || !appointment) {
      throw new Error("Agendamento não encontrado.");
    }

    if (appointment.status === "cancelled") {
      throw new Error("Este agendamento foi cancelado e não pode ser confirmado.");
    }

    if (appointment.status === "confirmed") {
      return {
        success: true,
        alreadyConfirmed: true,
        appointment: {
          date: appointment.appointment_date,
          time: appointment.appointment_time,
          name: appointment.patient_name,
        },
      };
    }

    if (appointment.status === "completed") {
      throw new Error("Este agendamento já foi concluído.");
    }

    // Impede confirmação de consultas que já passaram
    const now = new Date();
    const appointmentDateTime = new Date(
      `${appointment.appointment_date}T${appointment.appointment_time}`,
    );

    if (appointmentDateTime < now) {
      throw new Error("Não é possível confirmar um agendamento que já passou.");
    }

    // Atualiza status do agendamento com supabaseAdmin
    const { error: updateError } = await supabaseAdmin
      .from("appointments")
      .update({
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", appointmentId);

    if (updateError) {
      throw new Error(`Erro ao confirmar agendamento: ${updateError.message}`);
    }

    // Dispara alerta real de confirmação para a Dra. Michelle / consultório
    const dataBr = appointment.appointment_date.split("-").reverse().join("/");
    const horaBr = appointment.appointment_time.slice(0, 5);
    const alertResult = await dispatchClinicAlert({
      subject: `✅ Consulta Confirmada: ${appointment.patient_name} (${dataBr} às ${horaBr})`,
      message: `O paciente ${appointment.patient_name} confirmou presença para a consulta marcada para ${dataBr} às ${horaBr}.`,
      patientName: appointment.patient_name,
      patientPhone: appointment.patient_phone,
      appointmentDate: appointment.appointment_date,
      appointmentTime: appointment.appointment_time,
      status: "confirmed",
    });

    if (!alertResult.delivered) {
      console.error(
        `[clinic-alert] Nenhum canal aceitou o aviso (${appointmentId}):`,
        alertResult.errors.join(" | "),
      );
    }

    return {
      success: true,
      clinicNotified: alertResult.delivered,
      appointment: {
        date: appointment.appointment_date,
        time: appointment.appointment_time,
        name: appointment.patient_name,
      },
    };
  });

/**
 * Cancels an appointment using a cryptographically verified cancellation token.
 * Updates status to 'cancelled', preserves existing notes, and dispatches clinic alert.
 */
export const cancelAppointmentByToken = createServerFn({ method: "POST" })
  .validator((input) => cancelAppointmentSchema.parse(input))
  .handler(async ({ data }) => {
    const appointmentId = await resolveAppointmentIdFromToken(data.token, "cancel");

    if (!appointmentId) {
      throw new Error("Token de cancelamento inválido ou expirado.");
    }

    const { data: appointment, error: fetchError } = await supabaseAdmin
      .from("appointments")
      .select("id, status, appointment_date, appointment_time, patient_name, patient_phone, notes")
      .eq("id", appointmentId)
      .maybeSingle();

    if (fetchError || !appointment) {
      throw new Error("Agendamento não encontrado.");
    }

    if (appointment.status === "cancelled") {
      throw new Error("Este agendamento já foi cancelado anteriormente.");
    }

    const now = new Date();
    const appointmentDateTime = new Date(
      `${appointment.appointment_date}T${appointment.appointment_time}`,
    );

    if (appointmentDateTime < now) {
      throw new Error("Não é possível cancelar um agendamento que já passou.");
    }

    // Preserva as observações anteriores (protocolo, histórico) e adiciona o registro de cancelamento
    const existingNotes = appointment.notes?.trim() || "";
    const cancelReason = data.reason?.trim() || "Cancelado pelo paciente via link de confirmação";
    const cancelStamp = `[CANCELADO em ${new Date().toLocaleDateString("pt-BR")}] Motivo: ${cancelReason}`;
    const preservedNotes = existingNotes ? `${existingNotes}\n${cancelStamp}` : cancelStamp;

    const { error: updateError } = await supabaseAdmin
      .from("appointments")
      .update({
        status: "cancelled",
        notes: preservedNotes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", appointmentId);

    if (updateError) {
      throw new Error(`Erro ao cancelar agendamento: ${updateError.message}`);
    }

    // Dispara alerta real de cancelamento para o consultório
    const dataBr = appointment.appointment_date.split("-").reverse().join("/");
    const horaBr = appointment.appointment_time.slice(0, 5);
    const alertResult = await dispatchClinicAlert({
      subject: `❌ Consulta Cancelada: ${appointment.patient_name} (${dataBr} às ${horaBr})`,
      message: `A consulta de ${appointment.patient_name} para ${dataBr} às ${horaBr} foi cancelada.\nMotivo: ${cancelReason}`,
      patientName: appointment.patient_name,
      patientPhone: appointment.patient_phone,
      appointmentDate: appointment.appointment_date,
      appointmentTime: appointment.appointment_time,
      status: "cancelled",
    });

    if (!alertResult.delivered) {
      console.error(
        `[clinic-alert] Nenhum canal aceitou o aviso (${appointmentId}):`,
        alertResult.errors.join(" | "),
      );
    }

    return {
      success: true,
      clinicNotified: alertResult.delivered,
      appointment: {
        date: appointment.appointment_date,
        time: appointment.appointment_time,
        name: appointment.patient_name,
      },
    };
  });

/**
 * Gets appointment details by cancellation token (for preview before cancellation).
 * Only returns details if the token signature is cryptographically valid.
 */
export const getAppointmentByToken = createServerFn({ method: "GET" })
  .validator((token: string) => z.string().min(10).parse(token))
  .handler(async ({ data: token }) => {
    const appointmentId = await resolveAppointmentIdFromToken(token);

    if (!appointmentId) {
      return null;
    }

    const { data: appointment, error } = await supabaseAdmin
      .from("appointments")
      .select("id, appointment_date, appointment_time, patient_name, status, service_name")
      .eq("id", appointmentId)
      .maybeSingle();

    if (error || !appointment) {
      return null;
    }

    // Não emite tokens novos aqui: quem possui o link não pode renovar a própria validade.
    // O mesmo token (já validado) serve para as ações permitidas nesta página.
    return {
      ...appointment,
      cancellationToken: token,
      confirmationToken: token,
    };
  });

const PUBLIC_BASE_URL = "https://dramichelletiago.com.br";
const ISSUABLE_STATUSES = ["pending", "confirmed"] as const;

type IssuedAppointmentTokens = {
  confirmToken: string;
  cancelToken: string;
  confirmUrl: string;
  cancelUrl: string;
};

function buildIssuedTokens(appointmentId: string): IssuedAppointmentTokens {
  const confirmToken = generateAppointmentToken(appointmentId, "confirm");
  const cancelToken = generateAppointmentToken(appointmentId, "cancel");
  return {
    confirmToken,
    cancelToken,
    confirmUrl: `${PUBLIC_BASE_URL}/confirmar/${confirmToken}`,
    cancelUrl: `${PUBLIC_BASE_URL}/cancelar/${cancelToken}`,
  };
}

function isUpcoming(appointmentDate: string, appointmentTime: string): boolean {
  // Horário da clínica (Macapá, UTC-3, sem horário de verão)
  const startsAt = new Date(`${appointmentDate}T${appointmentTime.slice(0, 8)}-03:00`);
  return !isNaN(startsAt.getTime()) && startsAt.getTime() > Date.now();
}

/**
 * Emite tokens assinados em lote para o painel/CRC.
 * Exige sessão válida com papel admin (requireAdmin) e só emite para consultas
 * existentes, futuras e em estado pendente/confirmado. IDs desconhecidos são ignorados.
 */
export const getAppointmentActionTokens = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: { appointmentIds: string[] }) =>
    z.object({ appointmentIds: z.array(z.string().max(64)).max(100) }).parse(input),
  )
  .handler(async ({ data }) => {
    const result: Record<string, IssuedAppointmentTokens> = {};
    // IDs fora do formato UUID são ignorados em vez de derrubar o lote inteiro
    const ids = Array.from(new Set(data.appointmentIds)).filter((id) => UUID_REGEX.test(id));
    if (ids.length === 0) return result;

    const { data: appointments, error } = await supabaseAdmin
      .from("appointments")
      .select("id, status, appointment_date, appointment_time")
      .in("id", ids)
      .in("status", [...ISSUABLE_STATUSES]);

    if (error) {
      throw new Error("Não foi possível emitir os links agora. Tente novamente.");
    }

    for (const apt of appointments ?? []) {
      if (!isUpcoming(apt.appointment_date, apt.appointment_time)) continue;
      result[apt.id] = buildIssuedTokens(apt.id);
    }

    return result;
  });

/**
 * Emite tokens para uma única consulta, sob as mesmas regras do lote.
 */
export const getSingleAppointmentTokens = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: { appointmentId: string }) =>
    z.object({ appointmentId: z.string().regex(UUID_REGEX) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { data: apt, error } = await supabaseAdmin
      .from("appointments")
      .select("id, status, appointment_date, appointment_time")
      .eq("id", data.appointmentId)
      .maybeSingle();

    if (error) {
      throw new Error("Não foi possível emitir o link agora. Tente novamente.");
    }
    if (
      !apt ||
      !(ISSUABLE_STATUSES as readonly string[]).includes(apt.status) ||
      !isUpcoming(apt.appointment_date, apt.appointment_time)
    ) {
      throw new Error("Esta consulta não está elegível para envio de link.");
    }

    return buildIssuedTokens(apt.id);
  });
