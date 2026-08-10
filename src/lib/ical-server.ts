import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseICSFeed, type ICSEvent } from "@/lib/clinic";

const ICAL_URL = process.env.ICAL_FEED_URL;

if (!ICAL_URL) {
  console.warn("[ical-server] ICAL_FEED_URL not set in environment variables");
}

/**
 * Public server function: returns ONLY occupied time slots { date, time }
 * No patient names, no descriptions — safe for public booking modal.
 */
export const getOccupiedSlots = createServerFn({ method: "GET" }).handler(async () => {
  if (!ICAL_URL) {
    throw new Error("ICAL_FEED_URL not configured");
  }

  const res = await fetch(ICAL_URL, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`iCal fetch failed: ${res.status}`);
  }

  const text = await res.text();
  const events = parseICSFeed(text);

  // Return only date + time (no summary, no description)
  return events.map((evt: ICSEvent) => ({
    date: evt.date,
    time: evt.time,
  }));
});

/**
 * Admin-only server function: returns full ICS text for panel rendering.
 * Requires authentication + admin role check via middleware.
 */
export const fetchICalFeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!ICAL_URL) {
      throw new Error("ICAL_FEED_URL not configured");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Check admin role
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();

    if (roleError) throw roleError;
    if (!roleData) {
      throw new Error("Forbidden: admin access required");
    }

    const res = await fetch(ICAL_URL, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`iCal fetch failed: ${res.status}`);
    }

    return parseICSFeed(await res.text());
  });
