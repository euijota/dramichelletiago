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

const WEEKDAY_LABELS = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
] as const;

/** Opening hours per weekday index (0 = domingo). Empty array = fechado. */
const OPENING_HOURS: Record<number, Array<[number, number]>> = {
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

export interface ClinicService {
  id: string;
  name: string;
  description: string;
  duration_minutes: number;
}

/** Fallback estático de serviços para SSR e renderização imediata. */
export const DEFAULT_SERVICES: ClinicService[] = [
  {
    id: "1",
    name: "Esthetic Aligner (Alinhadores Invisíveis)",
    description: "Ortodontia estética com alinhadores transparentes sob medida para alinhar os dentes com discrição.",
    duration_minutes: 60,
  },
  {
    id: "2",
    name: "Clareamento Dental",
    description: "Técnica combinada (consultório + caseiro) para dentes iluminados de forma segura e duradoura.",
    duration_minutes: 60,
  },
  {
    id: "3",
    name: "Facetas em Resina / Restauração Estética",
    description: "Esculpidas manualmente para harmonizar a forma, a cor e a textura dos dentes com naturalidade.",
    duration_minutes: 90,
  },
  {
    id: "4",
    name: "Harmonização Orofacial (HOF / Fios PDO)",
    description: "Procedimentos estéticos faciais e fios de sustentação PDO para rejuvenescimento e equilíbrio dos traços.",
    duration_minutes: 60,
  },
  {
    id: "5",
    name: "Laserterapia",
    description: "Aplicação de laser terapêutico para alívio de dor, cicatrização acelerada e bioestimulação tecidual.",
    duration_minutes: 45,
  },
  {
    id: "6",
    name: "Avaliação Odontológica (Adultos e Crianças)",
    description: "Consulta inicial completa com exame clínico minucioso e plano de tratamento personalizado.",
    duration_minutes: 60,
  },
];

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

export interface ICSEvent {
  date: string;
  time: string;
  summary: string;
  description?: string;
}

/** Parser para extrair agendamentos de feeds iCal (.ics do Google Agenda).
 *  Converte datas/horas UTC (sufixo Z) para o fuso de Macapá (UTC-3).
 */
export function parseICSFeed(icsData: string): ICSEvent[] {
  const events: ICSEvent[] = [];
  const seen = new Set<string>();

  // Unfold folded lines in iCal format
  const unfolded = icsData.replace(/\r\n\s/g, "").replace(/\n\s/g, "");
  const blocks = unfolded.split("BEGIN:VEVENT");

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];

    // Match DTSTART with optional parameters like TZID or VALUE=DATE
    const dtstartMatch = block.match(/DTSTART(?:;[^:]*)?:(\d{8})(?:T(\d{2})(\d{2})(\d{2})(Z?))?/);
    const summaryMatch = block.match(/SUMMARY:(.*)/);
    const descMatch = block.match(/DESCRIPTION:(.*?)(?=\r?\n[A-Z-]+:|$)/s);

    if (dtstartMatch) {
      const rawDate = dtstartMatch[1]; // ex: "20260804"
      const rawH = dtstartMatch[2]; // ex: "18"
      const rawM = dtstartMatch[3]; // ex: "00"
      const isUTC = dtstartMatch[5] === "Z" || block.includes("TZID=UTC") || block.includes("Z\n") || block.includes("Z\r");

      let date = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
      let time = "09:00";

      if (rawH !== undefined && rawM !== undefined) {
        let hInt = parseInt(rawH, 10);
        if (isUTC) {
          // Converte UTC (ex: 18:00Z) → Macapá UTC-3 (15:00)
          hInt = (hInt - 3 + 24) % 24;
        }
        time = `${String(hInt).padStart(2, "0")}:${rawM}`;
      }

      const summary = summaryMatch ? summaryMatch[1].trim() : "Compromisso Google Agenda";
      const description = descMatch ? descMatch[1].replace(/\\n/g, "\n").replace(/\\,/g, ",").trim() : "";
      const key = `${date}|${time}|${summary}`;

      if (!seen.has(key)) {
        seen.add(key);
        events.push({ date, time, summary, description });
      }
    }
  }

  return events;
}
