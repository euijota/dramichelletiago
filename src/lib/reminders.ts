/**
 * Reminder system utilities
 * Templates and helpers for appointment reminders
 */

export interface ReminderData {
  patientName: string;
  appointmentDate: string;
  appointmentTime: string;
  serviceName: string;
  appointmentId?: string;
  confirmationToken?: string;
  cancellationToken?: string;
  confirmUrl?: string;
}

export function buildConfirmationLinks(
  appointmentId?: string,
  confirmationToken?: string,
  cancellationToken?: string,
) {
  const baseUrl = "https://dramichelletiago.com.br";
  // Links de ação só existem com token assinado emitido pelo servidor.
  // Sem token, nunca montar um link a partir do ID da consulta.
  void appointmentId;
  const confirmToken = confirmationToken || "";
  const cancelToken = cancellationToken || "";
  return {
    confirmUrl: confirmToken ? `${baseUrl}/confirmar/${confirmToken}` : `${baseUrl}/agendar`,
    cancelUrl: cancelToken ? `${baseUrl}/cancelar/${cancelToken}` : `${baseUrl}/agendar`,
    rescheduleUrl: `${baseUrl}/agendar`,
  };
}

/**
 * Builds WhatsApp reminder message (24h before appointment) with a SINGLE confirmation link
 */
export function buildWhatsAppReminderMessage(data: ReminderData): string {
  const dateFormatted = formatBrazilianDate(data.appointmentDate);
  const confirmUrl =
    data.confirmUrl ||
    buildConfirmationLinks(data.appointmentId, data.confirmationToken, data.cancellationToken)
      .confirmUrl;

  return (
    `🦷 *Confirmação de Consulta — Dra. Michelle Barbosa Tiago*\n\n` +
    `Olá, *${data.patientName}*!\n\n` +
    `Passando para lembrar da sua consulta agendada:\n\n` +
    `📅 *Data:* ${dateFormatted}\n` +
    `⏰ *Horário:* ${data.appointmentTime}\n` +
    `🩺 *Atendimento:* ${data.serviceName}\n` +
    `📍 *Local:* Travessa Joaquim Pinheiro Borges, 964 — Alvorada, Macapá/AP\n\n` +
    `👉 *Toque no link abaixo para Confirmar, Reagendar ou Cancelar:*\n` +
    `${confirmUrl}\n\n` +
    `Aguardamos você! 😊`
  );
}

/**
 * Builds email reminder message (24h before appointment)
 */
export function buildEmailReminderMessage(data: ReminderData): string {
  const dateFormatted = formatBrazilianDate(data.appointmentDate);

  return (
    `🦷 LEMBRETE DE CONSULTA\n\n` +
    `Olá, ${data.patientName}!\n\n` +
    `Este é um lembrete de que você tem uma consulta agendada para amanhã:\n\n` +
    `📅 Data: ${dateFormatted}\n` +
    `⏰ Horário: ${data.appointmentTime}\n` +
    `🩺 Serviço: ${data.serviceName}\n\n` +
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

/**
 * Builds WhatsApp reminder URL
 */
export function buildWhatsAppReminderUrl(phone: string, data: ReminderData): string {
  const message = buildWhatsAppReminderMessage(data);
  const cleanPhone = phone.replace(/\D/g, ""); // Remove non-digits
  const fullPhone = cleanPhone.length > 11 ? cleanPhone : `55${cleanPhone}`;
  // Link universal do WhatsApp: abre o app no celular e o WhatsApp Web no
  // desktop (web.whatsapp.com direto abriria o QR até no celular — ver
  // buildWhatsAppUniversalUrl em src/lib/crc.ts).
  return `https://api.whatsapp.com/send?phone=${fullPhone}&text=${encodeURIComponent(message)}`;
}

/**
 * Formats ISO date (YYYY-MM-DD) to Brazilian format (DD/MM/YYYY)
 */
export function formatBrazilianDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

/**
 * Checks if an appointment should receive a reminder
 * (24h before, not yet sent, status pending/confirmed)
 */
export function shouldSendReminder(
  appointmentDate: string,
  reminderSentAt: string | null,
  status: string,
): boolean {
  // Only send for pending/confirmed appointments
  if (!["pending", "confirmed"].includes(status)) {
    return false;
  }

  // Already sent reminder
  if (reminderSentAt) {
    return false;
  }

  // Check if appointment is tomorrow
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];

  return appointmentDate === tomorrowStr;
}
