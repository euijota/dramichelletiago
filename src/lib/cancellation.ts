import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/integrations/supabase/auth-middleware";

const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, "Link inválido ou expirado.");
const snapshotSchema = z.object({
  patient_name: z.string(),
  appointment_date: z.string(),
  appointment_time: z.string(),
});
const actionResultSchema = z.object({
  code: z.string(),
  changed: z.boolean().optional(),
  status: z.string().optional(),
  event_id: z.string().uuid().optional(),
  appointment: snapshotSchema.optional(),
});

async function applyPatientAction(token: string, action: "confirm" | "cancel", reason?: string) {
  const { enforceClinicalLinkLimit } = await import("@/lib/clinical-link-limit.server");
  await enforceClinicalLinkLimit("action");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { hashLinkToken } = await import("@/lib/appointment-links.server");
  const { data, error } = await supabaseAdmin.rpc("clinical_apply_patient_action", {
    p_token_hash: hashLinkToken(token),
    p_action: action,
    p_reason: reason || undefined,
  });
  if (error) throw new Error("Não foi possível registrar a ação. Tente novamente.");
  const result = actionResultSchema.safeParse(data);
  if (!result.success) throw new Error("Resposta inválida ao registrar a ação.");
  const value = result.data;
  if (!["ok", "already_applied"].includes(value.code) || !value.appointment) {
    const messages: Record<string, string> = {
      appointment_past: "Esta consulta já passou.",
      transition_not_allowed: "Esta consulta não permite essa alteração.",
      action_not_allowed: "Este link não permite essa ação.",
    };
    throw new Error(messages[value.code] || "Link inválido ou expirado. Solicite um novo link.");
  }
  if (value.code === "ok" && (!value.changed || !value.event_id)) {
    throw new Error("Não foi possível comprovar o registro da ação.");
  }
  return {
    success: true,
    alreadyConfirmed: action === "confirm" && value.code === "already_applied",
    alreadyCancelled: action === "cancel" && value.code === "already_applied",
    notificationQueued: value.code === "ok",
    appointment: {
      name: value.appointment.patient_name,
      date: value.appointment.appointment_date,
      time: value.appointment.appointment_time,
    },
  };
}

export const confirmAppointmentByToken = createServerFn({ method: "POST" })
  .validator((input) => z.object({ token: tokenSchema }).parse(input))
  .handler(({ data }) => applyPatientAction(data.token, "confirm"));

export const cancelAppointmentByToken = createServerFn({ method: "POST" })
  .validator((input) =>
    z.object({ token: tokenSchema, reason: z.string().max(500).optional() }).parse(input),
  )
  .handler(({ data }) => applyPatientAction(data.token, "cancel", data.reason));

export const getAppointmentByToken = createServerFn({ method: "GET" })
  .validator((input: string) => tokenSchema.parse(input))
  .handler(async ({ data: token }) => {
    const { enforceClinicalLinkLimit } = await import("@/lib/clinical-link-limit.server");
    await enforceClinicalLinkLimit("read");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { hashLinkToken } = await import("@/lib/appointment-links.server");
    const { data, error } = await supabaseAdmin.rpc("clinical_preview_appointment", {
      p_token_hash: hashLinkToken(token),
    });
    if (error) throw new Error("Não foi possível consultar o agendamento. Tente novamente.");
    const preview = z
      .object({
        code: z.string(),
        appointment: snapshotSchema
          .extend({ status: z.string(), allowed_actions: z.array(z.enum(["confirm", "cancel"])) })
          .optional(),
      })
      .parse(data);
    if (preview.code !== "ok" || !preview.appointment) return null;
    return {
      ...preview.appointment,
      service_name: null,
      confirmationToken: token,
      cancellationToken: token,
    };
  });

async function issueTokens(appointmentId: string) {
  const { issueRevocableAppointmentLink } = await import("@/lib/appointment-links.server");
  const link = await issueRevocableAppointmentLink(appointmentId);
  return {
    confirmToken: link.token,
    cancelToken: link.token,
    confirmUrl: link.confirmUrl,
    cancelUrl: link.cancelUrl,
    snapshot: link.snapshot,
  };
}

// Emissão é uma ação administrativa explícita: substitui e revoga links anteriores.
export const getSingleAppointmentTokens = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: { appointmentId: string }) =>
    z.object({ appointmentId: z.string().uuid() }).parse(input),
  )
  .handler(({ data }) => issueTokens(data.appointmentId));

export const getAppointmentActionTokens = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: { appointmentIds: string[] }) =>
    z.object({ appointmentIds: z.array(z.string().uuid()).max(100) }).parse(input),
  )
  .handler(async ({ data }) => {
    const entries = await Promise.all(
      [...new Set(data.appointmentIds)].map(async (id) => [id, await issueTokens(id)] as const),
    );
    return Object.fromEntries(entries);
  });
