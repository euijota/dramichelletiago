import { describe, it, expect } from "vitest";
import {
  EMPTY_GUARDIANS_DATA,
  getPatientAge,
  isMinorPatient,
  formatPatientAgeLabel,
  serializePatientNotes,
  parsePatientNotes,
} from "./patient-guardians";

describe("Patient Guardians & Minor Detection", () => {
  const refDate = new Date(2026, 10, 19); // 19/11/2026

  describe("Idade e detecção de menor de idade", () => {
    it("deve detectar corretamente paciente menor de 18 anos", () => {
      expect(getPatientAge("2018-05-10", refDate)).toBe(8);
      expect(isMinorPatient("2018-05-10", refDate)).toBe(true);
      expect(formatPatientAgeLabel("2018-05-10", refDate)).toBe("8 anos (Menor de idade)");

      // Completa 18 anos no dia seguinte -> ainda tem 17 anos
      expect(isMinorPatient("2008-11-20", refDate)).toBe(true);
      expect(formatPatientAgeLabel("2025-10-01", refDate)).toBe("1 ano (Menor de idade)");
    });

    it("deve classificar corretamente paciente maior ou igual a 18 anos", () => {
      expect(getPatientAge("2008-11-19", refDate)).toBe(18);
      expect(isMinorPatient("2008-11-19", refDate)).toBe(false);
      expect(formatPatientAgeLabel("2008-11-19", refDate)).toBe("18 anos");
      expect(formatPatientAgeLabel("1990-01-10", refDate)).toBe("36 anos");
    });

    it("deve lidar com datas vazias ou inválidas sem erro", () => {
      expect(getPatientAge(null, refDate)).toBeNull();
      expect(getPatientAge("", refDate)).toBeNull();
      expect(isMinorPatient(null, refDate)).toBe(false);
      expect(formatPatientAgeLabel("", refDate)).toBeNull();
    });
  });

  describe("Serialização e parsing de responsáveis em patients.notes", () => {
    it("deve realizar round-trip completo com 1º responsável, 2º responsável e observações gerais", () => {
      const original = {
        hasGuardian: true,
        guardianName: "Maria Fernanda Silva",
        guardianRelationship: "Mãe",
        guardianCpf: "111.222.333-44",
        guardianRg: "123456-AP",
        guardianPhone: "(96) 99123-4567",
        guardianEmail: "maria.silva@exemplo.com",
        guardianIsFinancialResponsible: false,
        hasSecondGuardian: true,
        secondGuardianName: "Carlos Eduardo Silva",
        secondGuardianRelationship: "Pai",
        secondGuardianCpf: "555.666.777-88",
        secondGuardianPhone: "(96) 98111-2222",
        generalNotes: "Prefere atendimento no turno da manhã.\nAcompanhado pelos pais.",
      };

      const serialized = serializePatientNotes(original);
      expect(serialized).toBeTruthy();
      expect(serialized).toContain("[RESPONSÁVEL LEGAL]");
      expect(serialized).toContain("[2º RESPONSÁVEL]");

      const parsed = parsePatientNotes(serialized, "2018-05-10");
      expect(parsed).toEqual(original);
    });

    it("deve preservar notas antigas livres sem tags de responsável", () => {
      const legacyNotes = "Paciente antigo do Consultório.me. Prefere contato via WhatsApp.";
      const parsed = parsePatientNotes(legacyNotes, "1985-03-22");

      expect(parsed.hasGuardian).toBe(false);
      expect(parsed.hasSecondGuardian).toBe(false);
      expect(parsed.guardianName).toBe("");
      expect(parsed.generalNotes).toBe(legacyNotes);
    });

    it("deve ativar hasGuardian automaticamente no parse quando o paciente for menor de 18 anos", () => {
      const minorBirth = `${new Date().getFullYear() - 10}-06-15`;
      const parsed = parsePatientNotes(null, minorBirth);

      expect(parsed.hasGuardian).toBe(true);
      expect(parsed.guardianName).toBe("");
      expect(parsed.guardianRelationship).toBe("Mãe");
    });

    it("deve retornar null na serialização quando tudo estiver vazio ou sem nome do responsável", () => {
      expect(serializePatientNotes(EMPTY_GUARDIANS_DATA)).toBeNull();
      expect(
        serializePatientNotes({
          ...EMPTY_GUARDIANS_DATA,
          hasGuardian: true,
          guardianName: "   ",
        }),
      ).toBeNull();
    });
  });
});
