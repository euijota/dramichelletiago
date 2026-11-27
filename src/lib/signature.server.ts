import crypto from "node:crypto";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import QRCode from "qrcode";
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

export function isPng(bytes: Uint8Array): boolean {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return bytes.length > 8 && sig.every((b, i) => bytes[i] === b);
}

export function formatSignedAt(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Belem",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date);
}

export interface SignedPdfInput {
  original: Uint8Array;
  documentType: string;
  documentSha256: string;
  signerName: string;
  signerRole: SignerRole;
  signedAt: Date;
  ip: string | null;
  userAgent: string | null;
  verificationLabel: string;
  consentText: string;
  consentVersion: string;
  verifyCode: string;
  rubricPng?: Uint8Array | null;
}

export function verifyUrl(code: string): string {
  return `${SIGNATURE_BASE_URL}/verificar/${code}`;
}

/** Fontes padrão do PDF só cobrem WinAnsi: troca o que não couber por "?". */
const NOT_WIN_ANSI = new RegExp(
  "[^\\x20-\\x7e\\u00a0-\\u00ff\\u2013\\u2014\\u2018\\u2019\\u201c\\u201d\\u2022]",
  "g",
);
function winAnsi(text: string): string {
  return text.replace(NOT_WIN_ANSI, "?");
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > width && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  return lines;
}

/**
 * PDF final = documento original intacto + carimbo no rodapé de cada página
 * + página de manifesto com a trilha de evidências e o QR de verificação.
 */
export async function buildSignedPdf(input: SignedPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(input.original);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);
  const when = formatSignedAt(input.signedAt);
  const url = verifyUrl(input.verifyCode);
  const grey = rgb(0.35, 0.35, 0.35);

  const stamp = winAnsi(
    `Assinado eletronicamente por ${input.signerName} em ${when} (horário de Macapá) · Verifique em ${url}`,
  );
  for (const page of pdf.getPages()) {
    const { width } = page.getSize();
    const lines = wrap(stamp, font, 7, width - 48);
    lines.forEach((l, i) =>
      page.drawText(l, { x: 24, y: 14 + (lines.length - 1 - i) * 9, size: 7, font, color: grey }),
    );
  }

  const page = pdf.addPage([595.28, 841.89]); // A4
  const margin = 48;
  const contentWidth = 595.28 - margin * 2;
  let y = 841.89 - margin;

  const text = (
    t: string,
    opts: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb>; gap?: number } = {},
  ) => {
    const size = opts.size ?? 10;
    const f = opts.f ?? font;
    for (const line of wrap(winAnsi(t), f, size, contentWidth)) {
      page.drawText(line, { x: margin, y, size, font: f, color: opts.color });
      y -= size * 1.35;
    }
    y -= opts.gap ?? 4;
  };
  const field = (label: string, value: string, f: PDFFont = font) => {
    text(label.toUpperCase(), { size: 7.5, f: bold, color: grey, gap: 1.5 });
    text(value, { size: f === mono ? 8.5 : 10.5, f, gap: 8 });
  };

  text("Manifesto de Assinatura Eletrônica", { size: 17, f: bold, gap: 2 });
  text(`${CLINIC.name} · ${documentLabel(input.documentType)}`, { size: 10, color: grey, gap: 14 });

  field(
    "Assinado por",
    `${input.signerName} (${input.signerRole === "responsavel_legal" ? "responsável legal" : "paciente"})`,
  );
  field("Data e hora", `${when} (horário de Macapá, UTC-3)`);
  field("Verificação de identidade", input.verificationLabel);
  field("Endereço IP", input.ip ?? "não identificado");
  field("Dispositivo", (input.userAgent ?? "não identificado").slice(0, 200));
  field("Hash SHA-256 do documento original", input.documentSha256, mono);
  field("Declaração aceita", `"${input.consentText}" (versão ${input.consentVersion})`);

  if (input.rubricPng) {
    const img = await pdf.embedPng(input.rubricPng);
    const scaled = img.scaleToFit(220, 80);
    text("RUBRICA", { size: 7.5, f: bold, color: grey, gap: 2 });
    page.drawImage(img, {
      x: margin,
      y: y - scaled.height,
      width: scaled.width,
      height: scaled.height,
    });
    y -= scaled.height + 14;
  }

  const qr = await pdf.embedPng(await QRCode.toBuffer(url, { type: "png", margin: 1, width: 240 }));
  const qrSize = 110;
  y -= 6;
  page.drawImage(qr, { x: margin, y: y - qrSize, width: qrSize, height: qrSize });
  const qrTextX = margin + qrSize + 16;
  page.drawText("Confira a autenticidade", { x: qrTextX, y: y - 18, size: 11, font: bold });
  page.drawText(winAnsi("Aponte a câmera para o QR code ou acesse:"), {
    x: qrTextX,
    y: y - 36,
    size: 9,
    font,
    color: grey,
  });
  page.drawText(url, { x: qrTextX, y: y - 52, size: 8.5, font: mono });
  page.drawText(`Código: ${input.verifyCode}`, { x: qrTextX, y: y - 68, size: 8.5, font: mono });
  y -= qrSize + 20;

  text(
    "Assinatura eletrônica avançada nos termos da Lei 14.063/2020 (art. 4º, II) e da MP 2.200-2/2001 (art. 10, § 2º). " +
      "O signatário foi identificado por código de uso único enviado ao contato cadastrado. " +
      "Qualquer alteração neste arquivo muda seu hash e invalida a conferência.",
    { size: 8, color: grey },
  );

  pdf.setTitle(`${documentLabel(input.documentType)} — assinado`);
  pdf.setProducer(CLINIC.name);
  pdf.setModificationDate(input.signedAt);
  return pdf.save();
}
