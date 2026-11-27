import { expect, test } from "@playwright/test";
import { db } from "./helpers";

const feedToken = process.env.E2E_CALENDAR_FEED_TOKEN!; // definido no playwright.config

test("feed iCal da agenda: token errado dá 404, certo lista a consulta", async ({ request }) => {
  expect((await request.get("/api/calendar/token-errado")).status()).toBe(404);

  const date = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await db
    .from("appointments")
    .insert({
      patient_name: "Paciente Feed Teste",
      patient_phone: "(96) 98111-4444",
      service_name: "Avaliação",
      appointment_date: date,
      appointment_time: "09:00:00",
    })
    .select("id")
    .single();
  if (error) throw error;

  try {
    const res = await request.get(`/api/calendar/${feedToken}`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/calendar");
    const ics = await res.text();
    expect(ics).toContain(`UID:${data.id}@dramichelletiago.com.br`);
    expect(ics).toContain(`DTSTART:${date.replace(/-/g, "")}T120000Z`);
    expect(ics).toContain("SUMMARY:Paciente T. — Avaliação");
    expect(ics).not.toContain("98111-4444");
  } finally {
    await db.from("appointments").delete().eq("id", data.id);
  }
});
