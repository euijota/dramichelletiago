import { createServerFn } from "@tanstack/react-start";
import type { RecessPeriod } from "@/lib/recess";

/**
 * Public server function: returns the clinic recess periods (name + range).
 * No patient data. Used by the public booking calendar to block whole days.
 */
export const getRecesses = createServerFn({ method: "GET" }).handler(
  async (): Promise<RecessPeriod[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("clinic_recesses")
      .select("id, name, start_date, end_date")
      .order("start_date", { ascending: true });

    if (error) {
      // Falha em recesso nunca deve derrubar o agendamento: loga e segue.
      console.error("Erro ao carregar recessos:", error.message);
      return [];
    }

    return (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      start_date: row.start_date,
      end_date: row.end_date,
    }));
  },
);
