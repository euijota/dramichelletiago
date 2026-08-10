import { createServerFn } from "@tanstack/react-start";

const ICAL_URL =
  "https://calendar.google.com/calendar/ical/dramichellebarbosatiago%40gmail.com/public/basic.ics";

/** Busca o feed iCal do Google Agenda no servidor (sem CORS). */
export const fetchICalFeed = createServerFn({ method: "GET" }).handler(async () => {
  const res = await fetch(ICAL_URL, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`iCal fetch failed: ${res.status}`);
  }
  return res.text();
});
