import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  clinicalEmailPayloadSchema,
  getClinicalEmailConfiguration,
  sendClinicalEmail,
} from "@/lib/email.server";

const eventSchema = z.object({
  id: z.string().uuid(),
  lease_id: z.string().uuid(),
  kind: z.enum(["confirmed", "cancelled"]),
  patient_name: z.string(),
  patient_phone: z.string().nullable(),
  appointment_date: z.string(),
  appointment_time: z.string(),
  frozen_payload: clinicalEmailPayloadSchema.nullable(),
});
type Event = z.infer<typeof eventSchema>;
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

export interface ProcessBatchResult {
  claimed: number;
  started: number;
  accepted: number;
  retryScheduled: number;
  failed: number;
  uncertain: number;
  released: number;
}

function renderPayload(event: Event, config: ReturnType<typeof getClinicalEmailConfiguration>) {
  if (event.frozen_payload) return event.frozen_payload;
  const status = event.kind === "confirmed" ? "CONFIRMADA" : "CANCELADA";
  const date = event.appointment_date.split("-").reverse().join("/");
  const time = event.appointment_time.slice(0, 5);
  const subject = `[${status}] ${event.patient_name.replace(/[\r\n]/g, " ")} — ${date} ${time}`;
  const phone = (event.patient_phone || "").replace(/\D/g, "");
  const normalized = phone.length === 10 || phone.length === 11 ? `55${phone}` : phone;
  const link = /^55\d{10,11}$/.test(normalized) ? `https://wa.me/${normalized}` : null;
  const text = `${subject}${link ? `\nWhatsApp: ${link}` : ""}`;
  return {
    from: config.from,
    to: [config.to],
    subject,
    text,
    html: `<p>${escapeHtml(subject)}</p>${link ? `<p><a href="${link}">WhatsApp do paciente</a></p>` : ""}`,
    template_version: 1 as const,
  };
}

async function processEvent(
  event: Event,
  config: ReturnType<typeof getClinicalEmailConfiguration>,
) {
  const payload = renderPayload(event, config);
  const { data, error } = await supabaseAdmin.rpc("clinical_begin_notification_attempt", {
    p_event_id: event.id,
    p_lease_id: event.lease_id,
    p_payload: payload,
  });
  if (error) throw new Error("Falha ao iniciar tentativa persistida.");
  const begin = z
    .object({
      code: z.string(),
      idempotency_key: z.string().optional(),
      frozen_payload: clinicalEmailPayloadSchema.optional(),
    })
    .parse(data);
  if (["stale_lease", "superseded", "exhausted"].includes(begin.code))
    return { started: false, status: begin.code, scheduled: false };
  if (begin.code !== "ok" || !begin.idempotency_key || !begin.frozen_payload)
    throw new Error("Resposta inválida ao iniciar tentativa.");
  const email = await sendClinicalEmail(begin.frozen_payload, begin.idempotency_key);
  const finish = await supabaseAdmin.rpc("clinical_finish_notification_attempt", {
    p_event_id: event.id,
    p_lease_id: event.lease_id,
    p_result: email.status,
    p_provider_id: email.providerId || undefined,
    p_error_category: email.errorCategory || undefined,
    p_retry_after_seconds: email.retryAfterSeconds ?? undefined,
  });
  if (finish.error) throw new Error("Falha ao persistir resultado do envio.");
  const stored = z
    .object({
      code: z.literal("ok"),
      status: z.enum(["accepted", "failed", "uncertain", "pending"]),
      next_attempt_at: z.string().nullable().optional(),
    })
    .parse(finish.data);
  return { started: true, status: stored.status, scheduled: !!stored.next_attempt_at };
}

async function releaseUnstartedEvents(events: Event[]) {
  const release = await supabaseAdmin.rpc("clinical_release_unstarted_events", {
    p_lease_ids: events.map((event) => event.lease_id),
  });
  if (release.error) throw new Error("Falha ao liberar reservas não iniciadas.");
  return z.object({ released_count: z.number() }).parse(release.data).released_count;
}

export async function processNotificationBatch(maxBatch = 10): Promise<ProcessBatchResult> {
  if (process.env.CLINICAL_NOTIFICATIONS_ENABLED !== "true")
    throw new Error("Processamento de notificações desativado.");
  const { runWithClinicalMonitor } = await import("@/lib/notification-monitor.server");
  return runWithClinicalMonitor(() => processBatch(maxBatch));
}

async function processBatch(maxBatch: number): Promise<ProcessBatchResult> {
  const config = getClinicalEmailConfiguration(); // Before claiming: never consume attempts on missing configuration.
  const startedAt = Date.now();
  const claim = await supabaseAdmin.rpc("clinical_claim_notification_events", {
    p_limit: Math.min(10, Math.max(1, Math.floor(maxBatch))),
  });
  if (claim.error) throw new Error("Falha ao reservar eventos persistidos.");
  const events = z.array(eventSchema).parse(claim.data);
  let totals: ProcessBatchResult = {
    claimed: events.length,
    started: 0,
    accepted: 0,
    retryScheduled: 0,
    failed: 0,
    uncertain: 0,
    released: 0,
  };
  try {
    for (let index = 0; index < events.length && Date.now() - startedAt < 10000; index += 2) {
      const outcomes = await Promise.allSettled(
        events.slice(index, index + 2).map((event) => processEvent(event, config)),
      );
      if (outcomes.some((outcome) => outcome.status === "rejected"))
        throw new Error("Lote incompleto: resultado não comprovado no banco.");
      for (const outcome of outcomes) {
        if (outcome.status !== "fulfilled") continue;
        const value = outcome.value;
        totals = {
          ...totals,
          started: totals.started + Number(value.started),
          accepted: totals.accepted + Number(value.status === "accepted"),
          failed: totals.failed + Number(value.status === "failed"),
          uncertain: totals.uncertain + Number(value.status === "uncertain"),
          retryScheduled: totals.retryScheduled + Number(value.scheduled),
        };
      }
    }
  } finally {
    // RPC releases only current reservations with no persisted request intention.
    if (events.length) {
      totals = { ...totals, released: await releaseUnstartedEvents(events) };
    }
  }
  return totals;
}
