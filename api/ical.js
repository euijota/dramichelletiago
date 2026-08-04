// api/ical.js
// Vercel serverless function that proxies the private Google Calendar iCal feed

export default async function handler(req, res) {
  const ICAL_URL =
    "https://calendar.google.com/calendar/ical/dramichellebarbosatiago%40gmail.com/private-01e577e4ac71421318a056fcd50dd223/basic.ics";
  try {
    const response = await fetch(ICAL_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch iCal: ${response.status}`);
    }
    const text = await response.text();
    res.setHeader("Content-Type", "text/calendar");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).send(text);
  } catch (error) {
    console.error("Vercel iCal fetch error:", error);
    res.status(500).send("Error fetching iCal");
  }
}
