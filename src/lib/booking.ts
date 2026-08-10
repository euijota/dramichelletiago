import { z } from "zod";

export const BOOKING_PROTOCOL_PATTERN = /^AG-[0-9A-Za-z]{6,12}$/;

export const bookingProtocolSchema = z
  .string()
  .regex(BOOKING_PROTOCOL_PATTERN, "Protocolo inválido");

export const patientEmailSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() || null : value),
  z.string().email("E-mail inválido").nullable(),
);

export const bookingSchema = z.object({
  appointmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (YYYY-MM-DD)"),
  appointmentTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Horário inválido (HH:MM)"),
  patientName: z.string().min(2, "Nome muito curto").max(120),
  patientPhone: z.string().min(8, "Telefone inválido").max(20),
  patientEmail: patientEmailSchema,
  serviceName: z.string().min(2).max(120),
  notes: z.string().max(1000).optional().default(""),
  protocol: bookingProtocolSchema,
});

export type BookingPayload = z.infer<typeof bookingSchema>;

export function isBookingProtocol(value: string): boolean {
  return BOOKING_PROTOCOL_PATTERN.test(value);
}

export function generateBookingProtocol(
  generateUuid: () => string = () => crypto.randomUUID(),
): string {
  const suffix = generateUuid().replace(/-/g, "").slice(0, 8).toUpperCase();
  const protocol = `AG-${suffix}`;

  return bookingProtocolSchema.parse(protocol);
}

export function normalizePatientEmail(value: string): string | null {
  return patientEmailSchema.parse(value);
}

export function timeToMinutes(timeHHMM: string): number {
  const [hh, mm] = timeHHMM.split(":").map(Number);
  return (hh || 0) * 60 + (mm || 0);
}

export function doAppointmentsOverlap(
  startA: string,
  durationA: number = 60,
  startB: string,
  durationB: number = 60,
): boolean {
  const minStartA = timeToMinutes(startA);
  const minEndA = minStartA + durationA;

  const minStartB = timeToMinutes(startB);
  const minEndB = minStartB + durationB;

  return minStartA < minEndB && minEndA > minStartB;
}
