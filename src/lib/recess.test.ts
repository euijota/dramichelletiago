import { describe, expect, it } from "vitest";
import { formatRecessDate, formatRecessRange, recessDayCount, recessFor } from "./recess";

const recesses = [
  { name: "Férias de verão", start_date: "2026-12-20", end_date: "2027-01-05" },
  { name: "Congresso", start_date: "2026-05-10", end_date: "2026-05-12" },
];

describe("recess", () => {
  it("encontra o recesso que cobre a data", () => {
    expect(recessFor("2026-12-25", recesses)?.name).toBe("Férias de verão");
    expect(recessFor("2026-05-10", recesses)?.name).toBe("Congresso");
    expect(recessFor("2026-05-12", recesses)?.name).toBe("Congresso");
  });

  it("respeita os limites do período", () => {
    expect(recessFor("2026-12-19", recesses)).toBeUndefined();
    expect(recessFor("2026-05-13", recesses)).toBeUndefined();
    expect(recessFor("2027-01-06", recesses)).toBeUndefined();
  });

  it("lida com lista vazia/nula", () => {
    expect(recessFor("2026-12-25", [])).toBeUndefined();
    expect(recessFor("2026-12-25", null)).toBeUndefined();
    expect(recessFor("2026-12-25", undefined)).toBeUndefined();
  });

  it("conta os dias corridos do recesso", () => {
    expect(recessDayCount({ start_date: "2026-05-10", end_date: "2026-05-12" })).toBe(3);
    expect(recessDayCount({ start_date: "2026-12-20", end_date: "2027-01-05" })).toBe(17);
    expect(recessDayCount({ start_date: "2026-12-25", end_date: "2026-12-25" })).toBe(1);
  });

  it("formata data para pt-BR", () => {
    expect(formatRecessDate("2026-12-20")).toBe("20/12/2026");
  });

  it("formata intervalo evitando repetição quando é 1 dia", () => {
    expect(formatRecessRange({ start_date: "2026-12-24", end_date: "2026-12-24" })).toBe(
      "24/12/2026",
    );
    expect(formatRecessRange({ start_date: "2026-12-20", end_date: "2027-01-05" })).toBe(
      "20/12/2026 a 05/01/2027",
    );
  });
});
