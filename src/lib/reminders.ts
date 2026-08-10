/**
 * Reminder system utilities
 * Templates and helpers for appointment reminders
 */

export interface ReminderData {
  patientName: string;
  appointmentDate: string;
  appointmentTime: string;
  serviceName: string;
}

/**
 * Builds WhatsApp reminder message (24h before appointment)
 */
export function buildWhatsAppReminderMessage(data: ReminderData): string {
  const dateFormatted = formatBrazilianDate(data.appointmentDate);

  return (
    `🦷 *Lembrete de Consulta*\n\n` +
    `Olá, ${data.patientName}!\n\n` +
    `Este é um lembrete de que você tem uma consulta agendada:\n\n` +
    `📅 *Data:* ${dateFormatted}\n` +
    `⏰ *Horário:* ${data.appointmentTime}\n` +
    `🩺 *Serviço:* ${data.serviceName}\n\n` +
    `🏥 *Local:* Consultório Dra. Michelle Barbosa Tiago\n` +
    `📍 Macapá, AP\n\n` +
    `⚠️ Caso não possa comparecer, por favor nos avise com antecedência.\n\n` +
    `Nos vemos amanhã! 😊`
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
  return `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(message)}`;
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
  status: string
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
