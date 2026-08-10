import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildWhatsAppReminderUrl, shouldSendReminder, formatBrazilianDate } from "@/lib/reminders";
import { renderTemplate, getMessageTemplate } from "@/lib/message-templates-server";
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

function buildReminderMessage(vars: Record<string, string>): string {
  return renderTemplate(
    `🦷 *Lembrete de Consulta - Amanhã*

Olá, {{patient_name}}!

Este é um lembrete de que você tem consulta agendada para AMANHÃ:

📅 *Data:* {{appointment_date_formatted}}
⏰ *Horário:* {{appointment_time}}
🩺 *Serviço:* {{service_name}}

🏥 *Local:* {{clinic_name}}
📍 {{clinic_address}}

⚠️ Caso não possa comparecer, por favor nos avise com antecedência pelo WhatsApp: {{clinic_whatsapp}}

Nos vemos amanhã! 😊

— {{clinic_short_name}}`,
    vars
  );
}

export const send24hReminders = createServerFn({ method: "POST" })
  .handler(async () => {
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
      .select("id, patient_name, patient_phone, appointment_date, appointment_time, service_name, status, reminder_sent_at")
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

    // Try to get custom template
    const customTemplate = await getMessageTemplate({ data: "reminder_24h" });

    let sent = 0;
    let failed = 0;

    for (const apt of appointments as AppointmentForReminder[]) {
      try {
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
        };

        const message = customTemplate 
          ? renderTemplate(customTemplate.body, vars)
          : buildReminderMessage(vars);

        const cleanPhone = apt.patient_phone.replace(/\D/g, "");
        const fullPhone = cleanPhone.length > 11 ? cleanPhone : `55${cleanPhone}`;
        const waUrl = `https://wa.me/${fullPhone}?text=${encodeURIComponent(message)}`;

        // Fire and forget
        await fetch(waUrl).catch(() => {});

        // Mark reminder as sent
        const { error: updateError } = await supabaseAdmin
          .from("appointments")
          .update({ reminder_sent_at: new Date().toISOString() })
          .eq("id", apt.id);

        if (updateError) {
          console.warn(`[cron-24h] Failed to mark reminder sent for ${apt.id}:`, updateError);
        } else {
          sent++;
          console.log(`[cron-24h] Reminder sent for ${apt.patient_name} (${apt.id})`);
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
      date: tomorrowStr 
    };
  });

export const send1hReminders = createServerFn({ method: "POST" })
  .handler(async () => {
    // Similar logic for 1h before - would need more precise timing
    // For now, return not implemented
    return { success: true, sent: 0, message: "1h reminders not yet implemented" };
  });

// Manual trigger for testing
export const testReminder = createServerFn({ method: "POST" })
  .validator((data: { appointmentId: string }) => data)
  .handler(async ({ data }) => {
    const { data: apt, error } = await supabaseAdmin
      .from("appointments")
      .select("id, patient_name, patient_phone, appointment_date, appointment_time, service_name")
      .eq("id", data.appointmentId)
      .single();

    if (error || !apt) throw new Error("Agendamento não encontrado");

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
    };

    const customTemplate = await getMessageTemplate({ data: "reminder_24h" });
    const message = customTemplate 
      ? renderTemplate(customTemplate.body, vars)
      : buildReminderMessage(vars);

    const cleanPhone = apt.patient_phone.replace(/\D/g, "");
    const fullPhone = cleanPhone.length > 11 ? cleanPhone : `55${cleanPhone}`;
    const waUrl = `https://wa.me/${fullPhone}?text=${encodeURIComponent(message)}`;

    await fetch(waUrl).catch(() => {});

    return { success: true, message: "Test reminder sent" };
  });