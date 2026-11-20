import { describe, expect, it } from "vitest";
import { getHolidays, holidayFor, isHolidayDate } from "./holidays";

describe("holidays (Macapá/AP)", () => {
  it("calcula a Páscoa e as datas móveis de 2026", () => {
    // Páscoa 2026: 5 de abril → Sexta-feira Santa 3/4, Carnaval 17/2,
    // Corpus Christi 4/6 (conferido com o calendário oficial).
    expect(holidayFor("2026-04-03")?.name).toBe("Sexta-feira Santa");
    expect(holidayFor("2026-02-17")?.name).toBe("Carnaval (terça)");
    expect(holidayFor("2026-06-04")?.name).toBe("Corpus Christi");
  });

  it("confere feriados fixos nacionais", () => {
    expect(holidayFor("2026-01-01")?.kind).toBe("nacional");
    expect(holidayFor("2026-09-07")?.kind).toBe("nacional");
    expect(holidayFor("2026-11-20")?.kind).toBe("nacional");
    expect(holidayFor("2026-12-25")?.kind).toBe("nacional");
  });

  it("confere feriados estaduais do Amapá", () => {
    expect(holidayFor("2026-03-19")?.name).toBe("Dia de São José");
    expect(holidayFor("2026-05-15")?.name).toBe("Dia de Cabralzinho");
    expect(holidayFor("2026-09-13")?.kind).toBe("estadual");
    expect(holidayFor("2026-11-30")?.kind).toBe("estadual");
  });

  it("confere feriados municipais de Macapá", () => {
    expect(holidayFor("2026-02-04")?.name).toBe("Aniversário de Macapá");
    expect(holidayFor("2026-12-08")?.name).toBe("Nossa Senhora da Conceição");
    expect(holidayFor("2026-02-04")?.kind).toBe("municipal");
  });

  it("não marca dias úteis comuns como feriado", () => {
    expect(isHolidayDate("2026-03-10")).toBe(false);
    expect(isHolidayDate("2026-07-15")).toBe(false);
  });

  it("funciona para outros anos (Páscoa 2027: 28 de março)", () => {
    expect(holidayFor("2027-03-26")?.name).toBe("Sexta-feira Santa");
    expect(holidayFor("2027-02-09")?.name).toBe("Carnaval (terça)");
  });

  it("lista anual vem ordenada e sem datas duplicadas", () => {
    const list = getHolidays(2026);
    const dates = list.map((h) => h.date);
    expect(dates).toEqual([...dates].sort());
    expect(new Set(dates).size).toBe(dates.length);
  });
});
