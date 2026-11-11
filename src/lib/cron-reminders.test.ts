import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockUpdate = vi.fn();
const mockIsConfirmed = vi.fn();
const mockIsReminder = vi.fn();
const mockEq = vi.fn(() => ({ is: mockIsConfirmed }));
const mockIn = vi.fn(() => ({ eq: mockEq }));
const mockSelect = vi.fn(() => ({ in: mockIn }));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      if (table === "appointments") {
        return {
          select: mockSelect,
          update: mockUpdate,
        };
      }
      return { select: vi.fn(), update: vi.fn() };
    }),
  },
}));

vi.mock("@/lib/message-templates-server", () => ({
  getMessageTemplate: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/appointment-links.server", () => ({
  issueRevocableAppointmentLink: vi.fn().mockResolvedValue({
    token: "b".repeat(43),
    snapshot: {
      patient_name: "Maria Silva",
      patient_phone: "96981112222",
      appointment_date: "2026-11-12",
      appointment_time: "00:30:00",
    },
  }),
}));

// Instante fixo para os testes: 2026-11-11T07:30:00Z (04:30 em Macapá/Belém).
// Janela de confirmação: [2026-11-12T02:30:00Z, 2026-11-12T04:30:00Z] (20h antes ± 1h),
// que cruza a meia-noite local (datas 2026-11-11 e 2026-11-12 na query).
const FIXED_NOW = new Date("2026-11-11T07:30:00Z");
const IN_WINDOW_APPOINTMENT = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  patient_name: "Maria Silva",
  patient_phone: "(96) 98111-2222",
  appointment_date: "2026-11-12",
  appointment_time: "00:30:00", // 03:30Z = exatamente 20h antes
  service_name: "Consulta Odontológica",
  status: "pending",
  reminder_sent_at: null,
};

function mockQueryResult(data: unknown[], error: unknown = null) {
  mockIsReminder.mockResolvedValueOnce({ data, error });
}

describe("Cron de confirmação 20h antes (executeConfirmationReminders)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.APPOINTMENT_TOKEN_SECRET = "test-secret-appointment-12345678901234567890";
    mockIn.mockReturnValue({ eq: mockEq });
    mockEq.mockReturnValue({ is: mockIsConfirmed });
    mockIsConfirmed.mockReturnValue({ is: mockIsReminder });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("consulta apenas pendentes não confirmadas e sem envio anterior, nas datas cobertas pela janela", async () => {
    mockQueryResult([]);
    const { executeConfirmationReminders } = await import("./cron-reminders");
    await executeConfirmationReminders(FIXED_NOW);

    expect(mockSelect).toHaveBeenCalledWith(expect.stringContaining("reminder_sent_at"));
    expect(mockIn).toHaveBeenCalledWith(
      "appointment_date",
      expect.arrayContaining(["2026-11-11", "2026-11-12"]),
    );
    expect(mockEq).toHaveBeenCalledWith("status", "pending");
    expect(mockIsConfirmed).toHaveBeenCalledWith("confirmed_at", null);
    expect(mockIsReminder).toHaveBeenCalledWith("reminder_sent_at", null);
  });

  it("não marca envio quando WHATSAPP_WEBHOOK_URL não está configurado", async () => {
    const savedWebhook = process.env.WHATSAPP_WEBHOOK_URL;
    delete process.env.WHATSAPP_WEBHOOK_URL;
    mockQueryResult([IN_WINDOW_APPOINTMENT]);

    try {
      const { executeConfirmationReminders } = await import("./cron-reminders");
      const result = await executeConfirmationReminders(FIXED_NOW);

      expect(result.success).toBe(false);
      expect("reason" in result && result.reason).toBe("WHATSAPP_WEBHOOK_NOT_CONFIGURED");
      expect(result.sent).toBe(0);
      expect(mockUpdate).not.toHaveBeenCalled();
    } finally {
      if (savedWebhook !== undefined) process.env.WHATSAPP_WEBHOOK_URL = savedWebhook;
    }
  });

  it("envia via webhook e marca reminder_sent_at quando o webhook aceita (HTTP 200)", async () => {
    process.env.WHATSAPP_WEBHOOK_URL = "https://mock-whatsapp-webhook.internal/send";
    mockQueryResult([IN_WINDOW_APPOINTMENT]);

    const mockEqUpdate = vi.fn().mockResolvedValue({ error: null });
    mockUpdate.mockReturnValue({ eq: mockEqUpdate });

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "queued" }), { status: 200 }));

    try {
      const { executeConfirmationReminders } = await import("./cron-reminders");
      const result = await executeConfirmationReminders(FIXED_NOW);

      expect(result.success).toBe(true);
      expect(result.sent).toBe(1);
      expect(result.failed).toBe(0);
      expect(fetchSpy).toHaveBeenCalledWith(
        "https://mock-whatsapp-webhook.internal/send",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("appointment_confirmation_20h"),
        }),
      );
      const body = JSON.parse(
        (fetchSpy.mock.calls[0] as unknown as [string, { body: string }])[1].body,
      );
      expect(body.confirmUrl).toMatch(/^https:\/\/dramichelletiago\.com\.br\/confirmar\//);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ reminder_sent_at: expect.any(String) }),
      );
    } finally {
      delete process.env.WHATSAPP_WEBHOOK_URL;
      fetchSpy.mockRestore();
    }
  });

  it("não marca envio quando o webhook retorna erro (HTTP 401)", async () => {
    process.env.WHATSAPP_WEBHOOK_URL = "https://mock-whatsapp-webhook.internal/send";
    mockQueryResult([IN_WINDOW_APPOINTMENT]);

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }));

    try {
      const { executeConfirmationReminders } = await import("./cron-reminders");
      const result = await executeConfirmationReminders(FIXED_NOW);

      expect(result.success).toBe(true);
      expect(result.sent).toBe(0);
      expect(result.failed).toBe(1);
      expect(mockUpdate).not.toHaveBeenCalled();
    } finally {
      delete process.env.WHATSAPP_WEBHOOK_URL;
      fetchSpy.mockRestore();
    }
  });

  it("ignora consultas fora da janela de 20h (mesmo estando nas datas consultadas)", async () => {
    process.env.WHATSAPP_WEBHOOK_URL = "https://mock-whatsapp-webhook.internal/send";
    // 18:00 local em 2026-11-12 = 21:00Z = 35h no futuro (fora da janela)
    mockQueryResult([{ ...IN_WINDOW_APPOINTMENT, appointment_time: "18:00:00" }]);

    const fetchSpy = vi.spyOn(globalThis, "fetch");

    try {
      const { executeConfirmationReminders } = await import("./cron-reminders");
      const result = await executeConfirmationReminders(FIXED_NOW);

      expect(result.success).toBe(true);
      expect(result.sent).toBe(0);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
    } finally {
      delete process.env.WHATSAPP_WEBHOOK_URL;
      fetchSpy.mockRestore();
    }
  });

  it("ignora consultas que já passaram do horário (no passado)", async () => {
    process.env.WHATSAPP_WEBHOOK_URL = "https://mock-whatsapp-webhook.internal/send";
    // 08:00 local em 2026-11-11 = 11:00Z = 1h no futuro (fora da janela)
    mockQueryResult([
      { ...IN_WINDOW_APPOINTMENT, appointment_date: "2026-11-11", appointment_time: "08:00:00" },
    ]);

    const fetchSpy = vi.spyOn(globalThis, "fetch");

    try {
      const { executeConfirmationReminders } = await import("./cron-reminders");
      const result = await executeConfirmationReminders(FIXED_NOW);

      expect(result.sent).toBe(0);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      delete process.env.WHATSAPP_WEBHOOK_URL;
      fetchSpy.mockRestore();
    }
  });
});
