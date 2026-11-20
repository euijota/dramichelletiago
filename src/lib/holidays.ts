/**
 * Feriados da agenda da clínica — Macapá/AP (CEP 68906-666).
 *
 * Fontes: Lei federal 662/1949 e 14.759/2023 (nacionais), calendário oficial
 * do Amapá (estaduais) e Lei municipal 128/80 de Macapá (municipais).
 * Carnaval e Corpus Christi são pontos facultativos — bloqueados por padrão
 * porque o consultório não atende nesses dias.
 *
 * Datas móveis são calculadas a partir da Páscoa (algoritmo de Meeus/Jones/
 * Butcher), então valem para qualquer ano.
 */

export type HolidayKind = "nacional" | "estadual" | "municipal" | "facultativo";

export interface Holiday {
  /** YYYY-MM-DD */
  date: string;
  name: string;
  kind: HolidayKind;
}

export const HOLIDAY_KIND_LABELS: Record<HolidayKind, string> = {
  nacional: "Feriado nacional",
  estadual: "Feriado estadual (AP)",
  municipal: "Feriado municipal (Macapá)",
  facultativo: "Ponto facultativo",
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Páscoa (domingo) pelo algoritmo de Meeus/Jones/Butcher. */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function shift(date: Date, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/** Todos os feriados de um ano, ordenados por data. */
export function getHolidays(year: number): Holiday[] {
  const easter = easterSunday(year);

  const list: Holiday[] = [
    // Nacionais fixos
    { date: iso(year, 1, 1), name: "Confraternização Universal", kind: "nacional" },
    { date: iso(year, 4, 21), name: "Tiradentes", kind: "nacional" },
    { date: iso(year, 5, 1), name: "Dia do Trabalho", kind: "nacional" },
    { date: iso(year, 9, 7), name: "Independência do Brasil", kind: "nacional" },
    { date: iso(year, 10, 12), name: "Nossa Senhora Aparecida", kind: "nacional" },
    { date: iso(year, 11, 2), name: "Finados", kind: "nacional" },
    { date: iso(year, 11, 15), name: "Proclamação da República", kind: "nacional" },
    { date: iso(year, 11, 20), name: "Dia da Consciência Negra", kind: "nacional" },
    { date: iso(year, 12, 25), name: "Natal", kind: "nacional" },

    // Nacionais móveis
    { date: shift(easter, -2), name: "Sexta-feira Santa", kind: "nacional" },

    // Estaduais (Amapá)
    { date: iso(year, 3, 19), name: "Dia de São José", kind: "estadual" },
    { date: iso(year, 5, 15), name: "Dia de Cabralzinho", kind: "estadual" },
    {
      date: iso(year, 9, 13),
      name: "Criação do Território Federal do Amapá",
      kind: "estadual",
    },
    { date: iso(year, 11, 30), name: "Dia do Evangélico", kind: "estadual" },

    // Municipais (Macapá)
    { date: iso(year, 2, 4), name: "Aniversário de Macapá", kind: "municipal" },
    {
      date: iso(year, 12, 8),
      name: "Nossa Senhora da Conceição",
      kind: "municipal",
    },

    // Pontos facultativos
    { date: shift(easter, -48), name: "Carnaval (segunda)", kind: "facultativo" },
    { date: shift(easter, -47), name: "Carnaval (terça)", kind: "facultativo" },
    { date: shift(easter, 60), name: "Corpus Christi", kind: "facultativo" },
  ];

  return list.sort((a, b) => a.date.localeCompare(b.date));
}

const yearCache = new Map<number, Map<string, Holiday>>();

function holidaysByDate(year: number): Map<string, Holiday> {
  let map = yearCache.get(year);
  if (!map) {
    map = new Map(getHolidays(year).map((h) => [h.date, h]));
    yearCache.set(year, map);
  }
  return map;
}

/** Feriado de uma data ISO (YYYY-MM-DD), ou undefined se for dia útil. */
export function holidayFor(isoDate: string): Holiday | undefined {
  const year = Number(isoDate.slice(0, 4));
  if (!year) return undefined;
  return holidaysByDate(year).get(isoDate);
}

export function isHolidayDate(isoDate: string): boolean {
  return holidayFor(isoDate) !== undefined;
}
