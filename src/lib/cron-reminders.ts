import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireAdmin } from "@/integrations/supabase/auth-middleware";
import { buildWhatsAppReminderMessage, formatBrazilianDate } from "@/lib/reminders";
import { generateAppointmentToken } from "@/lib/cancellation";
import { renderTemplate } from "@/lib/message-templates";
import { getMessageTemplate } from "@/lib/message-templates-server";
import { CLINIC } from "@/lib/clinic";

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

export async function execute24hReminders() {
  // Calculate tomorrow's date in UTC-3 (Macapá)
  const now = new Date();
  const macapaOffset = -3 * 60; // UTC-3 in minutes
  const macapaNow = new Date(now.getTime() + (macapaOffset - now.getTimezoneOffset()) * 60000);

  const tomorrow = new Date(macapaNow);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];

  console.log(`[cron-24h] Checking reminders for ${tomorrowStr} (Macapá time)`);

  // Fetch appointments for tomorrow that are pending/confirmed and haven't had reminder sent
  const { data: appointments, error } = await supabaseAdmin
    .from("appointments")
    .select(
      "id, patient_name, patient_phone, appointment_date, appointment_time, service_name, status, reminder_sent_at",
    )
    .eq("appointment_date", tomorrowStr)
    .in("status", ["pending", "confirmed"])
    .is("reminder_sent_at", null);

  if (error) {
    console.error("[cron-24h] Error fetching appointments:", error);
    throw new Error(error.message);
  }

  if (!appointments || appointments.length === 0) {
    console.log("[cron-24h] No appointments need reminders");
    return { success: true, sent: 0, message: "No appointments to remind" };
  }

  const webhookUrl = process.env.WHATSAPP_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn(
      `[cron-24h] WHATSAPP_WEBHOOK_URL não configurado. ${appointments.length} lembrete(s) pendente(s) aguardam envio assistido via CRC/Painel.`,
    );
    return {
      success: false,
      reason: "WHATSAPP_WEBHOOK_NOT_CONFIGURED",
      total: appointments.length,
      sent: 0,
      failed: 0,
      message:
        "Webhook de WhatsApp não configurado no servidor. O envio deve ser realizado de forma assistida no Painel ou CRC.",
    };
  }

  // Try to get custom template
  const customTemplate = await getMessageTemplate({ data: "reminder_24h" });

  let sent = 0;
  let failed = 0;

  for (const apt of appointments as AppointmentForReminder[]) {
    try {
      let confirmToken = "";
      try {
        confirmToken = generateAppointmentToken(apt.id, "confirm");
      } catch (tokenErr) {
        console.warn(`[cron-24h] Erro ao emitir token para ${apt.id}:`, tokenErr);
      }

      const confirmUrl = confirmToken
        ? `https://dramichelletiago.com.br/confirmar/${confirmToken}`
        : "https://dramichelletiago.com.br/agendar";

      let message: string;
      if (customTemplate) {
        const vars = {
          patient_name: apt.patient_name,
          patient_phone: apt.patient_phone,
          appointment_date: apt.appointment_date,
          appointment_time: apt.appointment_time,
          appointment_date_formatted: formatBrazilianDate(apt.appointment_date),
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
          patientName: apt.patient_name,
          appointmentDate: apt.appointment_date,
          appointmentTime: apt.appointment_time,
          serviceName: apt.service_name,
          confirmationToken: confirmToken,
        });
      }

      const cleanPhone = apt.patient_phone.replace(/\D/g, "");
      const fullPhone = cleanPhone.length > 11 ? cleanPhone : `55${cleanPhone}`;

      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(8000),
        body: JSON.stringify({
          phone: fullPhone,
          event: "appointment_reminder_24h",
          text: message,
          patientName: apt.patient_name,
          patientPhone: apt.patient_phone,
          appointmentDate: apt.appointment_date,
          appointmentTime: apt.appointment_time,
          confirmUrl,
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        failed++;
        console.warn(
          `[cron-24h] Webhook WhatsApp retornou HTTP ${res.status} para ${apt.id}: ${errText.slice(0, 100)}`,
        );
        continue;
      }

      // Mark reminder as sent ONLY after verified webhook acceptance
      const { error: updateError } = await supabaseAdmin
        .from("appointments")
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq("id", apt.id);

      if (updateError) {
        console.warn(`[cron-24h] Failed to mark reminder sent for ${apt.id}:`, updateError);
      } else {
        sent++;
        console.log(`[cron-24h] Reminder sent for appointment ID: ${apt.id}`);
      }
    } catch (e) {
      failed++;
      console.error(`[cron-24h] Failed to send reminder for ${apt.id}:`, e);
    }
  }

  return {
    success: true,
    sent,
    failed,
    total: appointments.length,
    date: tomorrowStr,
  };
}

export const send24hReminders = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async () => {
    return execute24hReminders();
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

    const confirmToken = generateAppointmentToken(apt.id, "confirm");
    const confirmUrl = `https://dramichelletiago.com.br/confirmar/${confirmToken}`;

    const message = buildWhatsAppReminderMessage({
      patientName: apt.patient_name,
      appointmentDate: apt.appointment_date,
      appointmentTime: apt.appointment_time,
      serviceName: apt.service_name,
      confirmationToken: confirmToken,
    });

    const cleanPhone = apt.patient_phone.replace(/\D/g, "");
    const fullPhone = cleanPhone.length > 11 ? cleanPhone : `55${cleanPhone}`;

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        phone: fullPhone,
        event: "test_reminder",
        text: message,
        patientName: apt.patient_name,
        patientPhone: apt.patient_phone,
        appointmentDate: apt.appointment_date,
        confirmUrl,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Webhook WhatsApp falhou com status HTTP ${res.status}: ${errText}`);
    }

    return { success: true, message: "Test reminder sent via webhook" };
  });
