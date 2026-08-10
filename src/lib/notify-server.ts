import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const APPS_SCRIPT_SECRET = process.env.GOOGLE_APPS_SCRIPT_SECRET;

if (!APPS_SCRIPT_SECRET) {
  console.warn("[notify-server] GOOGLE_APPS_SCRIPT_SECRET not set — Calendar sync will fail");
}

// Rate limiting: simple in-memory store by IP
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 5; // 5 requests per minute per IP

function checkRateLimit(ip: string): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true };
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }

  entry.count++;
  return { allowed: true };
}

export interface BookingPayload {
  appointmentDate: string;
  appointmentTime: string;
  patientName: string;
  patientPhone: string;
  patientEmail: string;
  serviceName: string;
  notes: string;
  protocol: string;
}

// Zod schema for validation
const bookingSchema = z.object({
  appointmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (YYYY-MM-DD)"),
  appointmentTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Horário inválido (HH:MM)"),
  patientName: z.string().min(2, "Nome muito curto").max(120),
  patientPhone: z.string().min(8, "Telefone inválido").max(20),
  patientEmail: z.string().email("E-mail inválido").optional().or(z.literal("")),
  serviceName: z.string().min(2).max(120),
  notes: z.string().max(1000).optional().default(""),
  protocol: z.string().regex(/^AG-\d{6}$/, "Protocolo inválido"),
});

/** Salva o agendamento e envia notificação para a Dra. Michelle. */
export const saveAppointmentAndNotify = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const parsed = bookingSchema.safeParse(data);
    if (!parsed.success) {
      throw new Error(parsed.error.errors.map(e => e.message).join(", "));
    }
    return parsed.data;
  })
  .handler(async (ctx) => {
    const data = ctx.data;

    // Rate limiting by IP
    const request = await import("@tanstack/react-start/server").then(m => m.getRequest());
    const ip = request?.headers?.get("x-forwarded-for")?.split(",")[0]?.trim()
      || request?.headers?.get("x-real-ip")
      || "unknown";

    const rl = checkRateLimit(ip);
    if (!rl.allowed) {
      throw new Error(`Muitas tentativas. Tente novamente em ${Math.ceil((rl.retryAfterMs || 60000) / 1000)}s.`);
    }

    const record = {
      appointment_date: data.appointmentDate,
      appointment_time: data.appointmentTime,
      patient_name: data.patientName,
      patient_phone: data.patientPhone,
      patient_email: data.patientEmail || null,
      service_name: data.serviceName,
      notes: data.notes,
      status: "pending" as const,
      // duration will be looked up from services table
    };

    // 1. Save via supabaseAdmin (service role) - only way that works now
    let dbSaved = false;
    let durationMinutes = 60;

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      // Look up service duration
      const { data: service } = await supabaseAdmin
        .from("services")
        .select("duration_minutes")
        .eq("name", data.serviceName)
        .eq("is_active", true)
        .maybeSingle();

      if (service?.duration_minutes) {
        durationMinutes = service.duration_minutes;
        (record as any).duration_minutes = durationMinutes;
      }

      const { error } = await supabaseAdmin.from("appointments").insert(record);
      if (!error) {
        dbSaved = true;
      } else if (error.code === "23505") {
        // Unique violation (unique_active_appointment_slot)
        throw new Error("Este horário acabou de ser reservado. Por favor, escolha outro.");
      } else {
        console.warn("[saveAppointmentAndNotify] Admin insert error:", error.message);
        throw new Error(`Erro ao salvar: ${error.message}`);
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes("horário")) throw e;
      console.error("[saveAppointmentAndNotify] Admin client error:", e);
      throw new Error("Serviço indisponível. Tente novamente ou agende via WhatsApp.");
    }

    // 2. Email notification via Formspree
    const messageText =
      `📌 NOVO AGENDAMENTO RECEBIDO\n\n` +
      `Protocolo: ${data.protocol}\n` +
      `Paciente: ${data.patientName}\n` +
      `Telefone: ${data.patientPhone}\n` +
      `E-mail: ${data.patientEmail || "Não informado"}\n` +
      `Data: ${data.appointmentDate} às ${data.appointmentTime}\n` +
      `Serviço: ${data.serviceName}\n` +
      `Duração: ${durationMinutes} min\n` +
      `Observações: ${data.notes || "Nenhuma"}\n\n` +
      `✅ Salvo no banco: ${dbSaved ? "Sim" : "Não"}`;

    try {
      await fetch("https://formspree.io/f/xbjnqpyz", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          _replyto: data.patientEmail || "noreply@site.com",
          subject: `🩺 [Agendamento Site] ${data.patientName} - ${data.appointmentDate} às ${data.appointmentTime}`,
          message: messageText,
          protocol: data.protocol,
          patientName: data.patientName,
          patientPhone: data.patientPhone,
        }),
      });
      console.log("[saveAppointmentAndNotify] Email sent for", data.protocol);
    } catch (e) {
      console.warn("[saveAppointmentAndNotify] Email warning:", e);
    }

    // 3. Google Calendar via Apps Script (with secret token)
    if (APPS_SCRIPT_SECRET) {
      const appsScriptUrl = process.env.GOOGLE_APPS_SCRIPT_URL ||
        "https://script.google.com/macros/s/AKfycbxCcfshrC-pTc_53ON17oKeWDNTeQkEtPoP4a1_xeT5XxEFxZo5VPEcMgjMkjkNUbJODw/exec";

      try {
        const [hh, mm] = data.appointmentTime.split(":").map(Number);
        const pad = (n: number) => String(n).padStart(2, "0");
        const startStr = `${data.appointmentDate}T${pad(hh)}:${pad(mm)}:00`;
        const endMinutes = hh * 60 + mm + durationMinutes;
        const endHh = Math.floor(endMinutes / 60) % 24;
        const endMm = endMinutes % 60;
        const endStr = `${data.appointmentDate}T${pad(endHh)}:${pad(endMm)}:00`;

        const desc = `Protocolo: ${data.protocol}\nTelefone: ${data.patientPhone}\nServiço: ${data.serviceName}\nDuração: ${durationMinutes} min\nObs: ${data.notes || "Nenhuma"}`;

        const params = new URLSearchParams({
          title: `🦷 ${data.patientName}`,
          description: desc,
          start: startStr,
          end: endStr,
          token: APPS_SCRIPT_SECRET,
        });

        const res = await fetch(`${appsScriptUrl}?${params.toString()}`, {
          method: "GET",
          redirect: "follow",
        });
        const text = await res.text();
        console.log("[saveAppointmentAndNotify] Google Calendar response:", text.substring(0, 200));
      } catch (e) {
        console.warn("[saveAppointmentAndNotify] Google Calendar warning:", e);
      }
    } else {
      console.warn("[saveAppointmentAndNotify] GOOGLE_APPS_SCRIPT_SECRET not set, skipping Calendar sync");
    }

    return { success: true, dbSaved, protocol: data.protocol };
  });