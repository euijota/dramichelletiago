import { describe, it, expect } from "vitest";
import {
  buildWhatsAppUniversalUrl,
  parseDateSafe,
  isBirthdayInMonth,
  calculateAge,
  classifyReturnAlert,
  classifyAppointmentTiming,
  parseOrcamentoInfo,
} from "./crc";

describe("CRC Utilities", () => {
  describe("buildWhatsAppUniversalUrl", () => {
    it("deve gerar link universal api.whatsapp.com com DDI 55", () => {
      const url = buildWhatsAppUniversalUrl("(96) 98123-4567", "Olá Michelle!");
      expect(url).toContain("https://api.whatsapp.com/send?phone=5596981234567");
      expect(url).toContain("text=Ol%C3%A1%20Michelle!");
    });

    it("não deve duplicar 55 se o número já possuir DDI", () => {
      const url = buildWhatsAppUniversalUrl("5596981234567", "Teste");
      expect(url).toContain("phone=5596981234567");
      expect(url).not.toContain("phone=5555");
    });

    it("deve retornar # para telefones nulos ou inválidos", () => {
      expect(buildWhatsAppUniversalUrl(null)).toBe("#");
      expect(buildWhatsAppUniversalUrl("")).toBe("#");
      expect(buildWhatsAppUniversalUrl("123")).toBe("#");
    });
  });

  describe("parseDateSafe", () => {
    it("deve processar formato ISO YYYY-MM-DD", () => {
      const parsed = parseDateSafe("1995-11-20");
      expect(parsed).toEqual({ year: 1995, month: 11, day: 20 });
    });

    it("deve processar formato ISO com timestamp", () => {
      const parsed = parseDateSafe("2026-11-10T15:00:00.000Z");
      expect(parsed).toEqual({ year: 2026, month: 11, day: 10 });
    });

    it("deve processar formato brasileiro DD/MM/YYYY", () => {
      const parsed = parseDateSafe("20/11/1983");
      expect(parsed).toEqual({ year: 1983, month: 11, day: 20 });
    });

    it("deve retornar null para strings inválidas", () => {
      expect(parseDateSafe(null)).toBeNull();
      expect(parseDateSafe("data-invalida")).toBeNull();
      expect(parseDateSafe("")).toBeNull();
    });
  });

  describe("isBirthdayInMonth", () => {
    it("deve identificar corretamente aniversariantes do mês", () => {
      expect(isBirthdayInMonth("1990-11-25", 11)).toBe(true);
      expect(isBirthdayInMonth("25/11/1990", 11)).toBe(true);
      expect(isBirthdayInMonth("1990-05-10", 11)).toBe(false);
      expect(isBirthdayInMonth(null, 11)).toBe(false);
    });
  });

  describe("calculateAge", () => {
    it("deve calcular a idade corretamente", () => {
      const ref = new Date(2026, 10, 9); // 09 de Novembro de 2026
      expect(calculateAge("2000-11-05", ref)).toBe(26); // Já fez aniversário
      expect(calculateAge("2000-11-20", ref)).toBe(25); // Ainda vai fazer este mês
      expect(calculateAge("1980-01-15", ref)).toBe(46);
    });
  });

  describe("classifyReturnAlert", () => {
    const ref = new Date(2026, 10, 9); // 09/11/2026

    it("deve classificar alertas vencidos", () => {
      expect(classifyReturnAlert("2026-11-01", ref)).toBe("vencido");
      expect(classifyReturnAlert("2025-10-15", ref)).toBe("vencido");
    });

    it("deve classificar alertas do mês atual", () => {
      expect(classifyReturnAlert("2026-11-15", ref)).toBe("mes_atual");
      expect(classifyReturnAlert("2026-11-30", ref)).toBe("mes_atual");
    });

    it("deve classificar alertas futuros", () => {
      expect(classifyReturnAlert("2026-12-05", ref)).toBe("futuro");
      expect(classifyReturnAlert("2027-05-20", ref)).toBe("futuro");
    });
  });

  describe("classifyAppointmentTiming", () => {
    const ref = new Date(2026, 10, 9); // 09/11/2026

    it("deve identificar hoje, amanha e passado", () => {
      expect(classifyAppointmentTiming("2026-11-08", ref)).toBe("passado");
      expect(classifyAppointmentTiming("2026-11-09", ref)).toBe("hoje");
      expect(classifyAppointmentTiming("2026-11-10", ref)).toBe("amanha");
      expect(classifyAppointmentTiming("2026-11-15", ref)).toBe("futuro");
    });
  });

  describe("parseOrcamentoInfo", () => {
    it("deve extrair status e valor com sucesso", () => {
      const res = parseOrcamentoInfo(
        "Orçamento [Pendente] — Restaurações e Limpeza",
        "Procedimento: Resina\nValor: R$ 850,00\nStatus: Pendente",
      );
      expect(res.status).toBe("pendente");
      expect(res.amount).toBe("R$ 850,00");
    });

    it("deve identificar aprovado e recusado", () => {
      expect(parseOrcamentoInfo("Orçamento Aprovado", "Valor: R$ 1.200,00").status).toBe(
        "aprovado",
      );
      expect(parseOrcamentoInfo("Orçamento Recusado", "").status).toBe("recusado");
    });
  });
});
