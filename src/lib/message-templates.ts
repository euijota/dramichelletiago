/**
 * Message Templates System
 * Configurable WhatsApp/Email templates for patient communications
 */

export type TemplateType = 
  | "booking_confirmation"      // Sent to patient when booking created (with confirm/cancel links)
  | "booking_confirmed"         // Sent when dentist confirms appointment
  | "booking_cancelled"         // Sent when appointment cancelled
  | "reminder_24h"              // 24h before appointment
  | "reminder_1h"               // 1h before appointment
  | "post_appointment"          // After appointment (feedback/request review)
  | "custom";                   // Custom/manual send

export interface MessageTemplate {
  id: string;
  type: TemplateType;
  name: string;                 // Display name in admin
  channel: "whatsapp" | "email" | "both";
  subject?: string;             // For email
  body: string;                 // Template with placeholders
  is_active: boolean;
  is_default: boolean;          // System default (only one per type)
  created_at: string;
  updated_at: string;
}

export interface TemplateVariables {
  // Patient info
  patient_name: string;
  patient_phone: string;
  patient_email: string;
  // Appointment info
  appointment_date: string;      // YYYY-MM-DD
  appointment_time: string;      // HH:MM
  appointment_date_formatted: string; // DD/MM/YYYY
  service_name: string;
  protocol: string;
  // Links
  confirmation_link?: string;
  cancellation_link?: string;
  // Clinic info
  clinic_name: string;
  clinic_short_name: string;
  clinic_phone: string;
  clinic_address: string;
  clinic_whatsapp: string;
  // Custom
  notes?: string;
  dentist_name?: string;
}

/** Default templates (used as fallback if none configured) */
export const DEFAULT_TEMPLATES: Omit<MessageTemplate, "id" | "created_at" | "updated_at">[] = [
  {
    type: "booking_confirmation",
    name: "Confirmação de Agendamento (Paciente)",
    channel: "whatsapp",
    body: `Olá, {{patient_name}}! 😊

Recebemos sua solicitação de agendamento:

📅 {{appointment_date_formatted}} às {{appointment_time}}
🩺 {{service_name}}
📌 Protocolo: {{protocol}}

✅ Para CONFIRMAR sua consulta:
{{confirmation_link}}

❌ Para CANCELAR:
{{cancellation_link}}

Aguardamos você! 🦷

— {{clinic_short_name}}`,
    is_active: true,
    is_default: true,
  },
  {
    type: "booking_confirmed",
    name: "Agendamento Confirmado (Paciente)",
    channel: "whatsapp",
    body: `Olá, {{patient_name}}! ✅

Sua consulta foi CONFIRMADA:

📅 {{appointment_date_formatted}} às {{appointment_time}}
🩺 {{service_name}}
📌 Protocolo: {{protocol}}

🏥 {{clinic_name}}
📍 {{clinic_address}}

Nos vemos lá! 😊

— {{clinic_short_name}}`,
    is_active: true,
    is_default: true,
  },
  {
    type: "booking_cancelled",
    name: "Agendamento Cancelado (Paciente)",
    channel: "whatsapp",
    body: `Olá, {{patient_name}}.

Seu agendamento foi CANCELADO:

📅 {{appointment_date_formatted}} às {{appointment_time}}
🩺 {{service_name}}
📌 Protocolo: {{protocol}}

{{#if notes}}
Motivo: {{notes}}
{{/if}}

Para reagendar: {{clinic_whatsapp_link}}

— {{clinic_short_name}}`,
    is_active: true,
    is_default: true,
  },
  {
    type: "reminder_24h",
    name: "Lembrete 24h (Paciente)",
    channel: "whatsapp",
    body: `🦷 *Lembrete de Consulta - Amanhã*

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
    is_active: true,
    is_default: true,
  },
  {
    type: "reminder_1h",
    name: "Lembrete 1h (Paciente)",
    channel: "whatsapp",
    body: `⏰ *Lembrete: Consulta em 1 hora*

Olá, {{patient_name}}!

Sua consulta começa em 1 hora:

📅 {{appointment_date_formatted}} às {{appointment_time}}
🩺 {{service_name}}
🏥 {{clinic_name}}

Nos vemos em breve! 🦷

— {{clinic_short_name}}`,
    is_active: false,
    is_default: true,
  },
  {
    type: "post_appointment",
    name: "Pós-Consulta / Avaliação (Paciente)",
    channel: "whatsapp",
    body: `Olá, {{patient_name}}! 😊

Esperamos que sua consulta tenha sido ótima!

Sua opinião é muito importante para nós. Se puder, deixe uma avaliação no Google:
{{google_review_link}}

Ou nos envie um feedback direto.

Obrigada pela confiança!

— {{clinic_short_name}}`,
    is_active: false,
    is_default: true,
  },
];

/** Render template with variables */
export function renderTemplate(template: string, vars: TemplateVariables): string {
  let result = template;
  
  // Simple {{variable}} replacement
  Object.entries(vars).forEach(([key, value]) => {
    const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    result = result.replace(placeholder, value ?? "");
  });
  
  // Handle {{#if variable}}...{{/if}} blocks
  result = result.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, key, content) => {
    return vars[key as keyof TemplateVariables] ? content : "";
  });
  
  return result;
}

/** Get WhatsApp URL for template */
export function buildWhatsAppUrl(phone: string, template: string, vars: TemplateVariables): string {
  const message = renderTemplate(template, vars);
  const cleanPhone = phone.replace(/\D/g, "");
  const fullPhone = cleanPhone.length > 11 ? cleanPhone : `55${cleanPhone}`;
  return `https://wa.me/${fullPhone}?text=${encodeURIComponent(message)}`;
}