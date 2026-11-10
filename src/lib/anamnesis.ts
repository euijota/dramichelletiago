export interface AnamnesisAnswers {
  reasonForVisit: string;
  lastDentalTreatment: string;
  medicalTreatment: "Sim" | "Não";
  medicalTreatmentDetails?: string;
  takingMedication: "Sim" | "Não";
  continuousMeds?: string;
  drugAllergy: "Sim" | "Não";
  drugAllergyDetails?: string;
  localAnesthesiaReaction: "Sim" | "Não";
  foodAllergy: "Sim" | "Não";
  foodAllergyDetails?: string;
  bleedingGums: "Sim" | "Não" | "Às vezes";
  foodRetention: "Sim" | "Não";
  sensitivity: "Sim" | "Não";
  bruxism: "Sim" | "Não";
  habits: "Sim" | "Não";
  habitsDetails?: string;
  smoking: "Sim" | "Não";
  smokingDetails?: string;
  excessiveBleeding: "Sim" | "Não";
  facialOrTmjPain: "Sim" | "Não";
  faintingOrEpilepsy: "Sim" | "Não";
  normalBloodPressure: "Sim" | "Não";
  pregnant: "Sim" | "Não";
  pregnantMonth?: string;
  previousOrthodontics: "Sim" | "Não";
  smileComplaint: "Sim" | "Não";
  smileComplaintDetails?: string;
  systemicConditions: string[];
  notes?: string;
}

export const SYSTEMIC_CONDITIONS_OPTIONS = [
  "Hipertenso",
  "Diabetes",
  "Problemas Cardíacos",
  "Problemas Respiratórios / Asma",
  "Problemas Renais",
  "Gastrite / Refluxo",
] as const;

export const DEFAULT_ANAMNESIS_ANSWERS: AnamnesisAnswers = {
  reasonForVisit: "",
  lastDentalTreatment: "",
  medicalTreatment: "Não",
  medicalTreatmentDetails: "",
  takingMedication: "Não",
  continuousMeds: "",
  drugAllergy: "Não",
  drugAllergyDetails: "",
  localAnesthesiaReaction: "Não",
  foodAllergy: "Não",
  foodAllergyDetails: "",
  bleedingGums: "Não",
  foodRetention: "Não",
  sensitivity: "Não",
  bruxism: "Não",
  habits: "Não",
  habitsDetails: "",
  smoking: "Não",
  smokingDetails: "",
  excessiveBleeding: "Não",
  facialOrTmjPain: "Não",
  faintingOrEpilepsy: "Não",
  normalBloodPressure: "Sim",
  pregnant: "Não",
  pregnantMonth: "",
  previousOrthodontics: "Não",
  smileComplaint: "Não",
  smileComplaintDetails: "",
  systemicConditions: [],
  notes: "",
};

/**
 * Extrai alertas médicos clínicos críticos com base no questionário padrão Clinicorp.
 * Alertas gerados são gravados na coluna `medical_warning` do paciente para visualização rápida no prontuário.
 */
export function extractClinicalWarnings(answers: Partial<AnamnesisAnswers>): string[] {
  const warnings: string[] = [];

  if (answers.drugAllergy === "Sim") {
    warnings.push(
      `Alergia Medicamentosa: ${answers.drugAllergyDetails?.trim() || "Sim (Averiguar)"}`,
    );
  }

  if (answers.localAnesthesiaReaction === "Sim") {
    warnings.push("Reação a Anestesia Local");
  }

  if (answers.pregnant === "Sim") {
    warnings.push(
      `Gestante${answers.pregnantMonth?.trim() ? ` (${answers.pregnantMonth.trim()})` : ""}`,
    );
  }

  if (answers.excessiveBleeding === "Sim") {
    warnings.push("Sangramento excessivo / Hemorragia");
  }

  if (answers.faintingOrEpilepsy === "Sim") {
    warnings.push("Histórico de desmaio / convulsão");
  }

  if (answers.normalBloodPressure === "Não") {
    warnings.push("Pressão arterial alterada / Hipertensão");
  }

  if (Array.isArray(answers.systemicConditions) && answers.systemicConditions.length > 0) {
    warnings.push(...answers.systemicConditions);
  }

  return warnings;
}

/**
 * Formata o conteúdo do formulário de anamnese para inserção no `clinical_records`.
 * Segue estritamente a padronização oficial Clinicorp / Consultorio.me já adotada no consultório da Dra. Michelle Tiago.
 */
export function formatAnamnesisContent(answers: Partial<AnamnesisAnswers>): string {
  const lines: Array<string | null> = [
    answers.reasonForVisit ? `• Qual o motivo da consulta? ${answers.reasonForVisit.trim()}` : null,
    answers.lastDentalTreatment
      ? `• Quando foi o seu último tratamento odontológico? ${answers.lastDentalTreatment.trim()}`
      : null,
    `• Está fazendo algum tratamento médico? ${answers.medicalTreatment || "Não"}${
      answers.medicalTreatment === "Sim" && answers.medicalTreatmentDetails?.trim()
        ? ` (${answers.medicalTreatmentDetails.trim()})`
        : ""
    }`,
    `• Está tomando algum medicamento? ${answers.takingMedication || "Não"}${
      answers.takingMedication === "Sim" && answers.continuousMeds?.trim()
        ? ` (${answers.continuousMeds.trim()})`
        : ""
    }`,
    `• Tem alergia a algum medicamento? ${answers.drugAllergy || "Não"}${
      answers.drugAllergy === "Sim" && answers.drugAllergyDetails?.trim()
        ? ` (${answers.drugAllergyDetails.trim()})`
        : ""
    }`,
    `• Teve alguma reação a anestesia local? ${answers.localAnesthesiaReaction || "Não"}`,
    `• Já teve ou tem reação alérgica a algum alimento? ${answers.foodAllergy || "Não"}${
      answers.foodAllergy === "Sim" && answers.foodAllergyDetails?.trim()
        ? ` (${answers.foodAllergyDetails.trim()})`
        : ""
    }`,
    `• Sua gengiva sangra com frequência? ${answers.bleedingGums || "Não"}`,
    `• Há retenção de alimentos entre os dentes? ${answers.foodRetention || "Não"}`,
    `• Sente sensibilidade nos dentes? ${answers.sensitivity || "Não"}`,
    `• Range os dentes ou tem apertamento? ${answers.bruxism || "Não"}`,
    `• Tem algum hábito? ${answers.habits || "Não"}${
      answers.habits === "Sim" && answers.habitsDetails?.trim()
        ? ` (${answers.habitsDetails.trim()})`
        : ""
    }`,
    `• Fuma? ${answers.smoking || "Não"}${
      answers.smoking === "Sim" && answers.smokingDetails?.trim()
        ? ` (${answers.smokingDetails.trim()})`
        : ""
    }`,
    `• Quando você se corta, sangra muito? ${answers.excessiveBleeding || "Não"}`,
    `• Sente dores de cabeça, dores na face, ouvido ou articulação? ${answers.facialOrTmjPain || "Não"}`,
    `• Teve algum desmaio, tem ataques nervosos, epilepsia ou convulsão? ${answers.faintingOrEpilepsy || "Não"}`,
    `• Sua pressão arterial é normal? ${answers.normalBloodPressure || "Sim"}`,
    `• Está grávida? ${answers.pregnant || "Não"}${
      answers.pregnant === "Sim" && answers.pregnantMonth?.trim()
        ? ` (${answers.pregnantMonth.trim()})`
        : ""
    }`,
    `• Já fez tratamento ortodôntico? ${answers.previousOrthodontics || "Não"}`,
    `• Há algo que lhe incomoda no seu sorriso? ${answers.smileComplaint || "Não"}${
      answers.smileComplaint === "Sim" && answers.smileComplaintDetails?.trim()
        ? ` (${answers.smileComplaintDetails.trim()})`
        : ""
    }`,
    `• Condições sistêmicas: ${
      answers.systemicConditions && answers.systemicConditions.length > 0
        ? answers.systemicConditions.join(", ")
        : "Nenhuma informada"
    }`,
    answers.notes?.trim() ? `• Observações complementares: ${answers.notes.trim()}` : null,
  ];

  return lines.filter(Boolean).join("\n");
}
