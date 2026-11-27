import { expect, test } from "@playwright/test";
import { db } from "./helpers";

// A agenda pública lê os horários ocupados por get_public_occupied_slots via
// service_role (server function getOccupiedSlots). anon não tem EXECUTE na RPC
// (migration 20261127174833); este teste garante que o fluxo público segue de pé.

test("agenda pública bloqueia horário já ocupado", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto("/agendar");
  const slot = page.locator('button[aria-pressed="true"]');
  await expect(slot).toBeVisible();
  const date = await page.locator('button[data-day-active="true"]').getAttribute("data-date");
  const time = (await slot.textContent())!.trim();

  const { data, error } = await db
    .from("appointments")
    .insert({
      patient_name: "Paciente E2E Agenda",
      patient_phone: "(96) 98111-3333",
      service_name: "Avaliação",
      appointment_date: date!,
      appointment_time: `${time}:00`,
    })
    .select("id")
    .single();
  if (error) throw error;

  try {
    await page.reload();
    await page.locator(`button[data-date="${date}"]`).click();
    await expect(page.getByRole("button", { name: time, exact: true })).toBeDisabled();
    expect(errors).toEqual([]);
  } finally {
    await db.from("appointments").delete().eq("id", data.id);
  }
});
