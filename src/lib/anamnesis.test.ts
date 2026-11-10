import { describe, it, expect, beforeAll } from "vitest";
import {
  extractClinicalWarnings,
  formatAnamnesisContent,
  maskName,
  maskPhone,
  maskEmail,
  DEFAULT_ANAMNESIS_ANSWERS,
  type AnamnesisAnswers,
} from "./anamnesis";
import { generateAnamnesisToken, validateAnamnesisToken } from "./anamnesis-server";

beforeAll(() => {
  process.env.APPOINTMENT_TOKEN_SECRET = "test-secret-anamnesis-0123456789abcdef";
});

describe("anamnesis pure utilities", () => {
  it("extracts no warnings when patient has healthy answers", () => {
    const answers: AnamnesisAnswers = {
      ...DEFAULT_ANAMNESIS_ANSWERS,
      reasonForVisit: "Limpeza de rotina",
    };
    const warnings = extractClinicalWarnings(answers);
    expect(warnings).toEqual([]);
  });

  it("extracts drug allergy warning with medication name", () => {
    const answers: AnamnesisAnswers = {
      ...DEFAULT_ANAMNESIS_ANSWERS,
      drugAllergy: "Sim",
      drugAllergyDetails: "Dipirona e Anti-inflamatórios",
    };
    const warnings = extractClinicalWarnings(answers);
    expect(warnings).toContain("Alergia Medicamentosa: Dipirona e Anti-inflamatórios");
  });

  it("extracts pregnancy with gestational month", () => {
    const answers: AnamnesisAnswers = {
      ...DEFAULT_ANAMNESIS_ANSWERS,
      pregnant: "Sim",
      pregnantMonth: "4º mês",
    };
    const warnings = extractClinicalWarnings(answers);
    expect(warnings).toContain("Gestante (4º mês)");
  });

  it("extracts local anesthesia reaction and systemic conditions", () => {
    const answers: AnamnesisAnswers = {
      ...DEFAULT_ANAMNESIS_ANSWERS,
      localAnesthesiaReaction: "Sim",
      normalBloodPressure: "Não",
      systemicConditions: ["Hipertenso", "Diabetes"],
    };
    const warnings = extractClinicalWarnings(answers);
    expect(warnings).toContain("Reação a Anestesia Local");
    expect(warnings).toContain("Pressão arterial alterada / Hipertensão");
    expect(warnings).toContain("Hipertenso");
    expect(warnings).toContain("Diabetes");
  });

  it("formats clinical records content matching Clinicorp standard", () => {
    const answers: AnamnesisAnswers = {
      ...DEFAULT_ANAMNESIS_ANSWERS,
      reasonForVisit: "Sensibilidade nos dentes inferiores",
      lastDentalTreatment: "Há 1 ano",
      drugAllergy: "Sim",
      drugAllergyDetails: "Amoxicilina",
      sensitivity: "Sim",
      systemicConditions: ["Gastrite / Refluxo"],
      notes: "Paciente prefere anestesia sem vasoconstritor se possível",
    };

    const content = formatAnamnesisContent(answers);
    expect(content).toContain("• Qual o motivo da consulta? Sensibilidade nos dentes inferiores");
    expect(content).toContain("• Quando foi o seu último tratamento odontológico? Há 1 ano");
    expect(content).toContain("• Tem alergia a algum medicamento? Sim (Amoxicilina)");
    expect(content).toContain("• Sente sensibilidade nos dentes? Sim");
    expect(content).toContain("• Condições sistêmicas: Gastrite / Refluxo");
    expect(content).toContain(
      "• Observações complementares: Paciente prefere anestesia sem vasoconstritor se possível",
    );
  });
});

describe("PII Masking & Privacy Protection", () => {
  it("masks patient full names protecting privacy", () => {
    expect(maskName("Livia Marie Bonfim")).toBe("L***a M***e B****m");
    expect(maskName("Ana")).toBe("A*a");
    expect(maskName("")).toBe("");
  });

  it("masks phone numbers protecting the last 4 digits (anti-challenge-leak)", () => {
    expect(maskPhone("(96) 98140-7223")).toBe("(96) 98***-****");
    expect(maskPhone("96981407223")).toBe("(96) 98***-****");
    expect(maskPhone("981407223")).toBe("98***-****");
    expect(maskPhone("")).toBe("");
  });

  it("masks email addresses", () => {
    expect(maskEmail("paciente@gmail.com")).toBe("p****e@g***l.com");
    expect(maskEmail("")).toBe("");
  });
});

describe("Anamnesis Cryptographic Token Security", () => {
  it("generates and validates an authentic anamnesis token", () => {
    const patientId = "patient-uuid-1234";
    const appointmentId = "appt-uuid-5678";
    const protocol = "AG-TEST";

    const token = generateAnamnesisToken({ patientId, appointmentId, protocol });
    expect(token).toBeTruthy();

    const verified = validateAnamnesisToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.patientId).toBe(patientId);
    expect(verified?.appointmentId).toBe(appointmentId);
    expect(verified?.protocol).toBe(protocol);
  });

  it("rejects forged anamnesis tokens", () => {
    const fakePayload = "v1.patient-123.appt-456.AG-TEST.9999999999999.nonce.fakesig";
    const forgedToken = Buffer.from(fakePayload).toString("base64url");
    const verified = validateAnamnesisToken(forgedToken);
    expect(verified).toBeNull();
  });

  it("rejects expired anamnesis tokens", () => {
    const token = generateAnamnesisToken({
      patientId: "patient-123",
      expiryDays: -1, // already expired
    });
    const verified = validateAnamnesisToken(token);
    expect(verified).toBeNull();
  });

  it("detects tampered patientId in valid anamnesis token", () => {
    const token = generateAnamnesisToken({ patientId: "victim-id" });
    const decoded = Buffer.from(token, "base64url").toString("utf-8");
    const tampered = decoded.replace("victim-id", "attacker-id");
    const tamperedToken = Buffer.from(tampered).toString("base64url");

    const verified = validateAnamnesisToken(tamperedToken);
    expect(verified).toBeNull();
  });
});
