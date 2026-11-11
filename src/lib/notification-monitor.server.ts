import * as Sentry from "@sentry/node";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const monitorSlug = "clinical-notifications";
const leaseSchema = z.object({
  claimed: z.literal(true),
  lease_id: z.uuid(),
  check_in_id: z.uuid(),
});
const healthSchema = z.enum(["healthy", "delayed", "failed"]);

async function claimCycle() {
  const result = await supabaseAdmin.rpc("clinical_claim_monitor_cycle");
  if (result.error) throw new Error("Falha ao reservar ciclo de monitoramento.");
  const lease = leaseSchema.safeParse(result.data);
  if (
    !lease.success &&
    !(
      result.data &&
      typeof result.data === "object" &&
      "claimed" in result.data &&
      result.data.claimed === false
    )
  ) {
    throw new Error("Resposta inválida do monitor.");
  }
  return lease.success ? lease.data : null;
}

async function finishCycle(leaseId: string, checkInId: string | undefined, workerFailed: boolean) {
  const result = await supabaseAdmin.rpc("clinical_notification_health");
  const parsed = healthSchema.safeParse(result.data);
  const health = workerFailed || result.error || !parsed.success ? "failed" : parsed.data;
  if (checkInId) {
    Sentry.captureCheckIn({
      monitorSlug,
      checkInId,
      status: health === "healthy" ? "ok" : "error",
    });
    if (!(await Sentry.flush(1500))) throw new Error("Check-in não finalizado.");
  }
  const completed = await supabaseAdmin.rpc("clinical_finish_monitor_cycle", {
    p_lease_id: leaseId,
    p_health_code: health,
  });
  if (
    completed.error ||
    !z.object({ updated: z.literal(true) }).safeParse(completed.data).success
  ) {
    throw new Error("Ciclo de monitoramento não finalizado.");
  }
}

export async function runWithClinicalMonitor<T>(run: () => Promise<T>): Promise<T> {
  const lease = await claimCycle().catch(() => {
    console.warn("Monitor clínico: reserva indisponível.");
    return null;
  });
  const dsn = process.env.SENTRY_DSN || process.env.VITE_SENTRY_DSN || process.env.VITE_SENTRY_DNS;
  let checkInId: string | undefined;
  if (lease && dsn) {
    try {
      if (!Sentry.isInitialized()) {
        Sentry.init({
          dsn,
          environment: process.env.VERCEL_ENV ?? "production",
          defaultIntegrations: false,
          sendDefaultPii: false,
          tracesSampleRate: 0,
        });
      }
      const checkIn = {
        monitorSlug,
        checkInId: lease.check_in_id.replaceAll("-", ""),
        status: "in_progress" as const,
      };
      checkInId = Sentry.captureCheckIn(checkIn, {
        schedule: { type: "interval", value: 1, unit: "minute" },
        checkinMargin: 2,
        maxRuntime: 1,
      });
    } catch {
      console.warn("Monitor clínico: check-in indisponível.");
    }
  }
  let failed = true;
  try {
    const result = await run();
    failed = false;
    return result;
  } finally {
    if (lease) {
      await finishCycle(lease.lease_id, checkInId, failed).catch(() => {
        console.warn("Monitor clínico: conclusão indisponível.");
      });
    }
  }
}
