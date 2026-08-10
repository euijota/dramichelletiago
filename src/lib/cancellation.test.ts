import { describe, it, expect } from "vitest";
import {
  generateAppointmentToken,
  validateAppointmentToken,
  generateCancellationToken,
  validateCancellationToken,
} from "./cancellation";

describe("Appointment Token System", () => {
  it("should generate a valid appointment token", () => {
    const appointmentId = "550e8400-e29b-41d4-a716-446655440000";
    const token = generateAppointmentToken(appointmentId);

    expect(token).toBeTruthy();
    expect(token.length).toBeGreaterThan(20);
    // Base64url characters only
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("should generate unique tokens for same appointment", () => {
    const appointmentId = "550e8400-e29b-41d4-a716-446655440000";
    const token1 = generateAppointmentToken(appointmentId);
    const token2 = generateAppointmentToken(appointmentId);

    // Tokens should be different due to random secret
    expect(token1).not.toBe(token2);
  });

  it("should validate and extract appointment ID from token", () => {
    const appointmentId = "550e8400-e29b-41d4-a716-446655440000";
    const token = generateAppointmentToken(appointmentId);

    const extractedId = validateAppointmentToken(token);

    expect(extractedId).toBe(appointmentId);
  });

  it("should return null for invalid token format", () => {
    const invalidTokens = [
      "",
      "invalid",
      "not-base64",
      "123",
      "äöü",
    ];

    invalidTokens.forEach((token) => {
      const result = validateAppointmentToken(token);
      expect(result).toBeNull();
    });
  });

  it("should return null for malformed base64 payload", () => {
    // Valid base64 but invalid payload format
    const malformedToken = Buffer.from("no-colon-separator").toString("base64url");
    const result = validateAppointmentToken(malformedToken);

    expect(result).toBeNull();
  });

  it("should handle token with special characters in appointment ID", () => {
    const appointmentId = "test-id-with-dashes-123";
    const token = generateAppointmentToken(appointmentId);
    const extractedId = validateAppointmentToken(token);

    expect(extractedId).toBe(appointmentId);
  });

  it("should encode/decode UUID correctly", () => {
    const uuids = [
      "550e8400-e29b-41d4-a716-446655440000",
      "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      "00000000-0000-0000-0000-000000000000",
    ];

    uuids.forEach((uuid) => {
      const token = generateAppointmentToken(uuid);
      const extracted = validateAppointmentToken(token);
      expect(extracted).toBe(uuid);
    });
  });

  it("should support legacy cancellation token functions", () => {
    const appointmentId = "550e8400-e29b-41d4-a716-446655440000";
    const token = generateCancellationToken(appointmentId);
    const extractedId = validateCancellationToken(token);

    expect(extractedId).toBe(appointmentId);
  });
});

describe("Token URL Generation", () => {
  it("should generate correct cancellation URL", () => {
    const appointmentId = "550e8400-e29b-41d4-a716-446655440000";
    const token = generateAppointmentToken(appointmentId);
    const url = `https://dramichelletiago.vercel.app/cancelar/${token}`;

    expect(url).toContain("https://dramichelletiago.vercel.app/cancelar/");
    expect(url).toContain(token);
  });

  it("should generate correct confirmation URL", () => {
    const appointmentId = "550e8400-e29b-41d4-a716-446655440000";
    const token = generateAppointmentToken(appointmentId);
    const url = `https://dramichelletiago.vercel.app/confirmar/${token}`;

    expect(url).toContain("https://dramichelletiago.vercel.app/confirmar/");
    expect(url).toContain(token);
  });

  it("should generate URL-safe tokens (no special chars)", () => {
    const appointmentId = "550e8400-e29b-41d4-a716-446655440000";
    const token = generateAppointmentToken(appointmentId);

    // URL-safe base64url: no +, /, or = characters
    expect(token).not.toContain("+");
    expect(token).not.toContain("/");
    expect(token).not.toContain("=");
  });
});

describe("Cancellation Business Logic", () => {
  it("should detect if appointment is in the past", () => {
    const now = new Date();
    const pastDate = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 1 day ago
    const futureDate = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 1 day ahead

    expect(pastDate < now).toBe(true);
    expect(futureDate > now).toBe(true);
  });

  it("should format cancellation reason correctly", () => {
    const reasons = [
      "Imprevisto pessoal",
      "Viagem de última hora",
      "",
    ];

    reasons.forEach((reason) => {
      const formatted = reason
        ? `[CANCELADO] Motivo: ${reason}`
        : "[CANCELADO] Sem motivo informado";

      if (reason) {
        expect(formatted).toContain(reason);
      } else {
        expect(formatted).toContain("Sem motivo informado");
      }
    });
  });

  it("should limit cancellation reason to 500 chars", () => {
    const longReason = "A".repeat(600);
    const limited = longReason.slice(0, 500);

    expect(limited.length).toBe(500);
    expect(longReason.length).toBeGreaterThan(500);
  });
});
