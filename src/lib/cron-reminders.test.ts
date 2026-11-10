import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockUpdate = vi.fn();
const mockIs = vi.fn();
const mockIn = vi.fn(() => ({ is: mockIs }));
const mockEq = vi.fn(() => ({ in: mockIn }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));

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

describe("Automated 24h Cron Reminders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.APPOINTMENT_TOKEN_SECRET = "test-secret-appointment-12345678901234567890";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not falsely mark reminders sent when WHATSAPP_WEBHOOK_URL is not configured", async () => {
    const savedWebhook = process.env.WHATSAPP_WEBHOOK_URL;
    delete process.env.WHATSAPP_WEBHOOK_URL;

    mockIs.mockResolvedValueOnce({
      data: [
        {
          id: "550e8400-e29b-41d4-a716-446655440000",
          patient_name: "Maria Silva",
          patient_phone: "(96) 98111-2222",
          appointment_date: "2026-11-11",
          appointment_time: "14:00:00",
          service_name: "Consulta Odontológica",
          status: "pending",
          reminder_sent_at: null,
        },
      ],
      error: null,
    });

    try {
      const { execute24hReminders } = await import("./cron-reminders");
      const result = await execute24hReminders();

      expect(result.success).toBe(false);
      expect("reason" in result && result.reason).toBe("WHATSAPP_WEBHOOK_NOT_CONFIGURED");
      expect(result.sent).toBe(0);
      expect(mockUpdate).not.toHaveBeenCalled();
    } finally {
      if (savedWebhook !== undefined) process.env.WHATSAPP_WEBHOOK_URL = savedWebhook;
    }
  });

  it("sends via webhook and marks sent when WHATSAPP_WEBHOOK_URL is configured and responds HTTP 200", async () => {
    process.env.WHATSAPP_WEBHOOK_URL = "https://mock-whatsapp-webhook.internal/send";

    mockIs.mockResolvedValueOnce({
      data: [
        {
          id: "550e8400-e29b-41d4-a716-446655440000",
          patient_name: "Maria Silva",
          patient_phone: "(96) 98111-2222",
          appointment_date: "2026-11-11",
          appointment_time: "14:00:00",
          service_name: "Consulta Odontológica",
          status: "pending",
          reminder_sent_at: null,
        },
      ],
      error: null,
    });

    const mockEqUpdate = vi.fn().mockResolvedValue({ error: null });
    mockUpdate.mockReturnValue({ eq: mockEqUpdate });

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "queued" }), { status: 200 }));

    try {
      const { execute24hReminders } = await import("./cron-reminders");
      const result = await execute24hReminders();

      expect(result.success).toBe(true);
      expect(result.sent).toBe(1);
      expect(result.failed).toBe(0);
      expect(fetchSpy).toHaveBeenCalled();
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ reminder_sent_at: expect.any(String) }),
      );
    } finally {
      delete process.env.WHATSAPP_WEBHOOK_URL;
      fetchSpy.mockRestore();
    }
  });

  it("does not mark reminder sent when webhook returns error status", async () => {
    process.env.WHATSAPP_WEBHOOK_URL = "https://mock-whatsapp-webhook.internal/send";

    mockIs.mockResolvedValueOnce({
      data: [
        {
          id: "550e8400-e29b-41d4-a716-446655440000",
          patient_name: "Maria Silva",
          patient_phone: "(96) 98111-2222",
          appointment_date: "2026-11-11",
          appointment_time: "14:00:00",
          service_name: "Consulta Odontológica",
          status: "pending",
          reminder_sent_at: null,
        },
      ],
      error: null,
    });

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }));

    try {
      const { execute24hReminders } = await import("./cron-reminders");
      const result = await execute24hReminders();

      expect(result.success).toBe(true);
      expect(result.sent).toBe(0);
      expect(result.failed).toBe(1);
      expect(mockUpdate).not.toHaveBeenCalled();
    } finally {
      delete process.env.WHATSAPP_WEBHOOK_URL;
      fetchSpy.mockRestore();
    }
  });
});
