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

/** Envia notificação por e-mail e webhook do servidor assim que um agendamento é feito. */
export const notifyDentistNewBooking = createServerFn({ method: "POST" })
  .validator((data: NotificationPayload) => data)
  .handler(async (ctx) => {
    const data = ctx.data;
    console.log("Novo agendamento recebido no servidor para Dra. Michelle:", data);

    try {
      // Notificação por e-mail para dramichellebarbosatiago@gmail.com
      const messageText =
        `📌 NOVO AGENDAMENTO RECEBIDO\n\n` +
        `Protocolo: ${data.protocol}\n` +
        `Paciente: ${data.patientName}\n` +
        `Telefone: ${data.patientPhone}\n` +
        `E-mail: ${data.patientEmail}\n` +
        `Data e Hora: ${data.dateFormatted} às ${data.time}\n` +
        `Serviço / Plano: ${data.serviceName}\n` +
        `Observações: ${data.notes || "Nenhuma"}`;

      await fetch("https://formspree.io/f/xbjnqpyz", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          _replyto: data.patientEmail,
          subject: `🩺 [Agendamento Site] ${data.patientName} - ${data.dateFormatted} às ${data.time}`,
          message: messageText,
          protocol: data.protocol,
          patientName: data.patientName,
          patientPhone: data.patientPhone,
          dateFormatted: data.dateFormatted,
          time: data.time,
        }),
      }).catch((e) => console.warn("Email webhook dispatch warning:", e));
    } catch (err) {
      console.warn("Notification handler warning:", err);
    }

    return { success: true };
  });
