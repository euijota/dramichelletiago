import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { CLINIC } from "@/lib/clinic";
import { renderTemplate } from "@/lib/message-templates";
import { getMessageTemplate } from "@/lib/message-templates-server";

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
    };

    // 1. Save via supabaseAdmin (service role)
    let dbSaved = false;
    let appointmentId = "";
    let cancellationToken = "";
    let confirmationToken = "";
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

      const { data: inserted, error } = await supabaseAdmin
        .from("appointments")
        .insert(record)
        .select("id")
        .single();

      if (!error && inserted) {
        dbSaved = true;
        appointmentId = inserted.id;

        // Generate cancellation and confirmation tokens
        const { generateAppointmentToken } = await import("@/lib/cancellation");
        cancellationToken = generateAppointmentToken(appointmentId);
        confirmationToken = generateAppointmentToken(appointmentId);

        console.log("[saveAppointmentAndNotify] Appointment saved, ID:", appointmentId);
      } else if (error.code === "23505") {
        // Unique violation (unique_active_appointment_slot)
        throw new Error("Este horário acabou de ser reservado. Por favor, escolha outro.");
      } else {
        console.warn("[saveAppointmentAndNotify] Admin insert error:", error?.message);
        throw new Error(`Erro ao salvar: ${error?.message}`);
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes("horário")) throw e;
      console.error("[saveAppointmentAndNotify] Admin client error:", e);
      throw new Error("Serviço indisponível. Tente novamente ou agende via WhatsApp.");
    }

    // 2. Fallback: try anon client if admin failed
    if (!dbSaved) {
      try {
        const { createClient } = await import("@supabase/supabase-js");
        const url = process.env.SUPABASE_URL!;
        const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
        if (url && key) {
          const client = createClient(url, key);
          const { error } = await client.from("appointments").insert(record);
          if (!error) dbSaved = true;
          else console.warn("[saveAppointmentAndNotify] Anon insert warning:", error.message);
        }
      } catch (e) {
        console.warn("[saveAppointmentAndNotify] Anon client warning:", e);
      }
    }

    // 3. Email notification via Formspree
    const cancellationLink = cancellationToken
      ? `https://dramichelletiago.com.br/cancelar/${cancellationToken}`
      : "";
    const confirmationLink = confirmationToken
      ? `https://dramichelletiago.com.br/confirmar/${confirmationToken}`
      : "";

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
      `✅ Salvo no banco: ${dbSaved ? "Sim" : "Não"}\n\n` +
      (confirmationLink ? `✅ Link de confirmação: ${confirmationLink}\n` : "") +
      (cancellationLink ? `🔗 Link de cancelamento: ${cancellationLink}` : "");

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
          confirmationLink,
          cancellationLink,
        }),
      });
      console.log("[saveAppointmentAndNotify] Email sent for", data.protocol);
    } catch (e) {
      console.warn("[saveAppointmentAndNotify] Email warning:", e);
    }

    // 4. Google Calendar via Apps Script (with secret token)
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

    // 5. Envia WhatsApp para o PACIENTE com link de confirmação/cancelamento
    if (dbSaved && appointmentId) {
      try {
        // Busca template configurado (ou usa default)
        const template = await getMessageTemplate({ data: "booking_confirmation" });
        
        // Format date for template
        const [year, month, day] = data.appointmentDate.split("-");
        const dateFormatted = `${day}/${month}/${year}`;

        const templateVars = {
          patient_name: data.patientName,
          patient_phone: data.patientPhone,
          patient_email: data.patientEmail,
          appointment_date: data.appointmentDate,
          appointment_time: data.appointmentTime,
          appointment_date_formatted: dateFormatted,
          service_name: data.serviceName,
          protocol: data.protocol,
          confirmation_link: confirmationLink,
          cancellation_link: cancellationLink,
          clinic_name: CLINIC.name,
          clinic_short_name: CLINIC.shortName,
          clinic_phone: CLINIC.phone,
          clinic_address: CLINIC.address,
          clinic_whatsapp: CLINIC.whatsapp,
          clinic_whatsapp_link: `https://wa.me/${CLINIC.whatsapp}`,
          notes: data.notes || "Nenhuma",
          dentist_name: CLINIC.shortName,
        };

        const message = template 
          ? renderTemplate(template.body, templateVars)
          : `Olá, ${data.patientName}! 😊

Recebemos sua solicitação de agendamento:

📅 ${dateFormatted} às ${data.appointmentTime}
🩺 ${data.serviceName}
📌 Protocolo: ${data.protocol}

✅ Para CONFIRMAR sua consulta:
${confirmationLink}

❌ Para CANCELAR:
${cancellationLink}

Aguardamos você! 🦷

— ${CLINIC.shortName}`;

        const patientPhone = data.patientPhone.replace(/\D/g, "");
        const fullPhone = patientPhone.length > 11 ? patientPhone : `55${patientPhone}`;
        const waUrl = `https://wa.me/${fullPhone}?text=${encodeURIComponent(message)}`;
        
        // Fire and forget - don't await
        fetch(waUrl).catch(() => {});
        console.log("[saveAppointmentAndNotify] Patient WhatsApp sent for", data.protocol);
      } catch (e) {
        console.warn("[saveAppointmentAndNotify] Patient WhatsApp warning:", e);
      }
    }

    return { success: true, dbSaved, protocol: data.protocol };
  });