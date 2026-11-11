import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  guard: vi.fn(),
  limit: vi.fn(),
  middleware: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validator = (value: unknown) => value;
    const chain = {
      validator: (fn: typeof validator) => {
        validator = fn;
        return chain;
      },
      middleware: (items: unknown[]) => {
        mocks.middleware(items);
        return chain;
      },
      handler: (fn: (ctx: { data: unknown }) => unknown) => async (input: { data: unknown }) =>
        fn({ data: validator(input.data) }),
    };
    return chain;
  },
}));
vi.mock("@/lib/clinical-link-limit.server", () => ({ enforceClinicalLinkLimit: mocks.limit }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireAdmin: mocks.guard }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc: mocks.rpc, from: mocks.from },
}));
import {
  cancelAppointmentByToken,
  confirmAppointmentByToken,
  getAppointmentByToken,
  getSingleAppointmentTokens,
} from "./cancellation";
const token = "a".repeat(43);
const id = "550e8400-e29b-41d4-a716-446655440000";
const snapshot = {
  patient_name: "Paciente Teste",
  appointment_date: "2099-11-10",
  appointment_time: "15:00:00",
};
beforeEach(() => {
  mocks.limit.mockReset().mockResolvedValue(undefined);
  mocks.rpc.mockReset();
  mocks.from.mockReset();
});

describe("Ações públicas transacionais", () => {
  it("não acessa a consulta quando o limite falha", async () => {
    mocks.limit.mockRejectedValue(new Error("Muitas tentativas."));
    await expect(confirmAppointmentByToken({ data: { token } })).rejects.toThrow(
      "Muitas tentativas.",
    );
    await expect(getAppointmentByToken({ data: token })).rejects.toThrow("Muitas tentativas.");
    expect(mocks.limit.mock.calls).toEqual([["action"], ["read"]]);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("confirma somente por RPC e devolve evento enfileirado, sem provar entrega", async () => {
    mocks.rpc.mockResolvedValue({
      error: null,
      data: { code: "ok", changed: true, event_id: id, status: "confirmed", appointment: snapshot },
    });
    const result = await confirmAppointmentByToken({ data: { token } });
    expect(result.notificationQueued).toBe(true);
    expect(result).not.toHaveProperty("clinicNotified");
    expect(mocks.rpc).toHaveBeenCalledWith(
      "clinical_apply_patient_action",
      expect.objectContaining({
        p_action: "confirm",
        p_token_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("cancela passando motivo ao contrato transacional", async () => {
    mocks.rpc.mockResolvedValue({
      error: null,
      data: { code: "ok", changed: true, event_id: id, appointment: snapshot },
    });
    await cancelAppointmentByToken({ data: { token, reason: "Imprevisto" } });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "clinical_apply_patient_action",
      expect.objectContaining({ p_action: "cancel", p_reason: "Imprevisto" }),
    );
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("reclique retorna estado consolidado sem novo aviso", async () => {
    mocks.rpc.mockResolvedValue({
      error: null,
      data: { code: "already_applied", changed: false, status: "cancelled", appointment: snapshot },
    });
    expect((await cancelAppointmentByToken({ data: { token } })).alreadyCancelled).toBe(true);
    expect((await cancelAppointmentByToken({ data: { token } })).notificationQueued).toBe(false);
  });
  it.each([
    "invalid_link",
    "token_revoked",
    "token_expired",
    "appointment_past",
    "transition_not_allowed",
  ])("recusa %s sem fallback de update", async (code) => {
    mocks.rpc.mockResolvedValue({ error: null, data: { code } });
    await expect(confirmAppointmentByToken({ data: { token } })).rejects.toThrow();
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("erro do banco falha sem escrever diretamente", async () => {
    mocks.rpc.mockResolvedValue({ error: { message: "private SQL detail" }, data: null });
    await expect(confirmAppointmentByToken({ data: { token } })).rejects.toThrow(
      "Não foi possível registrar",
    );
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("não aceita sucesso sem evento persistido", async () => {
    mocks.rpc.mockResolvedValue({
      error: null,
      data: { code: "ok", changed: true, appointment: snapshot },
    });
    await expect(confirmAppointmentByToken({ data: { token } })).rejects.toThrow();
  });
  it("recusa HMAC v2 e legado antes do banco", async () => {
    for (const value of [
      Buffer.from(`${id}:confirm:clinica`).toString("base64url"),
      Buffer.from(`v2.${id}.confirm.exp.nonce.signature`).toString("base64url"),
      "a".repeat(5000),
    ]) {
      await expect(confirmAppointmentByToken({ data: { token: value } })).rejects.toThrow();
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("GET usa prévia do banco sem emitir ou renovar credenciais", async () => {
    mocks.rpc.mockResolvedValue({
      error: null,
      data: {
        code: "ok",
        appointment: { ...snapshot, status: "pending", allowed_actions: ["confirm", "cancel"] },
      },
    });
    const result = await getAppointmentByToken({ data: token });
    expect(result?.cancellationToken).toBe(token);
    expect(result).not.toHaveProperty("id");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc.mock.calls[0][0]).toBe("clinical_preview_appointment");
  });
  it("emissão exige middleware admin e persiste hash; mesmo token permite ambas as ações", async () => {
    expect(mocks.middleware).toHaveBeenCalledWith([mocks.guard]);
    mocks.rpc.mockResolvedValue({
      error: null,
      data: {
        code: "ok",
        expires_at: "2099-11-12",
        snapshot: { ...snapshot, patient_phone: "96981112222" },
      },
    });
    const result = await getSingleAppointmentTokens({ data: { appointmentId: id } });
    expect(result.confirmToken).toHaveLength(43);
    expect(result.cancelToken).toBe(result.confirmToken);
    expect(mocks.rpc).toHaveBeenCalledWith("clinical_issue_appointment_link", {
      p_appointment_id: id,
      p_token_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain(result.confirmToken);
  });
});
