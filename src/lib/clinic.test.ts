import { describe, it, expect } from "vitest";
import {
  parseICSFeed,
  buildTimeSlots,
  weekdayOf,
  formatLongDate,
  formatShortDate,
  toISODate,
  startOfWeek,
  addDays,
  trimSeconds,
  buildGoogleCalendarUrl,
} from "./clinic";

describe("parseICSFeed", () => {
  it("should parse basic ICS event with UTC time", () => {
    const icsData = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
DTSTART:20260810T180000Z
SUMMARY:Consulta com João Silva
DESCRIPTION:Paciente novo
END:VEVENT
END:VCALENDAR`;

    const events = parseICSFeed(icsData);

    expect(events).toHaveLength(1);
    expect(events[0].date).toBe("2026-08-10");
    expect(events[0].time).toBe("15:00"); // 18:00 UTC → 15:00 UTC-3
    expect(events[0].summary).toBe("Consulta com João Silva");
    expect(events[0].description).toBe("Paciente novo");
  });

  it("should parse event without timezone (local time)", () => {
    const icsData = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
DTSTART:20260810T150000
SUMMARY:Consulta Local
END:VEVENT
END:VCALENDAR`;

    const events = parseICSFeed(icsData);

    expect(events).toHaveLength(1);
    expect(events[0].date).toBe("2026-08-10");
    expect(events[0].time).toBe("15:00"); // Mantém horário local
  });

  it("should deduplicate identical events", () => {
    const icsData = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
DTSTART:20260810T180000Z
SUMMARY:Consulta Duplicada
END:VEVENT
BEGIN:VEVENT
DTSTART:20260810T180000Z
SUMMARY:Consulta Duplicada
END:VEVENT
END:VCALENDAR`;

    const events = parseICSFeed(icsData);

    expect(events).toHaveLength(1); // Apenas 1 evento, não 2
  });

  it("should handle folded lines (iCal spec)", () => {
    const icsData = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
DTSTART:20260810T150000
SUMMARY:Consulta muito longa com texto que foi quebrado em multiplas
 linhas conforme especificacao do iCal
END:VEVENT
END:VCALENDAR`;

    const events = parseICSFeed(icsData);

    expect(events).toHaveLength(1);
    expect(events[0].summary).toContain("Consulta muito longa");
  });

  it("should parse all-day events with default time", () => {
    const icsData = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
DTSTART:20260810
SUMMARY:Evento Dia Inteiro
END:VEVENT
END:VCALENDAR`;

    const events = parseICSFeed(icsData);

    expect(events).toHaveLength(1);
    expect(events[0].date).toBe("2026-08-10");
    expect(events[0].time).toBe("09:00"); // Default
  });

  it("should handle escaped characters in description", () => {
    const icsData = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
DTSTART:20260810T150000
SUMMARY:Consulta
DESCRIPTION:Paciente com alergia\\, favor verificar prontuário\\nLigou antes
END:VEVENT
END:VCALENDAR`;

    const events = parseICSFeed(icsData);

    expect(events[0].description).toContain("Paciente com alergia,");
    expect(events[0].description).toContain("\n");
  });
});

describe("buildTimeSlots", () => {
  it("should build slots for Monday (15-18h)", () => {
    const slots = buildTimeSlots(1); // Segunda-feira

    expect(slots).toEqual(["15:00", "16:00", "17:00"]);
  });

  it("should build slots for Wednesday (9-12h)", () => {
    const slots = buildTimeSlots(3); // Quarta-feira

    expect(slots).toEqual(["09:00", "10:00", "11:00"]);
  });

  it("should return empty array for Sunday", () => {
    const slots = buildTimeSlots(0); // Domingo

    expect(slots).toEqual([]);
  });

  it("should build slots for Saturday (9-12h)", () => {
    const slots = buildTimeSlots(6); // Sábado

    expect(slots).toEqual(["09:00", "10:00", "11:00"]);
  });

  it("should handle undefined weekday (return all ranges)", () => {
    const slots = buildTimeSlots(undefined);

    expect(slots).toEqual([
      "09:00",
      "10:00",
      "11:00",
      "15:00",
      "16:00",
      "17:00",
    ]);
  });
});

describe("weekdayOf", () => {
  it("should return correct weekday for ISO date", () => {
    expect(weekdayOf("2026-08-10")).toBe(1); // Segunda-feira
    expect(weekdayOf("2026-08-13")).toBe(4); // Quinta-feira
    expect(weekdayOf("2026-08-16")).toBe(0); // Domingo
  });
});

describe("formatLongDate", () => {
  it("should format date in Portuguese", () => {
    const formatted = formatLongDate("2026-08-10");

    expect(formatted).toContain("segunda-feira");
    expect(formatted).toContain("10");
    expect(formatted).toContain("agosto");
  });
});

describe("formatShortDate", () => {
  it("should format date as DD/MM", () => {
    const formatted = formatShortDate("2026-08-10");

    expect(formatted).toBe("10/08");
  });
});

describe("toISODate", () => {
  it("should convert Date to ISO date string", () => {
    const date = new Date(2026, 7, 10); // Month is 0-indexed
    const iso = toISODate(date);

    expect(iso).toBe("2026-08-10");
  });

  it("should pad single-digit month and day", () => {
    const date = new Date(2026, 0, 5); // January 5
    const iso = toISODate(date);

    expect(iso).toBe("2026-01-05");
  });
});

describe("startOfWeek", () => {
  it("should return Monday of the week", () => {
    const thursday = new Date(2026, 7, 13); // Thursday
    const monday = startOfWeek(thursday);

    expect(monday.getDay()).toBe(1); // Monday
    expect(monday.getDate()).toBe(10);
  });

  it("should handle Sunday correctly", () => {
    const sunday = new Date(2026, 7, 16);
    const monday = startOfWeek(sunday);

    expect(monday.getDay()).toBe(1);
    expect(monday.getDate()).toBe(10);
  });
});

describe("addDays", () => {
  it("should add days to a date", () => {
    const date = new Date(2026, 7, 10);
    const newDate = addDays(date, 5);

    expect(newDate.getDate()).toBe(15);
  });

  it("should handle month overflow", () => {
    const date = new Date(2026, 7, 30);
    const newDate = addDays(date, 5);

    expect(newDate.getMonth()).toBe(8); // September
    expect(newDate.getDate()).toBe(4);
  });
});

describe("trimSeconds", () => {
  it("should trim seconds from time string", () => {
    expect(trimSeconds("15:30:00")).toBe("15:30");
    expect(trimSeconds("09:00:00")).toBe("09:00");
  });

  it("should handle time without seconds", () => {
    expect(trimSeconds("15:30")).toBe("15:30");
  });
});

describe("buildGoogleCalendarUrl", () => {
  it("should generate valid Google Calendar URL", () => {
    const url = buildGoogleCalendarUrl(
      "Consulta Odontológica",
      "2026-08-10",
      "15:00",
      "Consulta com Dra. Michelle"
    );

    expect(url).toContain("calendar.google.com/calendar/render");
    expect(url).toContain("action=TEMPLATE");
    expect(url).toContain("text=Consulta+Odontol");
    expect(url).toContain("20260810T1500");
    expect(url).toContain("20260810T1600"); // +1 hour
    expect(url).toContain("details=Consulta+com+Dra");
    expect(url).toContain("location=Travessa");
  });

  it("should handle time at end of day (23:00)", () => {
    const url = buildGoogleCalendarUrl(
      "Consulta Emergência",
      "2026-08-10",
      "23:00",
      "Urgência"
    );

    expect(url).toContain("20260810T2300");
    expect(url).toContain("20260810T2400"); // Same day 24:00 (Google Calendar format)
  });
});
