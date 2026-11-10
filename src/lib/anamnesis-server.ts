import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  extractClinicalWarnings,
  formatAnamnesisContent,
  type AnamnesisAnswers,
} from "@/lib/anamnesis";
import { toISODate } from "@/lib/clinic";
import type { Database, Json } from "@/integrations/supabase/types";

type PatientUpdate = Database["public"]["Tables"]["patients"]["Update"];

const anamnesisSubmissionSchema = z.object({
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
 * Server function pública para submissão do formulário de anamnese pré-atendimento.
 * Permite que pacientes que acabaram de agendar (ou abriram via link do WhatsApp)
 * preencham seu histórico de saúde com segurança e integração total com o prontuário.
 */
export const submitPatientAnamnesis = createServerFn({ method: "POST" })
  .validator((data: unknown) => anamnesisSubmissionSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let resolvedPatientId: string | null = data.patientId || null;

    // 1. Tenta resolver o paciente pelo protocolo do agendamento se não tiver ID direto
    if (!resolvedPatientId && data.protocol) {
      const cleanProto = data.protocol.trim();
      const { data: appt } = await supabaseAdmin
        .from("appointments")
        .select("id, patient_id, patient_name, patient_phone")
        .ilike("notes", `%[${cleanProto}]%`)
        .limit(1)
        .maybeSingle();

      if (appt?.patient_id) {
        resolvedPatientId = appt.patient_id;
      }
    }

    // 2. Tenta resolver pelo telefone ou nome
    if (!resolvedPatientId && data.patientPhone) {
      const cleanPhone = data.patientPhone.replace(/\D/g, "");
      if (cleanPhone.length >= 8) {
        const last8 = cleanPhone.slice(-8);
        const { data: pByPhone } = await supabaseAdmin
          .from("patients")
          .select("id")
          .ilike("phone", `%${last8}%`)
          .limit(1)
          .maybeSingle();
        if (pByPhone) resolvedPatientId = pByPhone.id;
      }
    }

    if (!resolvedPatientId && data.patientName?.trim()) {
      const { data: pByName } = await supabaseAdmin
        .from("patients")
        .select("id")
        .ilike("name", data.patientName.trim())
        .limit(1)
        .maybeSingle();
      if (pByName) resolvedPatientId = pByName.id;
    }

    // 3. Se ainda assim não encontrar, auto-cria o paciente
    if (!resolvedPatientId) {
      const fallbackName = data.patientName?.trim() || "Paciente Agendamento Online";
      const { data: created, error: createErr } = await supabaseAdmin
        .from("patients")
        .insert({
          name: fallbackName,
          phone: data.patientPhone?.trim() || null,
          email: data.patientEmail?.trim() || null,
          origin: "Anamnese Pré-Atendimento Online",
          funnel_stage: "anamnese",
        })
        .select("id")
        .single();

      if (createErr || !created) {
        throw new Error("Não foi possível identificar ou registrar o paciente no prontuário.");
      }
      resolvedPatientId = created.id;
    }

    const answers = data.answers as AnamnesisAnswers;
    const warnings = extractClinicalWarnings(answers);
    const content = formatAnamnesisContent(answers);
    const today = toISODate(new Date());

    // 4. Salva o registro clínico no prontuário (clinical_records)
    const { error: recordError } = await supabaseAdmin.from("clinical_records").insert({
      patient_id: resolvedPatientId,
      record_type: "formulario",
      record_date: today,
      title: "Anamnese Pré-Atendimento Online (Clinicorp)",
      content,
      metadata: {
        submitted_at: new Date().toISOString(),
        protocol: data.protocol || null,
        appointment_id: data.appointmentId || null,
        answers: answers as unknown as Record<string, unknown>,
        source: "formulario_pre_atendimento",
      } as unknown as Json,
    });

    if (recordError) {
      console.error("[submitPatientAnamnesis] Insert record error:", recordError);
      throw new Error(`Erro ao salvar prontuário: ${recordError.message}`);
    }

    // 5. Atualiza o cadastro do paciente: alertas clínicos e avanço no funil (triagem -> anamnese)
    const patientUpdates: PatientUpdate = {
      funnel_stage: "anamnese",
    };

    if (warnings.length > 0) {
      // Mescla com alertas já existentes se houver
      const { data: currentPatient } = await supabaseAdmin
        .from("patients")
        .select("medical_warning")
        .eq("id", resolvedPatientId)
        .single();

      const existingWarning = currentPatient?.medical_warning?.trim() || "";
      const existingList = existingWarning ? existingWarning.split(" | ").map((s) => s.trim()) : [];
      const mergedWarnings = Array.from(new Set([...existingList, ...warnings]));
      patientUpdates.medical_warning = mergedWarnings.join(" | ");
    }

    await supabaseAdmin.from("patients").update(patientUpdates).eq("id", resolvedPatientId);

    return {
      success: true,
      patientId: resolvedPatientId,
      warningsCount: warnings.length,
      protocol: data.protocol || null,
    };
  });

/**
 * Consulta informações de agendamento por protocolo para pré-preenchimento
 * da página pública `/anamnese?protocolo=...`.
 */
export const getAnamnesisInfoByProtocol = createServerFn({ method: "GET" })
  .validator((protocol: string) => z.string().min(3).parse(protocol))
  .handler(async ({ data: protocol }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cleanProto = protocol.trim();

    const { data: appt, error } = await supabaseAdmin
      .from("appointments")
      .select(
        "id, patient_id, patient_name, patient_phone, patient_email, service_name, appointment_date, appointment_time, notes",
      )
      .ilike("notes", `%[${cleanProto}]%`)
      .limit(1)
      .maybeSingle();

    if (error || !appt) {
      return { found: false, protocol: cleanProto };
    }

    // Checa se já tem anamnese registrada para este paciente / agendamento
    let alreadySubmitted = false;
    if (appt.patient_id) {
      const { data: records } = await supabaseAdmin
        .from("clinical_records")
        .select("id, created_at")
        .eq("patient_id", appt.patient_id)
        .eq("record_type", "formulario")
        .limit(1);

      if (records && records.length > 0) {
        alreadySubmitted = true;
      }
    }

    return {
      found: true,
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
      alreadySubmitted,
    };
  });
