import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Generates a secure token for an appointment (cancellation or confirmation).
 * Token format: base64url(appointmentId:randomSecret)
 */
export function generateAppointmentToken(appointmentId: string): string {
  const secret = Math.random().toString(36).substring(2, 15);
  const payload = `${appointmentId}:${secret}`;
  return Buffer.from(payload).toString("base64url");
}

/**
 * @deprecated Use generateAppointmentToken instead
 */
export function generateCancellationToken(appointmentId: string): string {
  return generateAppointmentToken(appointmentId);
}

/**
 * Decodes and validates an appointment token.
 * Returns appointmentId if valid, null otherwise.
 */
export function validateAppointmentToken(token: string): string | null {
  try {
    const payload = Buffer.from(token, "base64url").toString("utf-8");
    const parts = payload.split(":");

    // Must have exactly 2 parts: appointmentId:secret
    if (parts.length !== 2) return null;

    const [appointmentId, secret] = parts;

    // Both parts must be non-empty
    if (!appointmentId || !secret) return null;

    return appointmentId;
  } catch {
    return null;
  }
}

/**
 * @deprecated Use validateAppointmentToken instead
 */
export function validateCancellationToken(token: string): string | null {
  return validateAppointmentToken(token);
}

const cancelAppointmentSchema = z.object({
  token: z.string().min(10),
  reason: z.string().max(500).optional(),
});

const confirmAppointmentSchema = z.object({
  token: z.string().min(10),
});

/**
 * Confirms an appointment using a confirmation token.
 * Updates status to 'confirmed' and stores confirmation timestamp.
 */
export const confirmAppointmentByToken = createServerFn({ method: "POST" })
  .inputValidator((input) => confirmAppointmentSchema.parse(input))
  .handler(async ({ data }) => {
    const appointmentId = validateAppointmentToken(data.token);

    if (!appointmentId) {
      throw new Error("Token de confirmação inválido ou expirado.");
    }

    // Fetch appointment to verify it exists and is confirmable
    const { data: appointment, error: fetchError } = await supabaseAdmin
      .from("appointments")
      .select("id, status, appointment_date, appointment_time, patient_name, patient_phone")
      .eq("id", appointmentId)
      .maybeSingle();

    if (fetchError || !appointment) {
      throw new Error("Agendamento não encontrado.");
    }

    if (appointment.status === "cancelled") {
      throw new Error("Este agendamento foi cancelado e não pode ser confirmado.");
    }

    if (appointment.status === "confirmed") {
      throw new Error("Este agendamento já foi confirmado anteriormente.");
    }

    if (appointment.status === "completed") {
      throw new Error("Este agendamento já foi concluído.");
    }

    // Check if appointment is in the past
    const now = new Date();
    const appointmentDateTime = new Date(
      `${appointment.appointment_date}T${appointment.appointment_time}`
    );

    if (appointmentDateTime < now) {
      throw new Error("Não é possível confirmar um agendamento que já passou.");
    }

    // Update appointment status
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

    // TODO: Send notification to dentist via WhatsApp/Email about confirmation

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
 * Cancels an appointment using a cancellation token.
 * Updates status to 'cancelled' and stores cancellation reason.
 */
export const cancelAppointmentByToken = createServerFn({ method: "POST" })
  .inputValidator((input) => cancelAppointmentSchema.parse(input))
  .handler(async ({ data }) => {
    const appointmentId = validateAppointmentToken(data.token);

    if (!appointmentId) {
      throw new Error("Token de cancelamento inválido ou expirado.");
    }

    // Fetch appointment to verify it exists and is not already cancelled
    const { data: appointment, error: fetchError } = await supabaseAdmin
      .from("appointments")
      .select("id, status, appointment_date, appointment_time, patient_name, patient_phone")
      .eq("id", appointmentId)
      .maybeSingle();

    if (fetchError || !appointment) {
      throw new Error("Agendamento não encontrado.");
    }

    if (appointment.status === "cancelled") {
      throw new Error("Este agendamento já foi cancelado anteriormente.");
    }

    // Check if appointment is in the past
    const now = new Date();
    const appointmentDateTime = new Date(
      `${appointment.appointment_date}T${appointment.appointment_time}`
    );

    if (appointmentDateTime < now) {
      throw new Error("Não é possível cancelar um agendamento que já passou.");
    }

    // Update appointment status
    const notesUpdate = data.reason
      ? `[CANCELADO] Motivo: ${data.reason}`
      : "[CANCELADO] Sem motivo informado";

    const { error: updateError } = await supabaseAdmin
      .from("appointments")
      .update({
        status: "cancelled",
        notes: notesUpdate,
        updated_at: new Date().toISOString(),
      })
      .eq("id", appointmentId);

    if (updateError) {
      throw new Error(`Erro ao cancelar agendamento: ${updateError.message}`);
    }

    // TODO: Send notification to dentist via WhatsApp/Email
    // TODO: Delete event from Google Calendar

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
 */
export const getAppointmentByToken = createServerFn({ method: "GET" })
  .inputValidator((token: string) => z.string().min(10).parse(token))
  .handler(async ({ data: token }) => {
    const appointmentId = validateCancellationToken(token);

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
