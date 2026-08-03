/** Shared, serialisable clinic constants used by both public and admin views. */

export const BOOKING_URL = "https://consultorio.me/pro/dramichellebarbosatiago";

export const CLINIC = {
  name: "Dra. Michelle Barbosa Tiago",
  shortName: "Dra. Michelle Tiago",
  role: "Cirurgiã-Dentista",
  cro: "CRO-AP 596",
  phone: "(96) 98111-1157",
  whatsapp: "5596981111157",
  email: "dramichellebarbosatiago@gmail.com",
  address: "Travessa Joaquim Pinheiro Borges, 964 — Alvorada, Macapá/AP",
  city: "Macapá, Amapá",
  hours: "Seg, ter e qui das 15h às 18h · Qua, sex e sáb das 9h às 12h",
} as const;

export const WEEKDAY_LABELS = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
] as const;

/** Opening hours per weekday index (0 = domingo). Empty array = fechado. */
export const OPENING_HOURS: Record<number, Array<[number, number]>> = {
  0: [],
  1: [[15, 18]],
  2: [[15, 18]],
  3: [[9, 12]],
  4: [[15, 18]],
  5: [[9, 12]],
  6: [[9, 12]],
};

export const SCHEDULE_SUMMARY = [
  { day: "Segunda-feira", hours: "15h às 18h" },
  { day: "Terça-feira", hours: "15h às 18h" },
  { day: "Quarta-feira", hours: "9h às 12h" },
  { day: "Quinta-feira", hours: "15h às 18h" },
  { day: "Sexta-feira", hours: "9h às 12h" },
  { day: "Sábado", hours: "9h às 12h" },
  { day: "Domingo", hours: "Fechado" },
] as const;

/** Convênios odontológicos atendidos no consultório. */
export const INSURANCE_PLANS = [
  "BB Dental",
  "Bradesco Dental",
  "Amil Dental",
  "Odonto Santander",
  "Odontoprev",
  "HapVida",
  "SulAmérica",
] as const;

export const STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  confirmed: "Confirmado",
  cancelled: "Cancelado",
  completed: "Concluído",
};

/** 1-hour slots for a given weekday, following the clinic's opening hours. */
export function buildTimeSlots(weekday?: number): string[] {
  const ranges =
    weekday === undefined
      ? ([
          [9, 12],
          [15, 18],
        ] as Array<[number, number]>)
      : (OPENING_HOURS[weekday] ?? []);
  const slots: string[] = [];
  for (const [start, end] of ranges) {
    for (let minutes = start * 60; minutes < end * 60; minutes += 60) {
      const h = String(Math.floor(minutes / 60)).padStart(2, "0");
      const m = String(minutes % 60).padStart(2, "0");
      slots.push(`${h}:${m}`);
    }
  }
  return slots;
}

/** Weekday index (0 = domingo) for an ISO date string, timezone-safe. */
export function weekdayOf(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

/** "2026-07-30" → "quinta-feira, 30 de julho" */
export function formatLongDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(y, m - 1, d));
}

export function formatShortDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(y, m - 1, d));
}

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Monday of the week containing `date`. */
export function startOfWeek(date: Date): Date {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - offset);
  return copy;
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function trimSeconds(time: string): string {
  return time.slice(0, 5);
}

/** Gerador de link de sincronização para Google Agenda (Duração 1h). */
export function buildGoogleCalendarUrl(
  title: string,
  isoDate: string,
  timeHHMM: string,
  details: string,
): string {
  const cleanDate = isoDate.replace(/-/g, "");
  const [hStr, mStr] = timeHHMM.split(":");
  const h = Number(hStr);
  const startH = String(h).padStart(2, "0");
  const endH = String(h + 1).padStart(2, "0");
  const m = String(mStr || "00").padStart(2, "0");

  const dates = `${cleanDate}T${startH}${m}00/${cleanDate}T${endH}${m}00`;

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: dates,
    details: details,
    location: "Travessa Joaquim Pinheiro Borges, 964 — Alvorada, Macapá/AP",
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
