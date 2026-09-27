import { describe, expect, it } from "vitest";
import { bookingSchema, generateBookingProtocol } from "./booking";
import { buildTimeSlots, formatLongDate } from "./clinic";

describe("jornada de agendamento", () => {
  it("gera um protocolo válido para uma solicitação", () => {
    const protocol = generateBookingProtocol(() => "12345678-abcd-efgh-ijkl-123456789012");
    expect(protocol).toMatch(/^AG-[0-9A-Z]{8}$/);
  });

  it("aceita os dados essenciais preenchidos pelo paciente", () => {
    const result = bookingSchema.safeParse({
      appointmentDate: "2026-09-28",
      appointmentTime: "15:00",
      patientName: "Maria da Silva",
      patientPhone: "(96) 98111-1157",
      patientEmail: "maria@example.com",
      serviceName: "Avaliação Odontológica",
      notes: "Primeira consulta",
      protocol: "AG-ABC12345",
    });

    expect(result.success).toBe(true);
  });

  it("oferece horários apenas dentro da janela de atendimento", () => {
    expect(buildTimeSlots(1)).toEqual(["15:00", "16:00", "17:00"]);
    expect(buildTimeSlots(0)).toEqual([]);
  });

  it("apresenta a data ao paciente em português", () => {
    expect(formatLongDate("2026-09-28")).toContain("segunda-feira");
  });
});
