import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendClinicalEmail } from "@/lib/email.server";

interface ClaimedEvent {
  id: string;
  lease_id: string;
  kind: "confirmed" | "cancelled";
  patient_name: string;
  patient_phone: string | null;
  appointment_date: string;
  appointment_time: string;
  attempt_count: number;
  frozen_payload: {
    subject: string;
    html: string;
    text: string;
  } | null;
}

export interface ProcessBatchResult {
  claimed: number;
  started: number;
  accepted: number;
  retryScheduled: number;
  failed: number;
  uncertain: number;
  released: number;
}

export async function processNotificationBatch(maxBatch = 10): Promise<ProcessBatchResult> {
  const result: ProcessBatchResult = {
    claimed: 0,
    started: 0,
    accepted: 0,
    retryScheduled: 0,
    failed: 0,
    uncertain: 0,
    released: 0,
  };

  // 1. Reserva de eventos elegíveis na fila
  const { data: rawEvents, error: claimError } = await (supabaseAdmin.rpc as any)(
    "clinical_claim_notification_events",
    { p_limit: maxBatch },
  );

  if (claimError || !Array.isArray(rawEvents) || rawEvents.length === 0) {
    return result;
  }

  const events = rawEvents as ClaimedEvent[];
  result.claimed = events.length;
  const startedLeaseIds: string[] = [];

  for (const event of events) {
    try {
      const dataBr = event.appointment_date.split("-").reverse().join("/");
      const horaBr = event.appointment_time.slice(0, 5);
      const isConfirmed = event.kind === "confirmed";

      const subject = isConfirmed
        ? `✅ Consulta Confirmada: ${event.patient_name} (${dataBr} às ${horaBr})`
        : `❌ Consulta Cancelada: ${event.patient_name} (${dataBr} às ${horaBr})`;

      const text = isConfirmed
        ? `O paciente ${event.patient_name} confirmou presença na consulta do dia ${dataBr} às ${horaBr}.`
        : `A consulta de ${event.patient_name} marcada para ${dataBr} às ${horaBr} foi cancelada.`;

      const html = `
        <div style="font-family: sans-serif; padding: 20px; line-height: 1.5; color: #1e293b;">
          <h2 style="color: ${isConfirmed ? "#059669" : "#dc2626"};">${subject}</h2>
          <p><strong>Paciente:</strong> ${event.patient_name}</p>
          <p><strong>Data:</strong> ${dataBr}</p>
          <p><strong>Horário:</strong> ${horaBr}</p>
          ${event.patient_phone ? `<p><strong>Telefone:</strong> ${event.patient_phone}</p>` : ""}
          <p style="margin-top: 24px; font-size: 13px; color: #64748b;">
            Notificação gerada pelo sistema da clínica Dra. Michelle Tiago.
          </p>
        </div>
      `;

      const payload = event.frozen_payload || { subject, html, text };

      // Inicia a tentativa de envio (congela payload e incrementa tentativa)
      const { data: beginResult, error: beginErr } = await (supabaseAdmin.rpc as any)(
        "clinical_begin_notification_attempt",
        {
          p_event_id: event.id,
          p_lease_id: event.lease_id,
          p_payload: payload,
        },
      );

      if (beginErr || beginResult?.code !== "ok") {
        continue;
      }

      result.started++;
      startedLeaseIds.push(event.lease_id);

      // Envia o e-mail via Resend
      const emailResult = await sendClinicalEmail({
        idempotencyKey: beginResult.idempotency_key,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      });

      // Conclui a tentativa no banco
      await (supabaseAdmin.rpc as any)("clinical_finish_notification_attempt", {
        p_event_id: event.id,
        p_lease_id: event.lease_id,
        p_result: emailResult.status,
        p_provider_id: emailResult.providerId || null,
        p_error_category: emailResult.errorCategory || null,
        p_retry_after_seconds: emailResult.retryAfterSeconds || null,
      });

      if (emailResult.status === "accepted") result.accepted++;
      else if (emailResult.status === "retryable") result.retryScheduled++;
      else if (emailResult.status === "permanent") result.failed++;
      else if (emailResult.status === "uncertain") result.uncertain++;
    } catch (eventErr) {
      console.error(`[processNotificationBatch] Erro no evento ${event.id}:`, eventErr);
    }
  }

  // Libera reservas que não puderam ser iniciadas
  const unstartedLeases = events
    .map((e) => e.lease_id)
    .filter((id) => !startedLeaseIds.includes(id));

  if (unstartedLeases.length > 0) {
    const { data: relData } = await (supabaseAdmin.rpc as any)(
      "clinical_release_unstarted_events",
      { p_lease_ids: unstartedLeases },
    );
    result.released = relData?.released_count || 0;
  }

  return result;
}
