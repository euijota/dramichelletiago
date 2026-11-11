// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ process: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (options: unknown) => options }));
vi.mock("@/lib/clinical-notifications.server", () => ({ processNotificationBatch: mocks.process }));
import { Route } from "@/routes/api/internal/clinical-notifications/process";
const handler = (
  Route as unknown as {
    server: { handlers: { POST: (args: { request: Request }) => Promise<Response> } };
  }
).server.handlers.POST;
const secret = "x".repeat(32);
function request(body = "{}", authorization = `Bearer ${secret}`, type = "application/json") {
  return handler({
    request: new Request("http://localhost/api/internal/clinical-notifications/process", {
      method: "POST",
      headers: { authorization, "content-type": type },
      body,
    }),
  });
}
beforeEach(() => {
  vi.stubEnv("CLINICAL_PROCESS_SECRET", secret);
  mocks.process.mockReset().mockResolvedValue({ claimed: 0 });
});
afterEach(() => vi.unstubAllEnvs());
describe("endpoint interno de processamento", () => {
  it("exige segredo dedicado antes de acessar a fila", async () => {
    expect((await request("{}", "Bearer wrong")).status).toBe(401);
    expect(mocks.process).not.toHaveBeenCalled();
  });
  it("recusa configuração incompleta", async () => {
    vi.stubEnv("CLINICAL_PROCESS_SECRET", "");
    expect((await request()).status).toBe(503);
    expect(mocks.process).not.toHaveBeenCalled();
  });
  it.each([
    ['{"event_id":"injected"}', 400],
    ["[]", 400],
    ["invalid", 400],
    ["x".repeat(1025), 413],
  ])("recusa payload %s", async (body, status) => {
    expect((await request(body)).status).toBe(status);
    expect(mocks.process).not.toHaveBeenCalled();
  });
  it("exige JSON", async () => {
    expect((await request("{}", `Bearer ${secret}`, "text/plain")).status).toBe(415);
  });
  it("processa somente a fila com limite fixo", async () => {
    const response = await request();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.process).toHaveBeenCalledWith(10);
  });
  it("não informa sucesso quando o banco falha", async () => {
    mocks.process.mockRejectedValue(new Error("private database details"));
    const response = await request();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private");
  });
});
