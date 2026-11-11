import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireAdmin } from "@/integrations/supabase/auth-middleware";
import { buildWhatsAppReminderMessage, formatBrazilianDate } from "@/lib/reminders";
import { issueRevocableAppointmentLink } from "@/lib/appointment-links.server";
import { renderTemplate } from "@/lib/message-templates";
import { getMessageTemplate } from "@/lib/message-templates-server";
import { CLINIC } from "@/lib/clinic";

// Fuso da clínica (Macapá/Belém): UTC-3 fixo (Brasil sem horário de verão desde 2019).
const CLINIC_UTC_OFFSET_MINUTES = -3 * 60;

// A mensagem de confirmação é enviada 20h antes do início da consulta.
// O cron roda a cada hora e seleciona a janela [now+19h, now+21h] para
// tolerar atraso de até 1h na execução (Vercel cron pode atrasar alguns minutos).
const TARGET_HOURS_BEFORE = 20;
const WINDOW_HOURS = 1;

const HOUR_MS = 3_600_000;

interface AppointmentForReminder {
  id: string;
  patient_name: string;
  patient_phone: string;
  appointment_date: string;
  appointment_time: string;
  service_name: string;
  status: string;
  reminder_sent_at: string | null;
}

/** Época (ms) do início da consulta, interpretando date+time no fuso da clínica (UTC-3). */
export function appointmentStartMs(appointmentDate: string, appointmentTime: string): number {
  const [y, m, d] = appointmentDate.split("-").map(Number);
  const [hh, mm, ss] = appointmentTime.split(":").map(Number);
  return Date.UTC(y, m - 1, d, hh, mm ?? 0, ss ?? 0) - CLINIC_UTC_OFFSET_MINUTES * 60_000;
}

/** Data local da clínica (YYYY-MM-DD) para um instante. */
export function clinicDateString(instant: Date): string {
  return new Date(instant.getTime() + CLINIC_UTC_OFFSET_MINUTES * 60_000)
    .toISOString()
    .split("T")[0];
}

export async function executeConfirmationReminders(now: Date = new Date()) {
  const windowStart = now.getTime() + (TARGET_HOURS_BEFORE - WINDOW_HOURS) * HOUR_MS; // now + 19h
  const windowEnd = now.getTime() + (TARGET_HOURS_BEFORE + WINDOW_HOURS) * HOUR_MS; // now + 21h

  // Datas locais possivelmente cobertas pela janela (no máximo 2: hoje e/ou amanhã).
  const dates = Array.from(
    new Set([clinicDateString(new Date(windowStart)), clinicDateString(new Date(windowEnd))]),
  );

  console.log(
    `[cron-confirmacao] Janela: ${new Date(windowStart).toISOString()} .. ${new Date(
      windowEnd,
    ).toISOString()} (datas ${dates.join(", ")})`,
  );

  // Alvo: consultas pendentes (ainda não confirmadas) na janela de ~20h antes,
  // que ainda não receberam a mensagem (reminder_sent_at é a marca de dedup,
  // compartilhada com o envio manual assistido do CRC).
  const { data: appointments, error } = await supabaseAdmin
    .from("appointments")
    .select(
      "id, patient_name, patient_phone, appointment_date, appointment_time, service_name, status, reminder_sent_at",
    )
    .in("appointment_date", dates)
    .eq("status", "pending")
    .is("confirmed_at", null)
    .is("reminder_sent_at", null);

  if (error) {
    console.error("[cron-confirmacao] Error fetching appointments:", error);
    throw new Error(error.message);
  }

  const inWindow = (appointments as AppointmentForReminder[] | null)?.filter((apt) => {
    const start = appointmentStartMs(apt.appointment_date, apt.appointment_time);
    return start >= windowStart && start <= windowEnd;
  });

  if (!inWindow || inWindow.length === 0) {
    console.log("[cron-confirmacao] No appointments in confirmation window");
    return { success: true, sent: 0, message: "No appointments in confirmation window" };
  }

  const webhookUrl = process.env.WHATSAPP_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn(
      `[cron-confirmacao] WHATSAPP_WEBHOOK_URL não configurado. ${inWindow.length} confirmação(ões) pendente(s) aguardam envio assistido via CRC/Painel.`,
    );
    return {
      success: false,
      reason: "WHATSAPP_WEBHOOK_NOT_CONFIGURED",
      total: inWindow.length,
      sent: 0,
      failed: 0,
      message:
        "Webhook de WhatsApp não configurado no servidor. O envio deve ser realizado de forma assistida no Painel ou CRC.",
    };
  }

  // Template customizável (mesmo do lembrete: já possui a variável confirm_url).
  const customTemplate = await getMessageTemplate({ data: "reminder_24h" });

  let sent = 0;
  let failed = 0;

  for (const apt of inWindow) {
    try {
      const link = await issueRevocableAppointmentLink(apt.id);
      const confirmToken = link.token;
      const current = {
        ...apt,
        ...link.snapshot,
        patient_phone: link.snapshot.patient_phone || "",
      };

      const confirmUrl = confirmToken
        ? `https://dramichelletiago.com.br/confirmar/${confirmToken}`
        : "https://dramichelletiago.com.br/agendar";

      let message: string;
      if (customTemplate) {
        const vars = {
          patient_name: current.patient_name,
          patient_phone: current.patient_phone,
          appointment_date: current.appointment_date,
          appointment_time: current.appointment_time,
          appointment_date_formatted: formatBrazilianDate(current.appointment_date),
          service_name: apt.service_name,
          clinic_name: CLINIC.name,
          clinic_short_name: CLINIC.shortName,
          clinic_address: CLINIC.address,
          clinic_phone: CLINIC.phone,
          clinic_whatsapp: CLINIC.whatsapp,
          confirm_url: confirmUrl,
        };
        message = renderTemplate(customTemplate.body, vars);
      } else {
        message = buildWhatsAppReminderMessage({
          patientName: current.patient_name,
          appointmentDate: current.appointment_date,
          appointmentTime: current.appointment_time,
          serviceName: apt.service_name,
          confirmationToken: confirmToken,
        });
      }

      const cleanPhone = current.patient_phone.replace(/\D/g, "");
      const fullPhone = cleanPhone.length > 11 ? cleanPhone : `55${cleanPhone}`;

      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(8000),
        body: JSON.stringify({
          phone: fullPhone,
          event: "appointment_confirmation_20h",
          text: message,
          patientName: current.patient_name,
          patientPhone: current.patient_phone,
          appointmentDate: current.appointment_date,
          appointmentTime: current.appointment_time,
          confirmUrl,
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        failed++;
        console.warn(
          `[cron-confirmacao] Webhook WhatsApp retornou HTTP ${res.status} para ${apt.id}: ${errText.slice(0, 100)}`,
        );
        continue;
      }

      // Marca como enviado SOMENTE após aceite verificado do webhook (dedup).
      const { error: updateError } = await supabaseAdmin
        .from("appointments")
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq("id", apt.id);

      if (updateError) {
        console.warn(
          `[cron-confirmacao] Failed to mark confirmation sent for ${apt.id}:`,
          updateError,
        );
      } else {
        sent++;
        console.log(`[cron-confirmacao] Confirmation sent for appointment ID: ${apt.id}`);
      }
    } catch (e) {
      failed++;
      console.error(`[cron-confirmacao] Failed to send confirmation for ${apt.id}:`, e);
    }
  }

  return {
    success: true,
    sent,
    failed,
    total: inWindow.length,
    window: {
      start: new Date(windowStart).toISOString(),
      end: new Date(windowEnd).toISOString(),
    },
  };
}

export const sendConfirmationReminders = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async () => {
    return executeConfirmationReminders();
  });

export const send1hReminders = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async () => {
    return { success: true, sent: 0, message: "1h reminders not yet implemented" };
  });

// Manual trigger for testing
export const testReminder = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((data: { appointmentId: string }) => data)
  .handler(async ({ data }) => {
    const { data: apt, error } = await supabaseAdmin
      .from("appointments")
      .select("id, patient_name, patient_phone, appointment_date, appointment_time, service_name")
      .eq("id", data.appointmentId)
      .single();

    if (error || !apt) throw new Error("Agendamento não encontrado");

    const webhookUrl = process.env.WHATSAPP_WEBHOOK_URL;
    if (!webhookUrl) {
      return {
        success: false,
        message:
          "WHATSAPP_WEBHOOK_URL não está configurado. O envio de WhatsApp automático requer um webhook ativo.",
      };
    }

    const link = await issueRevocableAppointmentLink(apt.id);
    const confirmToken = link.token;
    const current = { ...apt, ...link.snapshot, patient_phone: link.snapshot.patient_phone || "" };
    const confirmUrl = `https://dramichelletiago.com.br/confirmar/${confirmToken}`;

    const message = buildWhatsAppReminderMessage({
      patientName: current.patient_name,
      appointmentDate: current.appointment_date,
      appointmentTime: current.appointment_time,
      serviceName: apt.service_name,
      confirmationToken: confirmToken,
    });

    const cleanPhone = current.patient_phone.replace(/\D/g, "");
    const fullPhone = cleanPhone.length > 11 ? cleanPhone : `55${cleanPhone}`;

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        phone: fullPhone,
        event: "test_reminder",
        text: message,
        patientName: current.patient_name,
        patientPhone: current.patient_phone,
        appointmentDate: current.appointment_date,
        confirmUrl,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Webhook WhatsApp falhou com status HTTP ${res.status}: ${errText}`);
    }

    return { success: true, message: "Test reminder sent via webhook" };
  });
