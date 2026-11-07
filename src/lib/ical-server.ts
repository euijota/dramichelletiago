import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { type ICSEvent } from "@/lib/clinic";

/**
 * Public server function: returns ONLY occupied time slots { date, time }
 * Uses Supabase appointments exclusively (single source of truth).
 * No patient names, no descriptions — safe for public booking modal.
 */
export const getOccupiedSlots = createServerFn({ method: "GET" }).handler(async () => {
  const occupiedList: { date: string; time: string }[] = [];

  // Supabase Appointments (only from today onwards so we never hit the 1000-row historical limit)
  try {
    const todayIso = new Date().toISOString().split("T")[0];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: appointments } = await supabaseAdmin
      .from("appointments")
      .select("appointment_date, appointment_time")
      .gte("appointment_date", todayIso)
      .neq("status", "cancelled");

    if (appointments) {
      for (const appt of appointments) {
        occupiedList.push({
          date: appt.appointment_date,
          time: appt.appointment_time.slice(0, 5),
        });
      }
    }
  } catch (e) {
    console.warn("[ical-server] Supabase appointments fetch failed:", e);
  }

  // Deduplicate
  const seen = new Set<string>();
  const uniqueList: { date: string; time: string }[] = [];
  for (const item of occupiedList) {
    const key = `${item.date}_${item.time}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueList.push(item);
    }
  }

  return uniqueList;
});

/**
 * Legacy stub kept for compatibility — returns empty array so Google Calendar never pollutes the panel.
 */
export const fetchICalFeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<ICSEvent[]> => {
    return [];
  });
