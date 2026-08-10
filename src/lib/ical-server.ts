import { createServerFn } from "@tanstack/react-start";

const ICAL_URL =
  "https://calendar.google.com/calendar/ical/dramichellebarbosatiago%40gmail.com/public/basic.ics";

/** Busca o feed iCal do Google Agenda no servidor (sem CORS). */
export const fetchICalFeed = createServerFn({ method: "GET" }).handler(async () => {
  let res;
  try {
    res = await fetch(ICAL_URL, { cache: "no-store" });
    if (!res.ok) {
      console.error(`iCal fetch failed with status: ${res.status} for URL: ${ICAL_URL}`);
      return ""; // Return empty feed instead of throwing
    }
    return res.text();
  } catch (error) {
    console.error("Error fetching iCal feed:", error);
    return ""; // Fail gracefully
  }
});
