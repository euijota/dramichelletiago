import { createFileRoute } from "@tanstack/react-router";
import { buildCalendarFeed, isValidFeedToken } from "@/lib/calendar-feed";
import { addDays, toISODate } from "@/lib/clinic";

// Feed iCal só-leitura para a Dra. assinar no Google Agenda ("Do URL").
// O token mora em CALENDAR_FEED_TOKEN; trocar o valor na Vercel invalida o link antigo.
export const Route = createFileRoute("/api/calendar/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        if (!isValidFeedToken(params.token, process.env.CALENDAR_FEED_TOKEN)) {
          return new Response("Not found", { status: 404 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const today = new Date();
        const { data, error } = await supabaseAdmin
          .from("appointments")
          .select(
            "id, appointment_date, appointment_time, duration_minutes, patient_name, service_name, status, updated_at",
          )
          .neq("status", "cancelled")
          .gte("appointment_date", toISODate(addDays(today, -30)))
          .lte("appointment_date", toISODate(addDays(today, 180)))
          .order("appointment_date")
          .order("appointment_time");

        if (error) {
          console.error("[api/calendar] Erro ao consultar agendamentos:", error.message);
          return new Response("Erro ao gerar a agenda", { status: 500 });
        }

        return new Response(buildCalendarFeed(data ?? []), {
          headers: {
            "Content-Type": "text/calendar; charset=utf-8",
            "Cache-Control": "private, no-store",
            "X-Robots-Tag": "noindex",
          },
        });
      },
    },
  },
});
