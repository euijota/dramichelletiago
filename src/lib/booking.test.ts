import { describe, expect, it } from "vitest";
import {
  bookingSchema,
  generateBookingProtocol,
  isBookingProtocol,
  normalizePatientEmail,
} from "./booking";

describe("booking protocol", () => {
  it("generates a valid protocol with the default secure UUID source", () => {
    expect(isBookingProtocol(generateBookingProtocol())).toBe(true);
  });

  it("generates AG- followed by eight uppercase hexadecimal characters", () => {
    const protocol = generateBookingProtocol(() => "a1b2c3d4-e5f6-4789-abcd-ef0123456789");

    expect(protocol).toBe("AG-A1B2C3D4");
    expect(isBookingProtocol(protocol)).toBe(true);
  });

  it.each([
    "AG-123456",
    "AG-A1B2C3D",
    "AG-A1B2C3D4E",
    "AG-a1b2c3d4",
    "AG-G1B2C3D4",
    "BG-A1B2C3D4",
    "A1B2C3D4",
    "",
  ])("rejects invalid protocol format: %s", (protocol) => {
    expect(isBookingProtocol(protocol)).toBe(false);
  });
});

describe("patient email normalization", () => {
  it("accepts a booking without a patient email", () => {
    const booking = bookingSchema.parse({
      appointmentDate: "2026-08-11",
      appointmentTime: "09:30",
      patientName: "Paciente Teste",
      patientPhone: "96999999999",
      patientEmail: null,
      serviceName: "Consulta",
      notes: "",
      protocol: "AG-A1B2C3D4",
    });

    expect(booking.patientEmail).toBeNull();
  });

  it.each(["", "   "])('normalizes an empty email "%s" to null', (email) => {
    expect(normalizePatientEmail(email)).toBeNull();
  });

  it("trims and preserves a valid email", () => {
    expect(normalizePatientEmail("  paciente@example.com  ")).toBe("paciente@example.com");
  });

  it.each(["email", "@example.com", "patient@", "patient @example.com"])(
    "rejects an invalid email: %s",
    (email) => {
      expect(() => normalizePatientEmail(email)).toThrow("E-mail inválido");
    },
  );
});
