import { describe, expect, it } from "vitest";
import { buildGoogleCalendarRequest, parseGoogleCalendarResponse } from "./google-calendar-request";

describe("buildGoogleCalendarRequest", () => {
  const event = {
    title: "Consulta odontológica",
    description: "Protocolo: AGENDA-123",
    start: "2026-08-20T15:00:00",
    end: "2026-08-20T16:00:00",
    protocol: "AGENDA-123",
  };

  it("keeps the shared secret out of the URL", () => {
    const request = buildGoogleCalendarRequest(
      "https://script.google.com/macros/s/deployment-id/exec",
      "strong-secret",
      event,
    );

    expect(request.url).toBe("https://script.google.com/macros/s/deployment-id/exec");
    expect(request.url).not.toContain("strong-secret");
    expect(request.init.method).toBe("POST");
  });

  it("sends a JSON body with the event and secret", () => {
    const request = buildGoogleCalendarRequest(
      "https://script.google.com/macros/s/deployment-id/exec",
      "strong-secret",
      event,
    );

    expect(request.init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(request.init.body)).toEqual({ ...event, token: "strong-secret" });
  });

  it("rejects non-HTTPS Apps Script URLs", () => {
    expect(() =>
      buildGoogleCalendarRequest("http://example.com/hook", "strong-secret", event),
    ).toThrow("Invalid Google Apps Script URL");
  });

  it("rejects an empty secret", () => {
    expect(() =>
      buildGoogleCalendarRequest(
        "https://script.google.com/macros/s/deployment-id/exec",
        "",
        event,
      ),
    ).toThrow("Google Apps Script secret is not configured");
  });

  it("accepts a successful Apps Script response", () => {
    expect(parseGoogleCalendarResponse('{"success":true,"duplicate":false}')).toEqual({
      success: true,
      duplicate: false,
    });
  });

  it("rejects malformed or unsuccessful Apps Script responses", () => {
    expect(() => parseGoogleCalendarResponse("not-json")).toThrow(
      "Invalid Google Calendar response",
    );
    expect(() => parseGoogleCalendarResponse('{"success":false,"error":"Forbidden"}')).toThrow(
      "Google Calendar sync rejected",
    );
  });
});
