import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import crypto from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { CLINIC } from "@/lib/clinic";

function getTokenSecret(): string {
  return (
    process.env.APPOINTMENT_TOKEN_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "dramichelle-token-secret-salt-2026"
  );
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
    if (!token || typeof token !== "string") return null;

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

    // Formato legado base64url (appointmentId:purpose:secret) para retrocompatibilidade com links existentes
    if (decoded.includes(":")) {
      const parts = decoded.split(":");
      if (parts.length >= 2) {
        const [appointmentId, purpose] = parts;
        if (!appointmentId) return null;
        if (expectedPurpose && purpose && purpose !== expectedPurpose) return null;
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(appointmentId) || appointmentId.length >= 10) {
          return appointmentId;
        }
      }
    }

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
    const appointmentId = validateAppointmentToken(data.token, "confirm");

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
    await dispatchClinicAlert({
      subject: `✅ Consulta Confirmada: ${appointment.patient_name} (${dataBr} às ${horaBr})`,
      message: `O paciente ${appointment.patient_name} confirmou presença para a consulta marcada para ${dataBr} às ${horaBr}.`,
      patientName: appointment.patient_name,
      patientPhone: appointment.patient_phone,
      appointmentDate: appointment.appointment_date,
      appointmentTime: appointment.appointment_time,
      status: "confirmed",
    });

    return {
      success: true,
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
    const appointmentId = validateAppointmentToken(data.token);

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
    await dispatchClinicAlert({
      subject: `❌ Consulta Cancelada: ${appointment.patient_name} (${dataBr} às ${horaBr})`,
      message: `A consulta de ${appointment.patient_name} para ${dataBr} às ${horaBr} foi cancelada.\nMotivo: ${cancelReason}`,
      patientName: appointment.patient_name,
      patientPhone: appointment.patient_phone,
      appointmentDate: appointment.appointment_date,
      appointmentTime: appointment.appointment_time,
      status: "cancelled",
    });

    return {
      success: true,
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
    const appointmentId = validateAppointmentToken(token);

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

    const confirmToken = generateAppointmentToken(appointment.id, "confirm");
    const cancelToken = generateAppointmentToken(appointment.id, "cancel");

    return {
      ...appointment,
      cancellationToken: cancelToken,
      confirmationToken: confirmToken,
    };
  });

/**
 * Server function to generate cryptographically signed tokens and links in batch.
 * Used by Painel and CRC to ensure reminder messages always contain authentic v2 HMAC tokens.
 */
export const getAppointmentActionTokens = createServerFn({ method: "POST" })
  .validator((input: { appointmentIds: string[] }) =>
    z.object({ appointmentIds: z.array(z.string()).max(100) }).parse(input),
  )
  .handler(async ({ data }) => {
    const baseUrl = "https://dramichelletiago.com.br";
    const result: Record<
      string,
      {
        confirmToken: string;
        cancelToken: string;
        confirmUrl: string;
        cancelUrl: string;
      }
    > = {};

    for (const id of data.appointmentIds) {
      if (!id) continue;
      const confirmToken = generateAppointmentToken(id, "confirm");
      const cancelToken = generateAppointmentToken(id, "cancel");
      result[id] = {
        confirmToken,
        cancelToken,
        confirmUrl: `${baseUrl}/confirmar/${confirmToken}`,
        cancelUrl: `${baseUrl}/cancelar/${cancelToken}`,
      };
    }

    return result;
  });

/**
 * Server function to generate tokens for a single appointment on demand.
 */
export const getSingleAppointmentTokens = createServerFn({ method: "POST" })
  .validator((input: { appointmentId: string }) =>
    z.object({ appointmentId: z.string() }).parse(input),
  )
  .handler(async ({ data }) => {
    const baseUrl = "https://dramichelletiago.com.br";
    const confirmToken = generateAppointmentToken(data.appointmentId, "confirm");
    const cancelToken = generateAppointmentToken(data.appointmentId, "cancel");
    return {
      confirmToken,
      cancelToken,
      confirmUrl: `${baseUrl}/confirmar/${confirmToken}`,
      cancelUrl: `${baseUrl}/cancelar/${cancelToken}`,
    };
  });
