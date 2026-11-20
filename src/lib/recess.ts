/**
 * Recessos do consultório (férias, congresso, viagem): períodos em que a
 * agenda fica bloqueada por inteiro, além dos feriados oficiais.
 * Ajudantes puros usados tanto no site público quanto no painel.
 */

export interface RecessPeriod {
  id?: string;
  name: string;
  /** YYYY-MM-DD */
  start_date: string;
  /** YYYY-MM-DD */
  end_date: string;
}

/** Recesso que cobre a data ISO informada, se houver. */
export function recessFor(
  isoDate: string,
  recesses: RecessPeriod[] | undefined | null,
): RecessPeriod | undefined {
  if (!recesses?.length) return undefined;
  return recesses.find((r) => isoDate >= r.start_date && isoDate <= r.end_date);
}

/** Quantidade de dias corridos do recesso (inclusive início e fim). */
export function recessDayCount(recess: Pick<RecessPeriod, "start_date" | "end_date">): number {
  const start = new Date(`${recess.start_date}T12:00:00`).getTime();
  const end = new Date(`${recess.end_date}T12:00:00`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.floor((end - start) / 86_400_000) + 1;
}

/** "2026-12-20" → "20/12/2026" */
export function formatRecessDate(isoDate: string): string {
  return isoDate.split("-").reverse().join("/");
}

/** Formata período de recesso, evitando repetir a data em bloqueios de 1 dia. */
export function formatRecessRange(recess: Pick<RecessPeriod, "start_date" | "end_date">): string {
  if (recess.start_date === recess.end_date) {
    return formatRecessDate(recess.start_date);
  }
  return `${formatRecessDate(recess.start_date)} a ${formatRecessDate(recess.end_date)}`;
}
