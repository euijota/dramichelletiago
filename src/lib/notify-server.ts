import { createServerFn } from "@tanstack/react-start";
import { CLINIC } from "@/lib/clinic";
import { buildWhatsAppUrl, renderTemplate } from "@/lib/message-templates";
import { getMessageTemplate } from "@/lib/message-templates-server";

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
    let appointmentId = "";
    let cancellationToken = "";
    let confirmationToken = "";

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: inserted, error } = await supabaseAdmin
        .from("appointments")
        .insert(record)
        .select("id")
        .single();

      if (!error && inserted) {
        dbSaved = true;
        appointmentId = inserted.id;

        // Generate cancellation and confirmation tokens
        const { generateAppointmentToken } = await import("@/lib/cancellation");
        cancellationToken = generateAppointmentToken(appointmentId);
        confirmationToken = generateAppointmentToken(appointmentId);

        console.log("[saveAppointmentAndNotify] Appointment saved, ID:", appointmentId);
      } else {
        console.warn("[saveAppointmentAndNotify] Admin insert warning:", error?.message);
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
    const cancellationLink = cancellationToken
      ? `https://dramichelletiago.com.br/cancelar/${cancellationToken}`
      : "";
    const confirmationLink = confirmationToken
      ? `https://dramichelletiago.com.br/confirmar/${confirmationToken}`
      : "";

    const messageText =
      `📌 NOVO AGENDAMENTO RECEBIDO\n\n` +
      `Protocolo: ${data.protocol}\n` +
      `Paciente: ${data.patientName}\n` +
      `Telefone: ${data.patientPhone}\n` +
      `E-mail: ${data.patientEmail || "Não informado"}\n` +
      `Data: ${data.appointmentDate} às ${data.appointmentTime}\n` +
      `Serviço: ${data.serviceName}\n` +
      `Observações: ${data.notes || "Nenhuma"}\n\n` +
      `✅ Salvo no banco: ${dbSaved ? "Sim" : "Não (verifique permissões RLS)"}\n\n` +
      (confirmationLink ? `✅ Link de confirmação: ${confirmationLink}\n` : "") +
      (cancellationLink ? `🔗 Link de cancelamento: ${cancellationLink}` : "");

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
          confirmationLink: confirmationLink,
          cancellationLink: cancellationLink,
        }),
      });
      console.log("[saveAppointmentAndNotify] Email notification sent for", data.protocol);
    } catch (e) {
      console.warn("[saveAppointmentAndNotify] Email notification warning:", e);
    }

    // 4. Cria evento no Google Agenda via Apps Script (GET com params na URL)
    const appsScriptUrl = process.env.GOOGLE_APPS_SCRIPT_URL ||
      "https://script.google.com/macros/s/AKfycbxCcfshrC-pTc_53ON17oKeWDNTeQkEtPoP4a1_xeT5XxEFxZo5VPEcMgjMkjkNUbJODw/exec";
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

    // 5. Envia WhatsApp para o PACIENTE com link de confirmação/cancelamento
    if (dbSaved && appointmentId) {
      try {
        // Busca template configurado (ou usa default)
        const template = await getMessageTemplate({ data: "booking_confirmation" });
        
        const templateVars = {
          patient_name: data.patientName,
          patient_phone: data.patientPhone,
          patient_email: data.patientEmail,
          appointment_date: data.appointmentDate,
          appointment_time: data.appointmentTime,
          appointment_date_formatted: data.dateFormatted,
          service_name: data.serviceName,
          protocol: data.protocol,
          confirmation_link: confirmationLink,
          cancellation_link: cancellationLink,
          clinic_name: CLINIC.name,
          clinic_short_name: CLINIC.shortName,
          clinic_phone: CLINIC.phone,
          clinic_address: CLINIC.address,
          clinic_whatsapp: CLINIC.whatsapp,
          clinic_whatsapp_link: `https://wa.me/${CLINIC.whatsapp}`,
          notes: data.notes || "Nenhuma",
          dentist_name: CLINIC.shortName,
        };

        const message = template 
          ? renderTemplate(template.body, templateVars)
          : `Olá, ${data.patientName}! 😊

Recebemos sua solicitação de agendamento:

📅 ${data.dateFormatted} às ${data.appointmentTime}
🩺 ${data.serviceName}
📌 Protocolo: ${data.protocol}

✅ Para CONFIRMAR sua consulta:
${confirmationLink}

❌ Para CANCELAR:
${cancellationLink}

Aguardamos você! 🦷

— ${CLINIC.shortName}`;

        const patientPhone = data.patientPhone.replace(/\D/g, "");
        const fullPhone = patientPhone.length > 11 ? patientPhone : `55${patientPhone}`;
        const waUrl = `https://wa.me/${fullPhone}?text=${encodeURIComponent(message)}`;
        
        // Fire and forget - don't await
        fetch(waUrl).catch(() => {});
        console.log("[saveAppointmentAndNotify] Patient WhatsApp sent for", data.protocol);
      } catch (e) {
        console.warn("[saveAppointmentAndNotify] Patient WhatsApp warning:", e);
      }
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

