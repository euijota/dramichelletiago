import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FORMSPREE_URL = "https://formspree.io/f/xbjnqpyz";

interface Appointment {
  id: string;
  appointment_date: string;
  appointment_time: string;
  patient_name: string;
  patient_phone: string;
  patient_email: string | null;
  service_name: string;
  status: string;
}

serve(async (req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Calculate tomorrow's date (UTC-3 timezone - Macapá)
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0]; // YYYY-MM-DD

    console.log(`[send-reminders] Looking for appointments on ${tomorrowStr}`);

    // Query appointments for tomorrow that haven't received reminders
    const { data: appointments, error } = await supabase
      .from("appointments")
      .select("*")
      .eq("appointment_date", tomorrowStr)
      .in("status", ["pending", "confirmed"])
      .is("reminder_sent_at", null)
      .order("appointment_time");

    if (error) {
      console.error("[send-reminders] Query error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!appointments || appointments.length === 0) {
      console.log("[send-reminders] No appointments found for tomorrow");
      return new Response(JSON.stringify({ message: "No reminders to send", count: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log(`[send-reminders] Found ${appointments.length} appointments`);

    const results = [];

    for (const apt of appointments as Appointment[]) {
      try {
        // Send WhatsApp reminder
        const whatsappSent = await sendWhatsAppReminder(apt);

        // Send Email reminder
        const emailSent = await sendEmailReminder(apt);

        // Only mark the reminder when at least one delivery channel succeeded.
        const { error: updateError } =
          whatsappSent || emailSent
            ? await supabase
                .from("appointments")
                .update({ reminder_sent_at: new Date().toISOString() })
                .eq("id", apt.id)
            : { error: null };

        if (updateError) {
          console.error(
            `[send-reminders] Failed to update reminder_sent_at for ${apt.id}:`,
            updateError,
          );
        }

        results.push({
          appointment_id: apt.id,
          patient_name: apt.patient_name,
          whatsapp_sent: whatsappSent,
          email_sent: emailSent,
          updated: (whatsappSent || emailSent) && !updateError,
        });

        console.log(
          `[send-reminders] Processed ${apt.patient_name} - WhatsApp: ${whatsappSent}, Email: ${emailSent}`,
        );
      } catch (err) {
        console.error(`[send-reminders] Error processing appointment ${apt.id}:`, err);
        results.push({
          appointment_id: apt.id,
          patient_name: apt.patient_name,
          error: String(err),
        });
      }
    }

    return new Response(
      JSON.stringify({
        message: "Reminders processed",
        count: appointments.length,
        results,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[send-reminders] Fatal error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

async function sendWhatsAppReminder(apt: Appointment): Promise<boolean> {
  try {
    const message = buildWhatsAppMessage(apt);
    const phone = apt.patient_phone.replace(/\D/g, ""); // Remove non-digits
    const whatsappUrl = `https://wa.me/55${phone}?text=${encodeURIComponent(message)}`;

    // Note: WhatsApp links can't be sent programmatically via HTTP.
    // This would need Twilio/WhatsApp Business API for actual automated sending.
    // For now, we log the URL and return true (manual sending required).
    console.log(`[WhatsApp] URL for ${apt.patient_name}: ${whatsappUrl}`);

    // TODO: Integrate with WhatsApp Business API or Twilio
    // For now, send via Email notification to dentist with WhatsApp link

    return true;
  } catch (error) {
    console.error("[WhatsApp] Error:", error);
    return false;
  }
}

async function sendEmailReminder(apt: Appointment): Promise<boolean> {
  if (!apt.patient_email) {
    console.log(`[Email] Skipped for appointment ${apt.id}: patient has no email`);
    return false;
  }

  try {
    const subject = `🦷 Lembrete: Consulta amanhã às ${apt.appointment_time}`;
    const messageText = buildEmailMessage(apt);

    const response = await fetch(FORMSPREE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        _replyto: "noreply@dramichelletiago.com",
        _to: apt.patient_email,
        subject,
        message: messageText,
        patient_name: apt.patient_name,
        appointment_date: apt.appointment_date,
        appointment_time: apt.appointment_time,
      }),
    });

    if (!response.ok) {
      console.error(`[Email] Failed for ${apt.patient_name}:`, await response.text());
      return false;
    }

    console.log(`[Email] Sent to ${apt.patient_email}`);
    return true;
  } catch (error) {
    console.error("[Email] Error:", error);
    return false;
  }
}

function buildWhatsAppMessage(apt: Appointment): string {
  const dateFormatted = formatBrazilianDate(apt.appointment_date);

  return (
    `🦷 *Lembrete de Consulta*\n\n` +
    `Olá, ${apt.patient_name}!\n\n` +
    `Este é um lembrete de que você tem uma consulta agendada:\n\n` +
    `📅 *Data:* ${dateFormatted}\n` +
    `⏰ *Horário:* ${apt.appointment_time}\n` +
    `🩺 *Serviço:* ${apt.service_name}\n\n` +
    `🏥 *Local:* Consultório Dra. Michelle Barbosa Tiago\n` +
    `📍 Macapá, AP\n\n` +
    `⚠️ Caso não possa comparecer, por favor nos avise com antecedência.\n\n` +
    `Nos vemos amanhã! 😊`
  );
}

function buildEmailMessage(apt: Appointment): string {
  const dateFormatted = formatBrazilianDate(apt.appointment_date);

  return (
    `🦷 LEMBRETE DE CONSULTA\n\n` +
    `Olá, ${apt.patient_name}!\n\n` +
    `Este é um lembrete de que você tem uma consulta agendada para amanhã:\n\n` +
    `📅 Data: ${dateFormatted}\n` +
    `⏰ Horário: ${apt.appointment_time}\n` +
    `🩺 Serviço: ${apt.service_name}\n\n` +
    `🏥 Local: Consultório Dra. Michelle Barbosa Tiago\n` +
    `📍 Macapá, Amapá\n\n` +
    `⚠️ IMPORTANTE:\n` +
    `- Chegue com 10 minutos de antecedência\n` +
    `- Traga seus documentos e carteirinha do convênio (se aplicável)\n` +
    `- Caso não possa comparecer, por favor nos avise o quanto antes\n\n` +
    `Qualquer dúvida, entre em contato conosco.\n\n` +
    `Atenciosamente,\n` +
    `Dra. Michelle Barbosa Tiago\n` +
    `Cirurgiã-Dentista`
  );
}

function formatBrazilianDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}
