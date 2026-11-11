import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";

async function processRequest(request: Request) {
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
  const failure = (status: number, code: string) =>
    new Response(
      JSON.stringify({
        success: false,
        data: null,
        error: { code, message: "Não foi possível processar a solicitação." },
      }),
      { status, headers },
    );
  const secret = process.env.CLINICAL_PROCESS_SECRET;
  if (!secret || secret.length < 32) return failure(503, "temporarily_unavailable");
  const actual = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return failure(401, "unauthorized");
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json")
    return failure(415, "unsupported_media_type");
  const reader = request.body?.getReader();
  let body = "";
  let bytes = 0;
  const decoder = new TextDecoder();
  try {
    if (reader) {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 1024) {
          await reader.cancel();
          return failure(413, "payload_too_large");
        }
        body += decoder.decode(chunk.value, { stream: true });
      }
      body += decoder.decode();
    }
  } catch {
    return failure(400, "invalid_request");
  }
  try {
    const parsed = JSON.parse(body);
    if (
      !parsed ||
      Array.isArray(parsed) ||
      typeof parsed !== "object" ||
      Object.keys(parsed).length
    )
      return failure(400, "invalid_request");
  } catch {
    return failure(400, "invalid_request");
  }
  try {
    const { processNotificationBatch } = await import("@/lib/clinical-notifications.server");
    const stats = await processNotificationBatch(10);
    return new Response(JSON.stringify({ success: true, data: stats, error: null }), {
      status: 200,
      headers,
    });
  } catch {
    return failure(503, "temporarily_unavailable");
  }
}

export const Route = createFileRoute("/api/internal/clinical-notifications/process")({
  server: { handlers: { POST: ({ request }) => processRequest(request) } },
});
