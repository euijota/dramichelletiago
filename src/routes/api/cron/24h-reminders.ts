import { createFileRoute } from "@tanstack/react-router";
import { execute24hReminders } from "@/lib/cron-reminders";

export const Route = createFileRoute("/api/cron/24h-reminders")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Validação de segurança com CRON_SECRET (fail-closed: sem segredo, recusa qualquer chamada)
        const cronSecret = process.env.CRON_SECRET;
        const authHeader = request.headers.get("authorization");
        if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        try {
          const result = await execute24hReminders();
          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (error) {
          console.error("[api/cron/24h-reminders] Erro ao executar lembretes:", error);
          return new Response(
            JSON.stringify({
              error: error instanceof Error ? error.message : "Internal Server Error",
            }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
      },
    },
  },
});
