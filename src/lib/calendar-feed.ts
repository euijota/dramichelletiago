import crypto from "node:crypto";

/** Consulta mínima para o feed: sem telefone, e-mail ou observações (LGPD). */
export interface FeedAppointment {
  id: string;
  appointment_date: string; // YYYY-MM-DD
  appointment_time: string; // HH:MM[:SS]
  duration_minutes: number;
  patient_name: string;
  service_name: string;
  status: string;
  updated_at: string;
}

/** Compara o token em tempo constante. Sem segredo configurado (ou curto), recusa tudo. */
export function isValidFeedToken(token: string, secret: string | undefined): boolean {
  if (!secret || secret.length < 32) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** "Maria da Silva Souza" → "Maria S." */
export function shortName(full: string): string {
  const parts = full.trim().split(/\s+/);
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  return last ? `${parts[0]} ${last[0].toUpperCase()}.` : parts[0];
}

const escapeText = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

// ponytail: Macapá (America/Belem) é UTC-3 fixo, sem horário de verão. Se o Brasil voltar a ter
// horário de verão no Amapá, troque por TZID + VTIMEZONE.
function toUtcStamp(date: string, time: string, plusMinutes = 0): string {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  return icsStamp(new Date(Date.UTC(y, mo - 1, d, h + 3, mi + plusMinutes)));
}

const icsStamp = (d: Date) => d.toISOString().replace(/[-:]|\.\d{3}/g, "");

/** Dobra linhas em 75 octetos (RFC 5545 §3.1). */
function fold(line: string): string {
  const bytes = Buffer.from(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let start = 0;
  while (start < bytes.length) {
    let end = Math.min(start + (out.length ? 74 : 75), bytes.length);
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--; // não corta caractere UTF-8
    out.push(bytes.subarray(start, end).toString());
    start = end;
  }
  return out.join("\r\n ");
}

export function buildCalendarFeed(appointments: FeedAppointment[]): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Dra. Michelle Tiago//Agenda//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Consultório — Dra. Michelle",
    "X-WR-TIMEZONE:America/Belem",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  for (const a of appointments) {
    if (a.status === "cancelled") continue;
    const time = a.appointment_time.slice(0, 5);
    const status = a.status === "pending" ? " (a confirmar)" : "";
    lines.push(
      "BEGIN:VEVENT",
      `UID:${a.id}@dramichelletiago.com.br`,
      `DTSTAMP:${icsStamp(new Date(a.updated_at))}`,
      `DTSTART:${toUtcStamp(a.appointment_date, time)}`,
      `DTEND:${toUtcStamp(a.appointment_date, time, a.duration_minutes || 60)}`,
      `SUMMARY:${escapeText(`${shortName(a.patient_name)} — ${a.service_name}${status}`)}`,
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "DESCRIPTION:Consulta em 30 minutos",
      "TRIGGER:-PT30M",
      "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
