import type { RequestHandler } from "@tanstack/start";

export const GET: RequestHandler = async () => {
  const ICAL_URL =
    "https://calendar.google.com/calendar/ical/dramichellebarbosatiago%40gmail.com/private-01e577e4ac71421318a056fcd50dd223/basic.ics";
  try {
    const res = await fetch(ICAL_URL);
    const text = await res.text();
    return new Response(text, {
      headers: {
        "Content-Type": "text/calendar",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    console.error("Server iCal fetch error", e);
    return new Response("Error fetching iCal", { status: 500 });
  }
};
