import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/notification-monitor.server", () => ({
  runWithClinicalMonitor: (run: () => Promise<unknown>) => run(),
}));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc: mocks.rpc } }));
vi.mock("@/lib/email.server", async (original) => ({
  ...(await original<typeof import("./email.server")>()),
  sendClinicalEmail: mocks.send,
}));
import { processNotificationBatch } from "./clinical-notifications.server";
const id = "550e8400-e29b-41d4-a716-446655440000";
const lease = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const event = {
  id,
  lease_id: lease,
  kind: "confirmed",
  patient_name: "<img src=x>",
  patient_phone: "96981112222",
  appointment_date: "2099-11-10",
  appointment_time: "15:00:00",
  frozen_payload: null,
};
beforeEach(() => {
  vi.stubEnv("CLINICAL_NOTIFICATIONS_ENABLED", "true");
  vi.stubEnv("RESEND_API_KEY", "test-".repeat(10));
  vi.stubEnv("CLINICAL_EMAIL_FROM", "agenda@example.com");
  mocks.send.mockReset().mockResolvedValue({ status: "accepted", providerId: "test-email" });
  mocks.rpc.mockReset().mockImplementation(async (name, args) => {
    if (name === "clinical_claim_notification_events") return { data: [event], error: null };
    if (name === "clinical_begin_notification_attempt")
      return {
        data: {
          code: "ok",
          frozen_payload: args.p_payload,
          idempotency_key: `clinical-status/${id}`,
        },
        error: null,
      };
    if (name === "clinical_finish_notification_attempt")
      return { data: { code: "ok", status: "accepted" }, error: null };
    return { data: { released_count: 0 }, error: null };
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
describe("Processamento comprovado no banco", () => {
  it("envia só depois de persistir intenção e só conta aceitação persistida", async () => {
    const result = await processNotificationBatch();
    expect(result.accepted).toBe(1);
    expect(mocks.rpc.mock.calls.map((call) => call[0])).toEqual([
      "clinical_claim_notification_events",
      "clinical_begin_notification_attempt",
      "clinical_finish_notification_attempt",
      "clinical_release_unstarted_events",
    ]);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send.mock.calls[0][0].html).toContain("&lt;img");
    expect(mocks.send.mock.calls[0][0].html).not.toContain("<img");
  });
  it("desativado não reserva nem envia", async () => {
    vi.stubEnv("CLINICAL_NOTIFICATIONS_ENABLED", "false");
    await expect(processNotificationBatch()).rejects.toThrow();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("sem chave de e-mail não consome reservas/tentativas", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    await expect(processNotificationBatch()).rejects.toThrow();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("erro de reserva não se passa por fila vazia", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "db unavailable" } });
    await expect(processNotificationBatch()).rejects.toThrow("reservar");
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("fila vazia é sucesso sem envio", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    expect((await processNotificationBatch()).claimed).toBe(0);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("falha ao gravar resultado não informa sucesso", async () => {
    const original = mocks.rpc.getMockImplementation()!;
    mocks.rpc.mockImplementation((name, args) =>
      name === "clinical_finish_notification_attempt"
        ? Promise.resolve({ data: null, error: { message: "db down" } })
        : original(name, args),
    );
    await expect(processNotificationBatch()).rejects.toThrow("incompleto");
  });
  it("reserva vencida ou evento superado nunca envia", async () => {
    const original = mocks.rpc.getMockImplementation()!;
    mocks.rpc.mockImplementation((name, args) =>
      name === "clinical_begin_notification_attempt"
        ? Promise.resolve({ data: { code: "superseded" }, error: null })
        : original(name, args),
    );
    expect((await processNotificationBatch()).accepted).toBe(0);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("retomada usa o payload congelado em vez da configuração atual", async () => {
    const frozen = {
      from: "old@example.com",
      to: ["old-clinic@example.com"],
      subject: "Congelado",
      html: "<p>Congelado</p>",
      text: "Congelado",
      template_version: 1,
    };
    const original = mocks.rpc.getMockImplementation()!;
    mocks.rpc.mockImplementation((name, args) =>
      name === "clinical_claim_notification_events"
        ? Promise.resolve({ data: [{ ...event, frozen_payload: frozen }], error: null })
        : original(name, args),
    );
    await processNotificationBatch();
    expect(mocks.send.mock.calls[0][0]).toEqual(frozen);
  });
});
