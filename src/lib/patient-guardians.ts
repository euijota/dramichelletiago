import { calculateAge } from "./crc";

export const GUARDIAN_RELATIONSHIPS = [
  "Mãe",
  "Pai",
  "Avó / Avô",
  "Tia / Tio",
  "Irmã / Irmão",
  "Tutor(a) Legal",
  "Responsável Financeiro",
  "Cônjuge",
  "Outro",
] as const;

export interface PatientGuardiansData {
  hasGuardian: boolean;
  guardianName: string;
  guardianRelationship: string;
  guardianCpf: string;
  guardianRg: string;
  guardianPhone: string;
  guardianEmail: string;
  guardianIsFinancialResponsible: boolean;
  hasSecondGuardian: boolean;
  secondGuardianName: string;
  secondGuardianRelationship: string;
  secondGuardianCpf: string;
  secondGuardianPhone: string;
  generalNotes: string;
}

export const EMPTY_GUARDIANS_DATA: PatientGuardiansData = {
  hasGuardian: false,
  guardianName: "",
  guardianRelationship: "Mãe",
  guardianCpf: "",
  guardianRg: "",
  guardianPhone: "",
  guardianEmail: "",
  guardianIsFinancialResponsible: true,
  hasSecondGuardian: false,
  secondGuardianName: "",
  secondGuardianRelationship: "Pai",
  secondGuardianCpf: "",
  secondGuardianPhone: "",
  generalNotes: "",
};

const GUARDIAN_LINE_PREFIX = "[RESPONSÁVEL LEGAL]";
const SECOND_GUARDIAN_LINE_PREFIX = "[2º RESPONSÁVEL]";

export function getPatientAge(
  birthDate: string | null | undefined,
  referenceDate: Date = new Date(),
): number | null {
  return calculateAge(birthDate, referenceDate);
}

export function isMinorPatient(
  birthDate: string | null | undefined,
  referenceDate: Date = new Date(),
): boolean {
  const age = getPatientAge(birthDate, referenceDate);
  return age !== null && age < 18;
}

export function formatPatientAgeLabel(
  birthDate: string | null | undefined,
  referenceDate: Date = new Date(),
): string | null {
  const age = getPatientAge(birthDate, referenceDate);
  if (age === null) return null;
  const unit = age === 1 ? "ano" : "anos";
  return age < 18 ? `${age} ${unit} (Menor de idade)` : `${age} ${unit}`;
}

function cleanSingleLineField(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/[\r\n]+/g, " ")
    .replace(/\|/g, "/")
    .trim();
}

function parseKeyValueSegments(rawBody: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const segment of rawBody.split("|")) {
    const colonIdx = segment.indexOf(":");
    if (colonIdx === -1) continue;
    const key = segment.slice(0, colonIdx).trim().toLowerCase();
    const val = segment.slice(colonIdx + 1).trim();
    if (key) {
      map[key] = val;
    }
  }
  return map;
}

export function serializePatientNotes(data: PatientGuardiansData): string | null {
  const lines: string[] = [];

  const general = (data.generalNotes || "").trim();
  if (general) {
    lines.push(general);
  }

  const gName = cleanSingleLineField(data.guardianName);
  if (data.hasGuardian && gName) {
    const parts: string[] = [
      `Nome: ${gName}`,
      `Parentesco: ${cleanSingleLineField(data.guardianRelationship) || "Mãe"}`,
    ];
    const gCpf = cleanSingleLineField(data.guardianCpf);
    const gRg = cleanSingleLineField(data.guardianRg);
    const gPhone = cleanSingleLineField(data.guardianPhone);
    const gEmail = cleanSingleLineField(data.guardianEmail);

    if (gCpf) parts.push(`CPF: ${gCpf}`);
    if (gRg) parts.push(`RG: ${gRg}`);
    if (gPhone) parts.push(`Tel: ${gPhone}`);
    if (gEmail) parts.push(`Email: ${gEmail}`);
    parts.push(`Resp. Financeiro: ${data.guardianIsFinancialResponsible ? "Sim" : "Não"}`);

    lines.push(`${GUARDIAN_LINE_PREFIX} ${parts.join(" | ")}`);
  }

  const sName = cleanSingleLineField(data.secondGuardianName);
  if (data.hasSecondGuardian && sName) {
    const parts: string[] = [
      `Nome: ${sName}`,
      `Parentesco: ${cleanSingleLineField(data.secondGuardianRelationship) || "Pai"}`,
    ];
    const sCpf = cleanSingleLineField(data.secondGuardianCpf);
    const sPhone = cleanSingleLineField(data.secondGuardianPhone);

    if (sCpf) parts.push(`CPF: ${sCpf}`);
    if (sPhone) parts.push(`Tel: ${sPhone}`);

    lines.push(`${SECOND_GUARDIAN_LINE_PREFIX} ${parts.join(" | ")}`);
  }

  if (lines.length === 0) return null;
  return lines.join("\n");
}

export function parsePatientNotes(
  rawNotes: string | null | undefined,
  birthDate?: string | null,
): PatientGuardiansData {
  const result: PatientGuardiansData = { ...EMPTY_GUARDIANS_DATA };
  const generalLines: string[] = [];
  let foundGuardian = false;
  let foundSecondGuardian = false;

  if (rawNotes && typeof rawNotes === "string") {
    for (const rawLine of rawNotes.split(/\r?\n/)) {
      const trimmed = rawLine.trim();
      if (trimmed.startsWith(GUARDIAN_LINE_PREFIX)) {
        foundGuardian = true;
        const body = trimmed.slice(GUARDIAN_LINE_PREFIX.length).trim();
        const fields = parseKeyValueSegments(body);
        result.guardianName = fields["nome"] || "";
        result.guardianRelationship = fields["parentesco"] || "Mãe";
        result.guardianCpf = fields["cpf"] || "";
        result.guardianRg = fields["rg"] || "";
        result.guardianPhone = fields["tel"] || "";
        result.guardianEmail = fields["email"] || "";
        const finVal = (fields["resp. financeiro"] || "Sim").toLowerCase();
        result.guardianIsFinancialResponsible = finVal !== "não" && finVal !== "nao";
      } else if (trimmed.startsWith(SECOND_GUARDIAN_LINE_PREFIX)) {
        foundSecondGuardian = true;
        const body = trimmed.slice(SECOND_GUARDIAN_LINE_PREFIX.length).trim();
        const fields = parseKeyValueSegments(body);
        result.secondGuardianName = fields["nome"] || "";
        result.secondGuardianRelationship = fields["parentesco"] || "Pai";
        result.secondGuardianCpf = fields["cpf"] || "";
        result.secondGuardianPhone = fields["tel"] || "";
      } else if (trimmed.length > 0) {
        generalLines.push(rawLine);
      }
    }
  }

  result.generalNotes = generalLines.join("\n").trim();
  result.hasGuardian = foundGuardian || Boolean(result.guardianName) || isMinorPatient(birthDate);
  result.hasSecondGuardian = foundSecondGuardian || Boolean(result.secondGuardianName);

  return result;
}
