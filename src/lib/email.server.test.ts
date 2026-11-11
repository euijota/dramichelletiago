import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getClinicalEmailConfiguration,
  sendClinicalEmail,
  type ClinicalEmailPayload,
} from "./email.server";
const payload: ClinicalEmailPayload = {
  from: "Agenda <agenda@example.com>",
  to: ["clinic@example.com"],
  subject: "[CONFIRMADA] Teste",
  html: "<p>Teste</p>",
  text: "Teste",
  template_version: 1,
};
beforeEach(() => {
  vi.stubEnv("RESEND_API_KEY", "test-".repeat(10));
  vi.stubEnv("CLINICAL_EMAIL_FROM", payload.from);
  vi.stubEnv("CLINICAL_EMAIL_TO", payload.to[0]);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("Transporte da fila persistida", () => {
  it("usa destinatário/remetente congelados e a chave do evento", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ id: "email-test" }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("CLINICAL_EMAIL_TO", "changed@example.com");
    expect(await sendClinicalEmail(payload, "clinical-status/event-test")).toEqual({
      status: "accepted",
      providerId: "email-test",
    });
    const init = fetchMock.mock.calls[0][1];
    expect(JSON.parse(init.body)).toEqual({
      from: payload.from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    });
    expect(init.headers["Idempotency-Key"]).toBe("clinical-status/event-test");
    expect(init.signal).toBeDefined();
  });
  it("não inventa ID quando HTTP 200 não comprova aceitação", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({})));
    expect((await sendClinicalEmail(payload, "event-test")).status).toBe("uncertain");
  });
  it.each([
    [401, "bad_key", "permanent"],
    [409, "invalid_idempotent_request", "permanent"],
    [409, "concurrent_idempotent_requests", "retryable"],
    [503, "unavailable", "retryable"],
  ])("classifica HTTP %s / %s", async (status, name, expected) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ name }, { status: Number(status) })),
    );
    expect((await sendClinicalEmail(payload, "event-test")).status).toBe(expected);
  });
  it("respeita Retry-After em data HTTP", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 10, 10, 10));
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            {},
            { status: 429, headers: { "Retry-After": "Tue, 10 Nov 2026 10:05:00 GMT" } },
          ),
        ),
    );
    expect((await sendClinicalEmail(payload, "event-test")).retryAfterSeconds).toBe(300);
    vi.restoreAllMocks();
  });
  it("timeout/rede deixam resultado incerto", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect((await sendClinicalEmail(payload, "event-test")).status).toBe("uncertain");
  });
  it("configuração ausente falha antes de qualquer HTTP", () => {
    vi.stubEnv("RESEND_API_KEY", "");
    expect(getClinicalEmailConfiguration).toThrow();
  });
});
