import { createFileRoute } from "@tanstack/react-router";
import { processNotificationBatch } from "@/lib/clinical-notifications.server";

export const Route = createFileRoute("/api/internal/clinical-notifications/process")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Validação de autenticação do segredo de processamento
        const processSecret =
          process.env.CLINICAL_PROCESS_SECRET ||
          process.env.CRON_SECRET ||
          process.env.SUPABASE_SERVICE_ROLE_KEY;

        const authHeader = request.headers.get("authorization");
        if (!processSecret || !authHeader || authHeader !== `Bearer ${processSecret}`) {
          return new Response(
            JSON.stringify({
              success: false,
              data: null,
              error: { code: "unauthorized", message: "Acesso não autorizado." },
            }),
            {
              status: 401,
              headers: {
                "Content-Type": "application/json",
                "Cache-Control": "no-store",
              },
            },
          );
        }

        try {
          const stats = await processNotificationBatch(10);
          return new Response(
            JSON.stringify({
              success: true,
              data: stats,
              error: null,
            }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                "Cache-Control": "no-store",
              },
            },
          );
        } catch (error) {
          console.error(
            "[api/internal/clinical-notifications/process] Erro ao processar lote:",
            error,
          );
          return new Response(
            JSON.stringify({
              success: false,
              data: null,
              error: {
                code: "temporarily_unavailable",
                message: "Falha ao processar notificações.",
              },
            }),
            {
              status: 503,
              headers: {
                "Content-Type": "application/json",
                "Cache-Control": "no-store",
              },
            },
          );
        }
      },
    },
  },
});
