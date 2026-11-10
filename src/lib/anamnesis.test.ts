import { describe, it, expect } from "vitest";
import {
  extractClinicalWarnings,
  formatAnamnesisContent,
  DEFAULT_ANAMNESIS_ANSWERS,
  type AnamnesisAnswers,
} from "./anamnesis";

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
