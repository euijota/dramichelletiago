import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import crypto from "node:crypto";
import {
  extractClinicalWarnings,
  formatAnamnesisContent,
  maskName,
  maskPhone,
  maskEmail,
  type AnamnesisAnswers,
} from "@/lib/anamnesis";
import { toISODate } from "@/lib/clinic";
import type { Json } from "@/integrations/supabase/types";

function getAnamnesisSecret(): string {
  const secret = process.env.ANAMNESIS_TOKEN_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("ANAMNESIS_TOKEN_SECRET não configurado no servidor.");
  }
  return secret;
}

interface ProtocolAttemptTracker {
  failedAttempts: number;
  lockedUntil: number;
}
const protocolAttempts = new Map<string, ProtocolAttemptTracker>();

function checkProtocolRateLimit(protocol: string): { allowed: boolean; remainingSeconds?: number } {
  const now = Date.now();
  const entry = protocolAttempts.get(protocol);
  if (!entry) return { allowed: true };
  if (entry.lockedUntil > now) {
    return { allowed: false, remainingSeconds: Math.ceil((entry.lockedUntil - now) / 1000) };
  }
  if (entry.lockedUntil > 0 && entry.lockedUntil <= now) {
    protocolAttempts.delete(protocol);
    return { allowed: true };
  }
  return { allowed: true };
}

function recordProtocolFailedAttempt(protocol: string) {
  const now = Date.now();
  const entry = protocolAttempts.get(protocol) || { failedAttempts: 0, lockedUntil: 0 };
  entry.failedAttempts += 1;
  if (entry.failedAttempts >= 5) {
    entry.lockedUntil = now + 15 * 60 * 1000; // Bloqueio de 15 minutos
  }
  protocolAttempts.set(protocol, entry);
}

function resetProtocolAttempts(protocol: string) {
  protocolAttempts.delete(protocol);
}

/**
 * Gera um token criptografado HMAC-SHA256 para comprovar posse e autorização
 * sobre o preenchimento de anamnese de um paciente/agendamento específico.
 * Formato: v2.<appointmentId>.<protocol>.<expiresAt>.<nonce>.<sig>
 */
export function generateAnamnesisToken({
  appointmentId,
  protocol,
  expiryDays = 30,
}: {
  appointmentId: string;
  protocol?: string | null;
  expiryDays?: number;
}): string {
  const secret = getAnamnesisSecret();
  const expiresAt = Date.now() + expiryDays * 24 * 60 * 60 * 1000;
  const nonce = crypto.randomBytes(12).toString("base64url");
  const appt = z.uuid().parse(appointmentId);
  const proto = protocol || "none";

  const dataToSign = `anamnese:v2:${appt}:${proto}:${expiresAt}:${nonce}`;
  const sig = crypto.createHmac("sha256", secret).update(dataToSign).digest("base64url");

  const payload = `v2.${appt}.${proto}.${expiresAt}.${nonce}.${sig}`;
  return Buffer.from(payload).toString("base64url");
}

/**
 * Valida a assinatura HMAC e expiração do token de anamnese em tempo constante.
 * Retorna os dados comprovados ou null se o token for forjado/expirado.
 */
export function validateAnamnesisToken(token: string): {
  appointmentId: string;
  protocol: string | null;
} | null {
  try {
    if (typeof token !== "string" || !token || token.length > 512) return null;
    let decoded = "";
    try {
      decoded = Buffer.from(token, "base64url").toString("utf-8");
    } catch {
      return null;
    }

    if (!decoded.startsWith("v2.")) return null;

    const parts = decoded.split(".");
    if (parts.length !== 6) return null;

    const [, appt, proto, expStr, nonce, sig] = parts;
    if (!z.uuid().safeParse(appt).success || !proto || !expStr || !nonce || !sig) return null;

    const expiresAt = Number(expStr);
    if (isNaN(expiresAt) || Date.now() > expiresAt) return null;

    const secret = getAnamnesisSecret();
    const dataToSign = `anamnese:v2:${appt}:${proto}:${expStr}:${nonce}`;
    const expected = crypto.createHmac("sha256", secret).update(dataToSign).digest("base64url");

    const expectedBuf = Buffer.from(expected);
    const actualBuf = Buffer.from(sig);
    if (expectedBuf.length !== actualBuf.length) return null;
    if (!crypto.timingSafeEqual(expectedBuf, actualBuf)) return null;

    return {
      appointmentId: appt,
      protocol: proto === "none" ? null : proto,
    };
  } catch {
    return null;
  }
}

const anamnesisSubmissionSchema = z.object({
  token: z.string().optional().nullable(),
  patientId: z.string().optional().nullable(),
  appointmentId: z.string().optional().nullable(),
  protocol: z.string().optional().nullable(),
  patientName: z.string().optional().nullable(),
  patientPhone: z.string().optional().nullable(),
  patientEmail: z.string().optional().nullable(),
  answers: z.object({
    reasonForVisit: z.string().default(""),
    lastDentalTreatment: z.string().default(""),
    medicalTreatment: z.enum(["Sim", "Não"]).default("Não"),
    medicalTreatmentDetails: z.string().optional().default(""),
    takingMedication: z.enum(["Sim", "Não"]).default("Não"),
    continuousMeds: z.string().optional().default(""),
    drugAllergy: z.enum(["Sim", "Não"]).default("Não"),
    drugAllergyDetails: z.string().optional().default(""),
    localAnesthesiaReaction: z.enum(["Sim", "Não"]).default("Não"),
    foodAllergy: z.enum(["Sim", "Não"]).default("Não"),
    foodAllergyDetails: z.string().optional().default(""),
    bleedingGums: z.enum(["Sim", "Não", "Às vezes"]).default("Não"),
    foodRetention: z.enum(["Sim", "Não"]).default("Não"),
    sensitivity: z.enum(["Sim", "Não"]).default("Não"),
    bruxism: z.enum(["Sim", "Não"]).default("Não"),
    habits: z.enum(["Sim", "Não"]).default("Não"),
    habitsDetails: z.string().optional().default(""),
    smoking: z.enum(["Sim", "Não"]).default("Não"),
    smokingDetails: z.string().optional().default(""),
    excessiveBleeding: z.enum(["Sim", "Não"]).default("Não"),
    facialOrTmjPain: z.enum(["Sim", "Não"]).default("Não"),
    faintingOrEpilepsy: z.enum(["Sim", "Não"]).default("Não"),
    normalBloodPressure: z.enum(["Sim", "Não"]).default("Sim"),
    pregnant: z.enum(["Sim", "Não"]).default("Não"),
    pregnantMonth: z.string().optional().default(""),
    previousOrthodontics: z.enum(["Sim", "Não"]).default("Não"),
    smileComplaint: z.enum(["Sim", "Não"]).default("Não"),
    smileComplaintDetails: z.string().optional().default(""),
    systemicConditions: z.array(z.string()).default([]),
    notes: z.string().optional().default(""),
  }),
});

export type AnamnesisSubmissionInput = z.infer<typeof anamnesisSubmissionSchema>;

/**
 * Server function segura para submissão do formulário de anamnese pré-atendimento.
 *
 * REGRAS CRÍTICAS DE AUTORIZAÇÃO:
 * 1. Para alterar prontuário ou alertas clínicos de um paciente existente,
 *    É OBRIGATÓRIO fornecer um `token` criptograficamente válido (HMAC-SHA256).
 * 2. Submissões sem token NUNCA alteram pacientes existentes nem buscam por semelhança de telefone/nome.
 *    Em vez disso, criam um registro avulso isolado com flag 'não verificado'.
 */
export const submitPatientAnamnesis = createServerFn({ method: "POST" })
  .validator((data: unknown) => anamnesisSubmissionSchema.parse(data))
  .handler(async ({ data }) => {
    const { enforceClinicalLinkLimit } = await import("@/lib/clinical-link-limit.server");
    await enforceClinicalLinkLimit("action");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const verified = data.token ? validateAnamnesisToken(data.token) : null;
    if (data.token && !verified) {
      throw new Error("Link de anamnese inválido ou expirado. Acesse pelo protocolo.");
    }

    // Intake público isolado. A equipe verifica identidade e vincula o prontuário.
    const { data: intake, error: intakeError } = await supabaseAdmin
      .from("patients")
      .insert({
        name: data.patientName?.trim() || "Paciente Não Identificado (Web)",
        phone: data.patientPhone?.trim() || null,
        email: data.patientEmail?.trim() || null,
        origin: "Anamnese Web (Pendente de Verificação)",
        notes: "Conferir identidade e vincular o formulário ao prontuário no atendimento.",
      })
      .select("id")
      .single();
    if (intakeError || !intake)
      throw new Error("Falha ao registrar formulário de pré-atendimento.");

    const answers = data.answers as AnamnesisAnswers;
    const warnings = extractClinicalWarnings(answers);
    const content = formatAnamnesisContent(answers);
    const today = toISODate(new Date());

    // 3. Salva o registro clínico no prontuário (clinical_records)
    const { error: recordError } = await supabaseAdmin.from("clinical_records").insert({
      patient_id: intake.id,
      record_type: "formulario",
      record_date: today,
      title: "Anamnese Pré-Atendimento Online (Pendente de Verificação)",
      content,
      metadata: {
        submitted_at: new Date().toISOString(),
        is_verified: false,
        protocol: verified?.protocol ?? null,
        appointment_id: verified?.appointmentId ?? null,
        answers: answers as unknown as Record<string, unknown>,
        source: verified ? "agendamento_autenticado" : "formulario_publico_avulso",
      } as unknown as Json,
    });

    if (recordError) {
      const cleanup = await supabaseAdmin.from("patients").delete().eq("id", intake.id);
      if (cleanup.error) console.warn("Falha ao limpar cadastro de anamnese incompleto.");
      throw new Error("Não foi possível salvar a anamnese. Tente novamente.");
    }

    return {
      success: true,
      patientId: intake.id,
      isVerified: false,
      warningsCount: warnings.length,
      protocol: verified?.protocol ?? null,
    };
  });

/**
 * Consulta segura por Token Criptográfico (URL com ?token=...)
 */
export const getAnamnesisInfoByToken = createServerFn({ method: "GET" })
  .validator((token: string) => z.string().min(10).parse(token))
  .handler(async ({ data: token }) => {
    const { enforceClinicalLinkLimit } = await import("@/lib/clinical-link-limit.server");
    await enforceClinicalLinkLimit("read");
    const verified = validateAnamnesisToken(token);
    if (!verified) {
      return { found: false, error: "Token inválido ou expirado." };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: appt, error } = await supabaseAdmin
      .from("appointments")
      .select(
        "id, patient_name, patient_phone, patient_email, service_name, appointment_date, appointment_time",
      )
      .eq("id", verified.appointmentId)
      .maybeSingle();
    if (error || !appt) return { found: false, error: "Agendamento indisponível." };
    return {
      found: true,
      isVerified: true,
      token,
      protocol: verified.protocol,
      appointment: {
        id: appt.id,
        patientId: null,
        patientName: appt.patient_name,
        patientPhone: appt.patient_phone,
        patientEmail: appt.patient_email,
        serviceName: appt.service_name,
        date: appt.appointment_date,
        time: appt.appointment_time,
      },
      alreadySubmitted: false,
    };
  });

const protocolLookupSchema = z.object({
  protocol: z
    .string()
    .regex(/^AG-[A-Z0-9]{4,10}$/i, "Protocolo inválido (formato esperado: AG-XXXX)"),
  phoneDigits4: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
});

/**
 * Consulta de anamnese por protocolo com proteção anti-vazamento de PII.
 * Sem confirmação dos 4 dígitos finais do telefone, retorna apenas dados mascarados.
 */
export const getAnamnesisInfoByProtocol = createServerFn({ method: "POST" })
  .validator((input) => protocolLookupSchema.parse(input))
  .handler(async ({ data }) => {
    const { enforceClinicalLinkLimit } = await import("@/lib/clinical-link-limit.server");
    await enforceClinicalLinkLimit("action");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cleanProto = data.protocol.trim().toUpperCase();

    const rateCheck = checkProtocolRateLimit(cleanProto);
    if (!rateCheck.allowed) {
      throw new Error(
        `Muitas tentativas incorretas para este protocolo. Por segurança, tente novamente em ${rateCheck.remainingSeconds || 60}s.`,
      );
    }

    // Busca exata pelo identificador [AG-XXXX] nas observações
    const targetTag = `[${cleanProto}]`;
    const { data: appt, error } = await supabaseAdmin
      .from("appointments")
      .select(
        "id, patient_name, patient_phone, patient_email, service_name, appointment_date, appointment_time, notes",
      )
      .ilike("notes", `${targetTag}%`)
      .maybeSingle();

    if (error || !appt) {
      return { found: false, protocol: cleanProto };
    }

    const cleanPhone = (appt.patient_phone || "").replace(/\D/g, "");
    const actualLast4 = cleanPhone.length >= 4 ? cleanPhone.slice(-4) : "";
    const ddd = cleanPhone.length >= 10 ? cleanPhone.slice(0, 2) : "";

    // Se o paciente enviou os 4 dígitos finais para desbloquear a sessão:
    if (data.phoneDigits4) {
      if (actualLast4 && data.phoneDigits4 === actualLast4) {
        resetProtocolAttempts(cleanProto);
        // Gera token autenticado para este agendamento
        const authToken = generateAnamnesisToken({
          appointmentId: appt.id,
          protocol: cleanProto,
        });

        return {
          found: true,
          isVerified: true,
          token: authToken,
          protocol: cleanProto,
          appointment: {
            id: appt.id,
            patientId: null,
            patientName: appt.patient_name,
            patientPhone: appt.patient_phone,
            patientEmail: appt.patient_email,
            serviceName: appt.service_name,
            date: appt.appointment_date,
            time: appt.appointment_time,
          },
          alreadySubmitted: false,
        };
      } else {
        // Tentativa de PIN incorreta
        recordProtocolFailedAttempt(cleanProto);
        return {
          found: true,
          isVerified: false,
          protocol: cleanProto,
          requiresPhoneVerification: true,
          phoneHint: ddd ? `DDD (${ddd})` : undefined,
          error: "Os dígitos informados não conferem com o telefone do agendamento.",
          appointment: {
            id: appt.id,
            patientId: null,
            patientName: maskName(appt.patient_name),
            patientPhone: maskPhone(appt.patient_phone),
            patientEmail: maskEmail(appt.patient_email),
            serviceName: appt.service_name,
            date: appt.appointment_date,
            time: appt.appointment_time,
          },
          alreadySubmitted: false,
        };
      }
    }

    // Se NÃO passou verificação de telefone: retorna estritamente DADOS MASCARADOS para proteger PII
    return {
      found: true,
      isVerified: false,
      protocol: cleanProto,
      requiresPhoneVerification: true,
      phoneHint: ddd ? `DDD (${ddd})` : undefined,
      appointment: {
        id: appt.id,
        patientId: null, // Oculto sem verificação
        patientName: maskName(appt.patient_name),
        patientPhone: maskPhone(appt.patient_phone),
        patientEmail: maskEmail(appt.patient_email),
        serviceName: appt.service_name,
        date: appt.appointment_date,
        time: appt.appointment_time,
      },
      alreadySubmitted: false,
    };
  });
