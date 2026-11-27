import crypto from "node:crypto";
import { parsePatientNotes } from "@/lib/patient-guardians";
import { maskEmail, maskPhone } from "@/lib/anamnesis";
import { CLINIC } from "@/lib/clinic";

export const SIGNATURE_BASE_URL = "https://dramichelletiago.com.br";
export const MAX_SIGNATURE_PDF_BYTES = 5 * 1024 * 1024;

export type SignerRole = "paciente" | "responsavel_legal";

function getOtpSecret(): string {
  const secret = process.env.SIGNATURE_OTP_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SIGNATURE_OTP_SECRET não configurado no servidor.");
  }
  return secret;
}

export function sha256Hex(bytes: Uint8Array): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export function isPdf(bytes: Uint8Array): boolean {
  // Assinatura mágica "%PDF-"
  return (
    bytes.length > 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}

export function generateOtp(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/** HMAC amarrado ao pedido: o mesmo código em outro pedido gera outro hash. */
export function hashOtp(tokenHash: string, otp: string): string {
  return crypto
    .createHmac("sha256", getOtpSecret())
    .update(`signature-otp:v1:${tokenHash}:${otp}`)
    .digest("hex");
}

export function toWhatsAppPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.length > 11 ? digits : `55${digits}`;
}

export interface SignerContact {
  name: string;
  phone: string | null;
  email: string | null;
}

interface PatientRow {
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  birth_date: string | null;
}

/** Quem assina e por onde recebe o código: o paciente ou o responsável legal do cadastro. */
export function resolveSignerContact(patient: PatientRow, role: SignerRole): SignerContact | null {
  if (role === "paciente") {
    return {
      name: patient.name.trim(),
      phone: patient.phone || null,
      email: patient.email || null,
    };
  }
  const g = parsePatientNotes(patient.notes, patient.birth_date);
  if (!g.guardianName.trim()) return null;
  return {
    name: g.guardianName.trim(),
    phone: g.guardianPhone || null,
    email: g.guardianEmail || null,
  };
}

export type DeliveryChannel = "whatsapp" | "email";

/**
 * Envia por WhatsApp (webhook já usado pelos lembretes) e cai para e-mail se não der.
 * Retorna o canal que aceitou a mensagem, ou null se nenhum aceitou.
 */
export async function deliverToSigner(
  contact: SignerContact,
  message: { event: string; text: string; subject: string },
  idempotencyKey: string,
): Promise<DeliveryChannel | null> {
  const webhookUrl = process.env.WHATSAPP_WEBHOOK_URL;
  const waPhone = contact.phone ? toWhatsAppPhone(contact.phone) : null;
  if (webhookUrl && waPhone) {
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(8000),
        body: JSON.stringify({ phone: waPhone, event: message.event, text: message.text }),
      });
      if (res.ok) return "whatsapp";
      console.warn(`[assinatura] Webhook WhatsApp retornou HTTP ${res.status} (${message.event})`);
    } catch {
      console.warn(`[assinatura] Webhook WhatsApp indisponível (${message.event})`);
    }
  }

  if (contact.email) {
    const { sendClinicalEmail, getClinicalEmailConfiguration } = await import("@/lib/email.server");
    try {
      const { from } = getClinicalEmailConfiguration();
      const result = await sendClinicalEmail(
        {
          from,
          to: [contact.email],
          subject: message.subject,
          text: message.text,
          html: `<p>${escapeHtml(message.text).replace(/\n/g, "<br>")}</p>`,
          template_version: 1,
        },
        idempotencyKey,
      );
      if (result.status === "accepted" || result.status === "uncertain") return "email";
    } catch {
      console.warn(`[assinatura] E-mail não configurado (${message.event})`);
    }
  }
  return null;
}

export function maskContact(contact: SignerContact, channel: DeliveryChannel): string {
  return channel === "whatsapp" ? maskPhone(contact.phone) : maskEmail(contact.email);
}

const DOC_LABELS: Record<string, string> = {
  tcle: "Termo de Consentimento (TCLE)",
  plano_tratamento: "Plano de Tratamento",
  orcamento: "Orçamento",
};

export function documentLabel(type: string): string {
  return DOC_LABELS[type] ?? "Documento";
}

export function buildLinkMessage(signerName: string, documentType: string, url: string) {
  const first = signerName.split(/\s+/)[0];
  return {
    event: "signature_request",
    subject: `${documentLabel(documentType)} para assinar — ${CLINIC.shortName}`,
    text:
      `Olá, ${first}! A ${CLINIC.shortName} enviou o documento "${documentLabel(documentType)}" ` +
      `para você ler e assinar pelo celular:\n${url}\n\nO link vale por 72 horas. ` +
      `Se não reconhece este pedido, ignore esta mensagem.`,
  };
}

export function buildOtpMessage(otp: string) {
  return {
    event: "signature_otp",
    subject: `Código de assinatura — ${CLINIC.shortName}`,
    text:
      `Seu código para assinar o documento da ${CLINIC.shortName} é ${otp}. ` +
      `Ele vale por 10 minutos. Não compartilhe este código com ninguém.`,
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
