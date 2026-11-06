import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseICSFeed, type ICSEvent } from "@/lib/clinic";

const ICAL_URL = process.env.ICAL_FEED_URL;

if (!ICAL_URL) {
  console.warn("[ical-server] ICAL_FEED_URL not set in environment variables");
}

/**
 * Public server function: returns ONLY occupied time slots { date, time }
 * Combines Google Calendar iCal feed + Supabase appointments.
 * No patient names, no descriptions — safe for public booking modal.
 */
export const getOccupiedSlots = createServerFn({ method: "GET" }).handler(async () => {
  const occupiedList: { date: string; time: string }[] = [];

  // 1. Google Calendar iCal Feed (if configured)
  if (ICAL_URL && ICAL_URL.startsWith("http")) {
    try {
      const res = await fetch(ICAL_URL, { cache: "no-store" });
      if (res.ok) {
        const text = await res.text();
        const events = parseICSFeed(text);
        for (const evt of events) {
          occupiedList.push({
            date: evt.date,
            time: evt.time.slice(0, 5),
          });
        }
      }
    } catch (e) {
      console.warn("[ical-server] Optional iCal fetch failed:", e);
    }
  }

  // 2. Supabase Appointments (only from today onwards so we never hit the 1000-row historical limit)
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
 * Admin-only server function: returns full ICS text for panel rendering.
 * Requires authentication + admin role check via middleware.
 */
export const fetchICalFeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!ICAL_URL || !ICAL_URL.startsWith("http")) {
      return [];
    }

    // Check admin role via authenticated context
    const { data: roleData } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      // Fallback check
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data } = await supabaseAdmin
          .from("user_roles")
          .select("role")
          .eq("user_id", context.userId)
          .eq("role", "admin")
          .maybeSingle();
        if (!data) throw new Error("Forbidden: admin access required");
      } catch {
        throw new Error("Forbidden: admin access required");
      }
    }

    const res = await fetch(ICAL_URL, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`iCal fetch failed: ${res.status}`);
    }

    return parseICSFeed(await res.text());
  });
