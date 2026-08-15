export interface GoogleCalendarEventPayload {
  title: string;
  description: string;
  start: string;
  end: string;
  protocol: string;
}

interface GoogleCalendarRequest {
  url: string;
  init: {
    method: "POST";
    headers: { "Content-Type": "application/json" };
    body: string;
    redirect: "follow";
  };
}

interface GoogleCalendarResponse {
  success: true;
  duplicate?: boolean;
  eventId?: string;
}

export function buildGoogleCalendarRequest(
  url: string,
  secret: string,
  event: GoogleCalendarEventPayload,
): GoogleCalendarRequest {
  if (!secret) {
    throw new Error("Google Apps Script secret is not configured");
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("Invalid Google Apps Script URL");
  }

  if (
    parsedUrl.protocol !== "https:" ||
    parsedUrl.hostname !== "script.google.com" ||
    !parsedUrl.pathname.startsWith("/macros/s/") ||
    !parsedUrl.pathname.endsWith("/exec")
  ) {
    throw new Error("Invalid Google Apps Script URL");
  }

  return {
    url: parsedUrl.toString(),
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...event, token: secret }),
      redirect: "follow",
    },
  };
}

export function parseGoogleCalendarResponse(text: string): GoogleCalendarResponse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Invalid Google Calendar response");
  }

  if (!parsed || typeof parsed !== "object" || !("success" in parsed) || parsed.success !== true) {
    throw new Error("Google Calendar sync rejected");
  }

  return parsed as GoogleCalendarResponse;
}
