import { createServerFn } from "@tanstack/react-start";

export interface NotificationPayload {
  protocol: string;
  patientName: string;
  patientPhone: string;
  patientEmail: string;
  dateFormatted: string;
  time: string;
  serviceName: string;
  notes: string;
}

export interface BookingPayload {
  appointmentDate: string;
  appointmentTime: string;
  patientName: string;
  patientPhone: string;
  patientEmail: string;
  serviceName: string;
  notes: string;
  protocol: string;
}

/** Salva o agendamento e envia notificação para a Dra. Michelle. */
export const saveAppointmentAndNotify = createServerFn({ method: "POST" })
  .validator((data: BookingPayload) => data)
  .handler(async (ctx) => {
    const data = ctx.data;

    const record = {
      appointment_date: data.appointmentDate,
      appointment_time: data.appointmentTime,
      patient_name: data.patientName,
      patient_phone: data.patientPhone,
      patient_email: data.patientEmail || "nao_informado@paciente.com",
      service_name: data.serviceName,
      notes: data.notes,
      status: "pending" as const,
    };

    // 1. Tenta salvar via supabaseAdmin (bypassa RLS) se a service key estiver configurada
    let dbSaved = false;
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin.from("appointments").insert(record);
      if (!error) {
        dbSaved = true;
      } else {
        console.warn("[saveAppointmentAndNotify] Admin insert warning:", error.message);
      }
    } catch (e) {
      console.warn("[saveAppointmentAndNotify] Admin client not available:", e);
    }

    // 2. Se não salvou via admin, tenta com client público (pode falhar por RLS)
    if (!dbSaved) {
      try {
        const { createClient } = await import("@supabase/supabase-js");
        const url = process.env.SUPABASE_URL!;
        const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
        if (url && key) {
          const client = createClient(url, key);
          const { error } = await client.from("appointments").insert(record);
          if (!error) dbSaved = true;
          else console.warn("[saveAppointmentAndNotify] Anon insert warning:", error.message);
        }
      } catch (e) {
        console.warn("[saveAppointmentAndNotify] Anon client warning:", e);
      }
    }

    // 3. SEMPRE envia notificação por e-mail via Formspree (independente do banco)
    const messageText =
      `📌 NOVO AGENDAMENTO RECEBIDO\n\n` +
      `Protocolo: ${data.protocol}\n` +
      `Paciente: ${data.patientName}\n` +
      `Telefone: ${data.patientPhone}\n` +
      `E-mail: ${data.patientEmail || "Não informado"}\n` +
      `Data: ${data.appointmentDate} às ${data.appointmentTime}\n` +
      `Serviço: ${data.serviceName}\n` +
      `Observações: ${data.notes || "Nenhuma"}\n\n` +
      `✅ Salvo no banco: ${dbSaved ? "Sim" : "Não (verifique permissões RLS)"}`;

    try {
      await fetch("https://formspree.io/f/xbjnqpyz", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          _replyto: data.patientEmail || "noreply@site.com",
          subject: `🩺 [Agendamento Site] ${data.patientName} - ${data.appointmentDate} às ${data.appointmentTime}`,
          message: messageText,
          protocol: data.protocol,
          patientName: data.patientName,
          patientPhone: data.patientPhone,
        }),
      });
      console.log("[saveAppointmentAndNotify] Email notification sent for", data.protocol);
    } catch (e) {
      console.warn("[saveAppointmentAndNotify] Email notification warning:", e);
    }

    // 4. Cria evento no Google Agenda via Apps Script (GET com params na URL)
    const appsScriptUrl = process.env.GOOGLE_APPS_SCRIPT_URL ||
      "https://script.google.com/macros/s/AKfycbxQ7UvlAqRoGKt8sIwfRePelu7eKsH8Bu5UeMjLWA4Ahg42L4MxqLsP8tVx9oiL5-Gviw/exec";
    try {
      const [hh, mm] = data.appointmentTime.split(":").map(Number);
      const pad = (n: number) => String(n).padStart(2, "0");
      const startStr = `${data.appointmentDate}T${pad(hh)}:${pad(mm)}:00`;
      const endHh = (hh + 1) % 24;
      const endStr = `${data.appointmentDate}T${pad(endHh)}:${pad(mm)}:00`;
      const desc = `Protocolo: ${data.protocol}\nTelefone: ${data.patientPhone}\nServiço: ${data.serviceName}\nObs: ${data.notes || "Nenhuma"}`;
      const params = new URLSearchParams({
        title: `🦷 ${data.patientName}`,
        description: desc,
        start: startStr,
        end: endStr,
      });
      const res = await fetch(`${appsScriptUrl}?${params.toString()}`, {
        method: "GET",
        redirect: "follow",
      });
      const text = await res.text();
      console.log("[saveAppointmentAndNotify] Google Calendar response:", text.substring(0, 200));
    } catch (e) {
      console.warn("[saveAppointmentAndNotify] Google Calendar event warning:", e);
    }

    return { success: true, dbSaved, protocol: data.protocol };
  });

/** @deprecated use saveAppointmentAndNotify instead */
export const notifyDentistNewBooking = createServerFn({ method: "POST" })
  .validator((data: NotificationPayload) => data)
  .handler(async (ctx) => {
    console.log("notifyDentistNewBooking called (legacy):", ctx.data.protocol);
    return { success: true };
  });

