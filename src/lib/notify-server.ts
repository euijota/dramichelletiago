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

/** Salva o agendamento via supabaseAdmin (bypassa RLS) e envia notificação para a Dra. Michelle. */
export const saveAppointmentAndNotify = createServerFn({ method: "POST" })
  .validator((data: BookingPayload) => data)
  .handler(async (ctx) => {
    const data = ctx.data;

    // 1. Salva no Supabase com chave de serviço (bypassa RLS)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("appointments").insert({
      appointment_date: data.appointmentDate,
      appointment_time: data.appointmentTime,
      patient_name: data.patientName,
      patient_phone: data.patientPhone,
      patient_email: data.patientEmail || "nao_informado@paciente.com",
      service_name: data.serviceName,
      notes: data.notes,
      status: "pending",
    });

    if (error) {
      console.error("[saveAppointmentAndNotify] Supabase insert error:", error);
      throw new Error("Erro ao salvar agendamento: " + error.message);
    }

    // 2. Notificação por e-mail via Formspree
    const messageText =
      `📌 NOVO AGENDAMENTO RECEBIDO\n\n` +
      `Protocolo: ${data.protocol}\n` +
      `Paciente: ${data.patientName}\n` +
      `Telefone: ${data.patientPhone}\n` +
      `E-mail: ${data.patientEmail || "Não informado"}\n` +
      `Data e Hora: ${data.appointmentDate} às ${data.appointmentTime}\n` +
      `Serviço / Plano: ${data.serviceName}\n` +
      `Observações: ${data.notes || "Nenhuma"}`;

    try {
      await fetch("https://formspree.io/f/xbjnqpyz", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          _replyto: data.patientEmail,
          subject: `🩺 [Agendamento Site] ${data.patientName} - ${data.appointmentDate} às ${data.appointmentTime}`,
          message: messageText,
          protocol: data.protocol,
          patientName: data.patientName,
          patientPhone: data.patientPhone,
        }),
      });
    } catch (e) {
      console.warn("[saveAppointmentAndNotify] Email notification warning:", e);
    }

    return { success: true, protocol: data.protocol };
  });

/** @deprecated use saveAppointmentAndNotify instead */
export const notifyDentistNewBooking = createServerFn({ method: "POST" })
  .validator((data: NotificationPayload) => data)
  .handler(async (ctx) => {
    console.log("notifyDentistNewBooking called (legacy):", ctx.data.protocol);
    return { success: true };
  });

