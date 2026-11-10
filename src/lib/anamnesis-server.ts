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
import type { Database, Json } from "@/integrations/supabase/types";

type PatientUpdate = Database["public"]["Tables"]["patients"]["Update"];

function getAnamnesisSecret(): string {
  return (
    process.env.APPOINTMENT_TOKEN_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "dramichelle-anamnesis-secret-salt-2026"
  );
}

/**
 * Gera um token criptografado HMAC-SHA256 para comprovar posse e autorização
 * sobre o preenchimento de anamnese de um paciente/agendamento específico.
 * Formato: v1.<patientId>.<appointmentId>.<protocol>.<expiresAt>.<nonce>.<sig>
 */
export function generateAnamnesisToken({
  patientId,
  appointmentId,
  protocol,
  expiryDays = 30,
}: {
  patientId: string;
  appointmentId?: string | null;
  protocol?: string | null;
  expiryDays?: number;
}): string {
  const secret = getAnamnesisSecret();
  const expiresAt = Date.now() + expiryDays * 24 * 60 * 60 * 1000;
  const nonce = crypto.randomBytes(12).toString("base64url");
  const appt = appointmentId || "none";
  const proto = protocol || "none";

  const dataToSign = `anamnese:v1:${patientId}:${appt}:${proto}:${expiresAt}:${nonce}`;
  const sig = crypto.createHmac("sha256", secret).update(dataToSign).digest("base64url");

  const payload = `v1.${patientId}.${appt}.${proto}.${expiresAt}.${nonce}.${sig}`;
  return Buffer.from(payload).toString("base64url");
}

/**
 * Valida a assinatura HMAC e expiração do token de anamnese em tempo constante.
 * Retorna os dados comprovados ou null se o token for forjado/expirado.
 */
export function validateAnamnesisToken(token: string): {
  patientId: string;
  appointmentId: string | null;
  protocol: string | null;
} | null {
  try {
    if (!token || typeof token !== "string") return null;
    let decoded = "";
    try {
      decoded = Buffer.from(token, "base64url").toString("utf-8");
    } catch {
      return null;
    }

    if (!decoded.startsWith("v1.")) return null;

    const parts = decoded.split(".");
    if (parts.length !== 7) return null;

    const [, patientId, appt, proto, expStr, nonce, sig] = parts;
    if (!patientId || !appt || !proto || !expStr || !nonce || !sig) return null;

    const expiresAt = Number(expStr);
    if (isNaN(expiresAt) || Date.now() > expiresAt) return null;

    const secret = getAnamnesisSecret();
    const dataToSign = `anamnese:v1:${patientId}:${appt}:${proto}:${expStr}:${nonce}`;
    const expected = crypto.createHmac("sha256", secret).update(dataToSign).digest("base64url");

    const expectedBuf = Buffer.from(expected);
    const actualBuf = Buffer.from(sig);
    if (expectedBuf.length !== actualBuf.length) return null;
    if (!crypto.timingSafeEqual(expectedBuf, actualBuf)) return null;

    return {
      patientId,
      appointmentId: appt === "none" ? null : appt,
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let isIdentityVerified = false;
    let targetPatientId: string | null = null;
    let targetAppointmentId: string | null = data.appointmentId || null;
    let targetProtocol: string | null = data.protocol || null;

    // 1. Verificação Criptográfica via Token
    if (data.token) {
      const verified = validateAnamnesisToken(data.token);
      if (verified) {
        isIdentityVerified = true;
        targetPatientId = verified.patientId;
        if (verified.appointmentId) targetAppointmentId = verified.appointmentId;
        if (verified.protocol) targetProtocol = verified.protocol;
      } else {
        throw new Error(
          "Token de segurança da anamnese é inválido ou expirou. Por favor, acerte seu agendamento ou solicite novo link.",
        );
      }
    }

    // 2. Submissão avulsa (sem token comprovado): NÃO toca em pacientes existentes
    if (!isIdentityVerified) {
      const safeName = data.patientName?.trim() || "Paciente Não Identificado (Web)";
      const { data: createdPatient, error: createErr } = await supabaseAdmin
        .from("patients")
        .insert({
          name: safeName,
          phone: data.patientPhone?.trim() || null,
          email: data.patientEmail?.trim() || null,
          origin: "Anamnese Web (Avulsa - Não Verificada)",
          notes:
            "Atenção: Formulário preenchido via web sem link autenticado de agendamento. Conferir dados antes do atendimento presencial.",
        })
        .select("id")
        .single();

      if (createErr || !createdPatient) {
        throw new Error("Falha ao registrar formulário de pré-atendimento.");
      }
      targetPatientId = createdPatient.id;
    }

    const answers = data.answers as AnamnesisAnswers;
    const warnings = extractClinicalWarnings(answers);
    const content = formatAnamnesisContent(answers);
    const today = toISODate(new Date());

    // 3. Salva o registro clínico no prontuário (clinical_records)
    const { error: recordError } = await supabaseAdmin.from("clinical_records").insert({
      patient_id: targetPatientId!,
      record_type: "formulario",
      record_date: today,
      title: isIdentityVerified
        ? "Anamnese Pré-Atendimento Online (Verificada)"
        : "Anamnese Pré-Atendimento Online (Pendente de Verificação)",
      content,
      metadata: {
        submitted_at: new Date().toISOString(),
        is_verified: isIdentityVerified,
        protocol: targetProtocol,
        appointment_id: targetAppointmentId,
        answers: answers as unknown as Record<string, unknown>,
        source: isIdentityVerified ? "agendamento_autenticado" : "formulario_publico_avulso",
      } as unknown as Json,
    });

    if (recordError) {
      console.error("[submitPatientAnamnesis] Insert record error:", recordError);
      throw new Error(`Erro ao salvar prontuário: ${recordError.message}`);
    }

    // 4. Somente atualiza medical_warning e promove no funil se a identidade estiver COMPROVADA
    if (isIdentityVerified && targetPatientId) {
      const patientUpdates: PatientUpdate = {
        funnel_stage: "anamnese",
      };

      if (warnings.length > 0) {
        const { data: currentPatient } = await supabaseAdmin
          .from("patients")
          .select("medical_warning")
          .eq("id", targetPatientId)
          .single();

        const existingWarning = currentPatient?.medical_warning?.trim() || "";
        const existingList = existingWarning
          ? existingWarning.split(" | ").map((s) => s.trim())
          : [];
        const mergedWarnings = Array.from(new Set([...existingList, ...warnings]));
        patientUpdates.medical_warning = mergedWarnings.join(" | ");
      }

      await supabaseAdmin.from("patients").update(patientUpdates).eq("id", targetPatientId);
    }

    return {
      success: true,
      patientId: targetPatientId,
      isVerified: isIdentityVerified,
      warningsCount: warnings.length,
      protocol: targetProtocol,
    };
  });

/**
 * Consulta segura por Token Criptográfico (URL com ?token=...)
 */
export const getAnamnesisInfoByToken = createServerFn({ method: "GET" })
  .validator((token: string) => z.string().min(10).parse(token))
  .handler(async ({ data: token }) => {
    const verified = validateAnamnesisToken(token);
    if (!verified) {
      return { found: false, error: "Token inválido ou expirado." };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: patient } = await supabaseAdmin
      .from("patients")
      .select("id, name, phone, email")
      .eq("id", verified.patientId)
      .maybeSingle();

    let apptData: {
      id: string;
      service_name: string;
      appointment_date: string;
      appointment_time: string;
    } | null = null;

    if (verified.appointmentId) {
      const { data: appt } = await supabaseAdmin
        .from("appointments")
        .select("id, service_name, appointment_date, appointment_time")
        .eq("id", verified.appointmentId)
        .maybeSingle();
      if (appt) apptData = appt;
    }

    // Checa se já existe anamnese registrada
    let alreadySubmitted = false;
    const { data: records } = await supabaseAdmin
      .from("clinical_records")
      .select("id")
      .eq("patient_id", verified.patientId)
      .eq("record_type", "formulario")
      .limit(1);

    if (records && records.length > 0) {
      alreadySubmitted = true;
    }

    return {
      found: true,
      isVerified: true,
      token,
      protocol: verified.protocol,
      appointment: {
        id: apptData?.id || verified.appointmentId,
        patientId: verified.patientId,
        patientName: patient?.name || "Paciente",
        patientPhone: patient?.phone || null,
        patientEmail: patient?.email || null,
        serviceName: apptData?.service_name || "Consulta Odontológica",
        date: apptData?.appointment_date || null,
        time: apptData?.appointment_time || null,
      },
      alreadySubmitted,
    };
  });

const protocolLookupSchema = z.object({
  protocol: z
    .string()
    .regex(/^AG-[A-Z0-9]{4,10}$/i, "Protocolo inválido (formato esperado: AG-XXXX)"),
  phoneDigits4: z.string().length(4).optional(),
});

/**
 * Consulta de anamnese por protocolo com proteção anti-vazamento de PII.
 * Sem confirmação dos 4 dígitos finais do telefone, retorna apenas dados mascarados.
 */
export const getAnamnesisInfoByProtocol = createServerFn({ method: "POST" })
  .validator((input) => protocolLookupSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cleanProto = data.protocol.trim().toUpperCase();

    // Busca exata pelo identificador [AG-XXXX] nas observações
    const targetTag = `[${cleanProto}]`;
    const { data: appt, error } = await supabaseAdmin
      .from("appointments")
      .select(
        "id, patient_id, patient_name, patient_phone, patient_email, service_name, appointment_date, appointment_time, notes",
      )
      .ilike("notes", `%${targetTag}%`)
      .limit(1)
      .maybeSingle();

    if (error || !appt) {
      return { found: false, protocol: cleanProto };
    }

    const cleanPhone = (appt.patient_phone || "").replace(/\D/g, "");
    const actualLast4 = cleanPhone.length >= 4 ? cleanPhone.slice(-4) : "";

    // Se o paciente enviou os 4 dígitos finais para desbloquear a sessão:
    if (data.phoneDigits4 && actualLast4 && data.phoneDigits4 === actualLast4) {
      // Gera token autenticado para este agendamento
      const authToken = generateAnamnesisToken({
        patientId: appt.patient_id || appt.id,
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
          patientId: appt.patient_id,
          patientName: appt.patient_name,
          patientPhone: appt.patient_phone,
          patientEmail: appt.patient_email,
          serviceName: appt.service_name,
          date: appt.appointment_date,
          time: appt.appointment_time,
        },
        alreadySubmitted: false,
      };
    }

    // Se NÃO passou verificação de telefone: retorna estritamente DADOS MASCARADOS para proteger PII
    return {
      found: true,
      isVerified: false,
      protocol: cleanProto,
      requiresPhoneVerification: true,
      phoneHint: actualLast4 ? `final ****-${actualLast4}` : undefined,
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
