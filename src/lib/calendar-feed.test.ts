import { describe, expect, it } from "vitest";
import {
  buildCalendarFeed,
  isValidFeedToken,
  shortName,
  type FeedAppointment,
} from "./calendar-feed";

const base: FeedAppointment = {
  id: "a1",
  appointment_date: "2026-12-03",
  appointment_time: "14:30:00",
  duration_minutes: 45,
  patient_name: "Maria da Silva Souza",
  service_name: "Avaliação",
  status: "confirmed",
  updated_at: "2026-11-27T10:00:00.000Z",
};

describe("calendar feed", () => {
  it("converte horário de Macapá (UTC-3) para UTC e usa a duração", () => {
    const ics = buildCalendarFeed([base]);
    expect(ics).toContain("DTSTART:20261203T173000Z");
    expect(ics).toContain("DTEND:20261203T181500Z");
    expect(ics).toContain("UID:a1@dramichelletiago.com.br");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("mostra só primeiro nome e inicial, sem telefone", () => {
    const ics = buildCalendarFeed([{ ...base, status: "pending" }]);
    expect(ics).toContain("SUMMARY:Maria S. — Avaliação (a confirmar)");
    expect(ics).not.toContain("Souza");
  });

  it("omite cancelados e escapa texto", () => {
    const ics = buildCalendarFeed([
      { ...base, status: "cancelled" },
      { ...base, id: "a2", service_name: "Limpeza, flúor; revisão" },
    ]);
    expect(ics).not.toContain("UID:a1@");
    expect(ics).toContain("Limpeza\\, flúor\\; revisão");
  });

  it("dobra linhas longas em até 75 octetos", () => {
    const ics = buildCalendarFeed([{ ...base, service_name: "Á".repeat(80) }]);
    for (const line of ics.split("\r\n")) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
  });

  it("shortName lida com nome único e espaços extras", () => {
    expect(shortName("  Ana  ")).toBe("Ana");
    expect(shortName("joão pedro alves")).toBe("joão A.");
  });

  it("token: recusa sem segredo, segredo curto ou valor diferente", () => {
    const secret = "x".repeat(40);
    expect(isValidFeedToken(secret, undefined)).toBe(false);
    expect(isValidFeedToken("curto", "curto")).toBe(false);
    expect(isValidFeedToken("y".repeat(40), secret)).toBe(false);
    expect(isValidFeedToken(secret, secret)).toBe(true);
  });
});
