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
  // 1. Notificação WhatsApp via Webhook se configurado
  if (process.env.WHATSAPP_WEBHOOK_URL) {
    try {
      await fetch(process.env.WHATSAPP_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
    } catch (e) {
      console.warn("[dispatchClinicAlert] WhatsApp webhook warning:", e);
    }
  }

  // 2. Notificação por E-mail do Consultório (Formspree fallback)
  try {
    await fetch("https://formspree.io/f/xbjnqpyz", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
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
  } catch (e) {
    console.warn("[dispatchClinicAlert] Email dispatch warning:", e);
  }
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
    const appointmentId = validateAppointmentToken(data.token, "cancel");

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

    return appointment;
  });
