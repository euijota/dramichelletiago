import { describe, it, expect, beforeAll, afterEach } from "vitest";
import {
  generateAppointmentToken,
  validateAppointmentToken,
  generateCancellationToken,
  validateCancellationToken,
} from "./cancellation";

const TEST_SECRET = "test-secret-for-appointment-tokens-0123456789abcdef";

beforeAll(() => {
  process.env.APPOINTMENT_TOKEN_SECRET = TEST_SECRET;
});

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
    const invalidTokens = ["", "invalid", "not-base64", "123", "äöü"];

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

  it("should refuse to issue tokens for non-UUID appointment IDs", () => {
    expect(() => generateAppointmentToken("test-id-with-dashes-123")).toThrow();
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

  it("should reject unsigned legacy appointmentId:purpose:secret tokens", () => {
    const appointmentId = "550e8400-e29b-41d4-a716-446655440000";
    for (const payload of [
      `${appointmentId}:confirm:clinica`,
      `${appointmentId}:cancel:clinica`,
      `${appointmentId}:confirm`,
      appointmentId,
    ]) {
      const legacyToken = Buffer.from(payload).toString("base64url");
      expect(validateAppointmentToken(legacyToken)).toBeNull();
      expect(validateAppointmentToken(legacyToken, "confirm")).toBeNull();
      expect(validateAppointmentToken(legacyToken, "cancel")).toBeNull();
    }
  });
});

describe("Appointment Token Forgery Resistance", () => {
  const appointmentId = "550e8400-e29b-41d4-a716-446655440000";
  const otherId = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

  function decode(token: string) {
    return Buffer.from(token, "base64url").toString("utf-8").split(".");
  }
  function encode(parts: string[]) {
    return Buffer.from(parts.join(".")).toString("base64url");
  }

  afterEach(() => {
    process.env.APPOINTMENT_TOKEN_SECRET = TEST_SECRET;
  });

  it("rejects a v2 token with a fabricated signature", () => {
    const parts = decode(generateAppointmentToken(appointmentId));
    parts[5] = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    expect(validateAppointmentToken(encode(parts))).toBeNull();
  });

  it("rejects a v2 token whose appointment ID was swapped", () => {
    const parts = decode(generateAppointmentToken(appointmentId));
    parts[1] = otherId;
    expect(validateAppointmentToken(encode(parts))).toBeNull();
  });

  it("rejects a v2 token whose purpose or expiry was altered", () => {
    const parts = decode(generateAppointmentToken(appointmentId, "confirm"));
    expect(
      validateAppointmentToken(encode([...parts.slice(0, 2), "cancel", ...parts.slice(3)])),
    ).toBeNull();
    const extended = [...parts];
    extended[3] = String(Number(parts[3]) + 365 * 24 * 60 * 60 * 1000);
    expect(validateAppointmentToken(encode(extended))).toBeNull();
  });

  it("rejects expired tokens", () => {
    const token = generateAppointmentToken(appointmentId, "confirm", -1);
    expect(validateAppointmentToken(token)).toBeNull();
  });

  it("rejects tokens signed with a different secret", () => {
    const token = generateAppointmentToken(appointmentId);
    process.env.APPOINTMENT_TOKEN_SECRET = "another-secret-entirely-0123456789abcdef-xyz";
    expect(validateAppointmentToken(token)).toBeNull();
  });

  it("fails closed when no server secret is configured", () => {
    const token = generateAppointmentToken(appointmentId);
    const savedService = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.APPOINTMENT_TOKEN_SECRET;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      expect(() => generateAppointmentToken(appointmentId)).toThrow();
      expect(validateAppointmentToken(token)).toBeNull();
    } finally {
      if (savedService !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = savedService;
    }
  });

  it("rejects oversized tokens before decoding", () => {
    expect(validateAppointmentToken("A".repeat(5000))).toBeNull();
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
    const reasons = ["Imprevisto pessoal", "Viagem de última hora", ""];

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

describe("Token Cryptographic Security & Anti-Forgery", () => {
  it("should reject forged tokens with fabricated signature", () => {
    const fakePayload =
      "v2.550e8400-e29b-41d4-a716-446655440000.confirm.9999999999999.nonce.fakesig";
    const forgedToken = Buffer.from(fakePayload).toString("base64url");
    const extracted = validateAppointmentToken(forgedToken);
    expect(extracted).toBeNull();
  });

  it("should enforce purpose separation (confirm token cannot cancel)", () => {
    const appointmentId = "550e8400-e29b-41d4-a716-446655440000";
    const confirmToken = generateAppointmentToken(appointmentId, "confirm");

    // Cannot be validated for cancel purpose
    const extractedForCancel = validateAppointmentToken(confirmToken, "cancel");
    expect(extractedForCancel).toBeNull();

    // But valid for confirm purpose
    const extractedForConfirm = validateAppointmentToken(confirmToken, "confirm");
    expect(extractedForConfirm).toBe(appointmentId);
  });

  it("should reject expired tokens", () => {
    const appointmentId = "550e8400-e29b-41d4-a716-446655440000";
    // Generate token with negative expiry days (-1 day = already expired)
    const expiredToken = generateAppointmentToken(appointmentId, "confirm", -1);
    const extracted = validateAppointmentToken(expiredToken);
    expect(extracted).toBeNull();
  });

  it("should detect tampered appointmentId in valid token", () => {
    const originalId = "550e8400-e29b-41d4-a716-446655440000";
    const validToken = generateAppointmentToken(originalId, "confirm");
    const decoded = Buffer.from(validToken, "base64url").toString("utf-8");

    // Replace ID with another ID without changing signature
    const tamperedPayload = decoded.replace(originalId, "99999999-e29b-41d4-a716-446655440000");
    const tamperedToken = Buffer.from(tamperedPayload).toString("base64url");

    const result = validateAppointmentToken(tamperedToken);
    expect(result).toBeNull();
  });
});
