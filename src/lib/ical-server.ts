import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { type ICSEvent } from "@/lib/clinic";

/**
 * Public server function: returns ONLY occupied time slots { date, time }
 * Uses Supabase appointments exclusively (single source of truth).
 * No patient names, no descriptions — safe for public booking modal.
 */
export const getOccupiedSlots = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("get_public_occupied_slots");
  if (error) throw new Error("Não foi possível consultar os horários.");
  return (data ?? []).map(({ appointment_date, appointment_time }) => ({
    date: appointment_date,
    time: appointment_time.slice(0, 5),
  }));
});

/**
 * Legacy stub kept for compatibility — returns empty array so Google Calendar never pollutes the panel.
 */
export const fetchICalFeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<ICSEvent[]> => {
    return [];
  });
