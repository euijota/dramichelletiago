import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildWhatsAppReminderMessage,
  buildEmailReminderMessage,
  buildWhatsAppReminderUrl,
  formatBrazilianDate,
  shouldSendReminder,
} from "./reminders";

describe("Reminder Templates", () => {
  const mockData = {
    patientName: "João Silva",
    appointmentDate: "2026-08-15",
    appointmentTime: "14:30",
    serviceName: "Limpeza e Avaliação",
  };

  it("should build WhatsApp reminder message", () => {
    const message = buildWhatsAppReminderMessage(mockData);

    expect(message).toContain("João Silva");
    expect(message).toContain("15/08/2026");
    expect(message).toContain("14:30");
    expect(message).toContain("Limpeza e Avaliação");
    expect(message).toContain("🦷");
    expect(message).toContain("Dra. Michelle Barbosa Tiago");
  });

  it("should build email reminder message", () => {
    const message = buildEmailReminderMessage(mockData);

    expect(message).toContain("João Silva");
    expect(message).toContain("15/08/2026");
    expect(message).toContain("14:30");
    expect(message).toContain("Limpeza e Avaliação");
    expect(message).toContain("LEMBRETE DE CONSULTA");
    expect(message).toContain("10 minutos de antecedência");
  });

  it("should build WhatsApp reminder URL", () => {
    const url = buildWhatsAppReminderUrl("(96) 98765-4321", mockData);

    expect(url).toContain("https://wa.me/55");
    expect(url).toContain("96987654321");
    expect(url).toContain("text=");
    expect(decodeURIComponent(url)).toContain("João Silva");
  });

  it("should handle different phone formats", () => {
    const formats = ["(96) 98765-4321", "96 98765-4321", "96987654321", "+55 96 98765-4321"];

    formats.forEach((phone) => {
      const url = buildWhatsAppReminderUrl(phone, mockData);
      expect(url).toContain("96987654321");
    });
  });
});

describe("Date Formatting", () => {
  it("should format ISO date to Brazilian format", () => {
    expect(formatBrazilianDate("2026-08-15")).toBe("15/08/2026");
    expect(formatBrazilianDate("2026-01-01")).toBe("01/01/2026");
    expect(formatBrazilianDate("2026-12-31")).toBe("31/12/2026");
  });
});

describe("Reminder Logic", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-06T17:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should send reminder for tomorrow's pending appointment", () => {
    const now = new Date("2026-08-06T17:00:00.000Z");
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    const result = shouldSendReminder(tomorrowStr, null, "pending");

    expect(result).toBe(true);
  });

  it("should send reminder for tomorrow's confirmed appointment", () => {
    const now = new Date("2026-08-06T17:00:00.000Z");
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    const result = shouldSendReminder(tomorrowStr, null, "confirmed");

    expect(result).toBe(true);
  });

  it("should NOT send reminder if already sent", () => {
    const now = new Date("2026-08-06T17:00:00.000Z");
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    const result = shouldSendReminder(tomorrowStr, "2026-08-06T10:00:00Z", "pending");

    expect(result).toBe(false);
  });

  it("should NOT send reminder for cancelled appointment", () => {
    const now = new Date("2026-08-06T17:00:00.000Z");
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    const result = shouldSendReminder(tomorrowStr, null, "cancelled");

    expect(result).toBe(false);
  });

  it("should NOT send reminder for completed appointment", () => {
    const now = new Date("2026-08-06T17:00:00.000Z");
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    const result = shouldSendReminder(tomorrowStr, null, "completed");

    expect(result).toBe(false);
  });

  it("should NOT send reminder for today's appointment", () => {
    const now = new Date("2026-08-06T17:00:00.000Z");
    const todayStr = now.toISOString().split("T")[0];

    const result = shouldSendReminder(todayStr, null, "pending");

    expect(result).toBe(false);
  });

  it("should NOT send reminder for appointments in 2 days", () => {
    const now = new Date("2026-08-06T17:00:00.000Z");
    const twoDaysLater = new Date(now);
    twoDaysLater.setDate(twoDaysLater.getDate() + 2);
    const twoDaysLaterStr = twoDaysLater.toISOString().split("T")[0];

    const result = shouldSendReminder(twoDaysLaterStr, null, "pending");

    expect(result).toBe(false);
  });
});
