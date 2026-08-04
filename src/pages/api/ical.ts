// src/pages/api/ical.ts
// Server‑side proxy to fetch the Google Calendar iCal feed and expose it with CORS headers.
// This endpoint is used by the BookingModal component to avoid browser CORS restrictions.

export default async function handler(req, res) {
  // Private iCal URL (replace with your own if needed)
  const ICAL_URL =
    "https://calendar.google.com/calendar/ical/dramichellebarbosatiago%40gmail.com/private-01e577e4ac71421318a056fcd50dd223/basic.ics";
  try {
    const response = await fetch(ICAL_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch iCal: ${response.status}`);
    }
    const icalText = await response.text();
    // Set CORS header so browsers can access this endpoint from any origin.
    res.setHeader("Access-Control-Allow-Origin", "*");
    // Content‑type for iCal data.
    res.setHeader("Content-Type", "text/calendar");
    res.status(200).send(icalText);
  } catch (error) {
    console.error("Error in /api/ical:", error);
    res.status(500).json({ error: "Unable to retrieve iCal feed" });
  }
}
