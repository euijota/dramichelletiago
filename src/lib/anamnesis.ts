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
 * Mascara nomes de pacientes para consultas públicas, prevenindo vazamento de PII.
 * Ex: "Livia Marie Bonfim" -> "L**a M***e B****m"
 */
export function maskName(name: string | null | undefined): string {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  return parts
    .map((p) => {
      if (p.length <= 2) return p;
      return `${p[0]}${"*".repeat(Math.max(1, p.length - 2))}${p[p.length - 1]}`;
    })
    .join(" ");
}

/**
 * Mascara números de telefone para proteção da privacidade em consultas públicas.
 * Não revela os 4 últimos dígitos para evitar que sirva de resposta aos desafios de autenticação.
 * Ex: "(96) 98140-7223" -> "(96) 98***-****"
 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const clean = phone.replace(/\D/g, "");
  if (clean.length < 8) return "****";
  const ddd = clean.length >= 10 ? `(${clean.slice(0, 2)}) ` : "";
  const remaining = clean.length >= 10 ? clean.slice(2) : clean;
  const start = remaining.slice(0, 2);
  return `${ddd}${start}***-****`;
}

/**
 * Mascara e-mails para proteção de PII.
 * Ex: "contato@exemplo.com.br" -> "c***o@e***.com.br"
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email || !email.includes("@")) return "";
  const [local, domain] = email.trim().split("@");
  const maskedLocal =
    local.length <= 2
      ? `${local[0]}***`
      : `${local[0]}${"*".repeat(Math.min(4, local.length - 2))}${local[local.length - 1]}`;
  const domainParts = domain.split(".");
  const maskedDomainMain =
    domainParts[0].length <= 2
      ? domainParts[0]
      : `${domainParts[0][0]}***${domainParts[0][domainParts[0].length - 1]}`;
  const restDomain = domainParts.slice(1).join(".");
  return `${maskedLocal}@${maskedDomainMain}${restDomain ? `.${restDomain}` : ""}`;
}

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
