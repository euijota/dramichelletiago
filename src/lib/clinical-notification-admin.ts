import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/integrations/supabase/auth-middleware";

const stateSchema = z.object({
  pending_count: z.number(),
  failed_count: z.number(),
  uncertain_count: z.number(),
  last_cycle_completed_at: z.string().nullable(),
  last_health_code: z.enum(["healthy", "delayed", "failed"]).nullable(),
  recent_events: z.array(
    z.object({
      id: z.uuid(),
      status: z.enum(["pending", "processing", "accepted", "failed", "uncertain", "superseded"]),
      kind: z.enum(["confirmed", "cancelled"]),
      created_at: z.string(),
      attempt_count: z.number(),
      next_attempt_at: z.string().nullable(),
      reviewed_at: z.string().nullable(),
    }),
  ),
});

export const getClinicalNotificationState = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await supabaseAdmin.rpc("clinical_get_notification_status");
    if (result.error) throw new Error("Não foi possível consultar os avisos.");
    return stateSchema.parse(result.data);
  });

export const acknowledgeClinicalNotification = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(z.object({ id: z.uuid() }))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await supabaseAdmin.rpc("clinical_acknowledge_notification", {
      p_event_id: data.id,
      p_reviewer_id: context.userId,
    });
    if (result.error || !z.object({ code: z.literal("ok") }).safeParse(result.data).success) {
      throw new Error("O aviso ainda não pode ser marcado como revisado.");
    }
    return { success: true };
  });
