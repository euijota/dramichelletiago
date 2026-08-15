const SCRIPT_TIME_ZONE = "America/Belem";
const SECRET_PROPERTY = "GOOGLE_APPS_SCRIPT_SECRET";
const PROTOCOL_PATTERN = /^AG-[0-9A-Za-z]{6,12}$/;

function doGet() {
  return jsonResponse_({ success: true, service: "calendar-booking-webhook" });
}

function doPost(e) {
  const configuredSecret = PropertiesService.getScriptProperties().getProperty(SECRET_PROPERTY);
  if (!configuredSecret) {
    console.error("Calendar webhook secret is not configured");
    return jsonResponse_({ success: false, error: "Configuration error" });
  }

  const payload = parsePayload_(e);
  if (!payload || typeof payload.token !== "string" || payload.token !== configuredSecret) {
    return jsonResponse_({ success: false, error: "Forbidden" });
  }

  const eventData = validateEvent_(payload);
  if (!eventData) {
    return jsonResponse_({ success: false, error: "Invalid event data" });
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return jsonResponse_({ success: false, error: "Service busy" });
  }

  try {
    const calendar = CalendarApp.getDefaultCalendar();
    const existing = calendar
      .getEvents(eventData.start, eventData.end)
      .find((event) => event.getTag("appointmentProtocol") === eventData.protocol);

    if (existing) {
      return jsonResponse_({ success: true, duplicate: true, eventId: existing.getId() });
    }

    const event = calendar.createEvent(eventData.title, eventData.start, eventData.end, {
      description: eventData.description,
    });
    event.setTag("appointmentProtocol", eventData.protocol);

    return jsonResponse_({ success: true, duplicate: false, eventId: event.getId() });
  } catch (error) {
    console.error("Calendar event creation failed", error);
    return jsonResponse_({ success: false, error: "Calendar operation failed" });
  } finally {
    lock.releaseLock();
  }
}

function parsePayload_(e) {
  if (!e || !e.postData || typeof e.postData.contents !== "string") return null;

  try {
    const parsed = JSON.parse(e.postData.contents);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (_error) {
    return null;
  }
}

function validateEvent_(payload) {
  if (
    typeof payload.title !== "string" ||
    typeof payload.description !== "string" ||
    typeof payload.start !== "string" ||
    typeof payload.end !== "string" ||
    typeof payload.protocol !== "string"
  ) {
    return null;
  }

  const title = payload.title.trim().replace(/[\r\n\t]+/g, " ");
  const description = payload.description.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  if (!title || title.length > 160 || description.length > 4000) return null;
  if (!PROTOCOL_PATTERN.test(payload.protocol)) return null;

  const start = parseLocalDateTime_(payload.start);
  const end = parseLocalDateTime_(payload.end);
  if (!start || !end) return null;

  const durationMinutes = (end.getTime() - start.getTime()) / 60000;
  if (durationMinutes < 5 || durationMinutes > 240) return null;

  return {
    title,
    description,
    start,
    end,
    protocol: payload.protocol,
  };
}

function parseLocalDateTime_(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value)) return null;

  const parsed = new Date(`${value}-03:00`);
  if (Number.isNaN(parsed.getTime())) return null;

  const normalized = Utilities.formatDate(parsed, SCRIPT_TIME_ZONE, "yyyy-MM-dd'T'HH:mm:ss");
  return normalized === value ? parsed : null;
}

function jsonResponse_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
