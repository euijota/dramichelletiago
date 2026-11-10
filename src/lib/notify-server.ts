import { createServerFn } from "@tanstack/react-start";
import { CLINIC } from "@/lib/clinic";
import { renderTemplate } from "@/lib/message-templates";
import { getMessageTemplate } from "@/lib/message-templates-server";
import { bookingSchema, type BookingPayload } from "@/lib/booking";
import {
  buildGoogleCalendarRequest,
  parseGoogleCalendarResponse,
} from "@/lib/google-calendar-request";

const APPS_SCRIPT_SECRET = process.env.GOOGLE_APPS_SCRIPT_SECRET;
const APPS_SCRIPT_URL = process.env.GOOGLE_APPS_SCRIPT_URL;

if (!APPS_SCRIPT_SECRET || !APPS_SCRIPT_URL) {
  console.warn("[notify-server] Google Calendar integration is not fully configured");
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

/** Salva o agendamento e envia notificação para a Dra. Michelle. */
export const saveAppointmentAndNotify = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const parsed = bookingSchema.safeParse(data);
    if (!parsed.success) {
      throw new Error(parsed.error.errors.map((e) => e.message).join(", "));
    }
    return parsed.data;
  })
  .handler(async (ctx) => {
    const data = ctx.data;

    // Rate limiting by IP
    const request = await import("@tanstack/react-start/server").then((m) => m.getRequest());
    const ip =
      request?.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request?.headers?.get("x-real-ip") ||
      "unknown";

    const rl = checkRateLimit(ip);
    if (!rl.allowed) {
      throw new Error(
        `Muitas tentativas. Tente novamente em ${Math.ceil((rl.retryAfterMs || 60000) / 1000)}s.`,
      );
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
    let patientId: string | null = null;
    let cancellationToken = "";
    let confirmationToken = "";
    let anamnesisToken = "";
    let durationMinutes = 60;

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      // Auto-link appointment to public.patients
      try {
        const cleanPhone = (data.patientPhone || "").replace(/\D/g, "");
        let matchedPatient: {
          id: string;
          name: string;
          phone: string | null;
          email: string | null;
        } | null = null;

        // Try lookup by phone (last 8 digits)
        if (cleanPhone.length >= 8) {
          const last8 = cleanPhone.slice(-8);
          const { data: pByPhone } = await supabaseAdmin
            .from("patients")
            .select("id, name, phone, email")
            .ilike("phone", `%${last8}%`)
            .limit(1)
            .maybeSingle();
          if (pByPhone) matchedPatient = pByPhone;
        }

        // Try lookup by exact/ilike name if not matched by phone
        if (!matchedPatient && data.patientName) {
          const { data: pByName } = await supabaseAdmin
            .from("patients")
            .select("id, name, phone, email")
            .ilike("name", data.patientName.trim())
            .limit(1)
            .maybeSingle();
          if (pByName) matchedPatient = pByName;
        }

        if (matchedPatient) {
          patientId = matchedPatient.id;
          const updates: { email?: string; phone?: string } = {};
          if (!matchedPatient.email && data.patientEmail) {
            updates.email = data.patientEmail.trim();
          }
          if (!matchedPatient.phone && data.patientPhone) {
            updates.phone = data.patientPhone.trim();
          }
          if (Object.keys(updates).length > 0) {
            await supabaseAdmin.from("patients").update(updates).eq("id", patientId);
          }
        } else {
          // Create patient record automatically
          const insurance = data.serviceName.toLowerCase().includes("plano")
            ? data.serviceName.replace(/plano:?/i, "").trim()
            : "Particular";

          const { data: createdPatient, error: createErr } = await supabaseAdmin
            .from("patients")
            .insert({
              name: data.patientName.trim(),
              phone: data.patientPhone.trim() || null,
              email: data.patientEmail?.trim() || null,
              insurance: insurance || "Particular",
              origin: "Agendamento Online",
              notes: data.notes?.trim() || null,
            })
            .select("id")
            .single();

          if (!createErr && createdPatient) {
            patientId = createdPatient.id;
            console.log("[saveAppointmentAndNotify] New patient auto-created:", patientId);
          }
        }
      } catch (err) {
        console.warn("[saveAppointmentAndNotify] Patient auto-linking warning:", err);
      }

      if (patientId) {
        (record as any).patient_id = patientId;
      }

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
        cancellationToken = generateAppointmentToken(appointmentId, "cancel");
        confirmationToken = generateAppointmentToken(appointmentId, "confirm");

        // Generate cryptographically signed anamnesis token
        if (patientId) {
          const { generateAnamnesisToken } = await import("@/lib/anamnesis-server");
          anamnesisToken = generateAnamnesisToken({
            patientId,
            appointmentId,
            protocol: data.protocol,
          });
        }

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

    // 3. Email notification (FormSubmit + Formspree + optional Resend / Webhook)
    const cancellationLink = cancellationToken
      ? `https://dramichelletiago.com.br/cancelar/${cancellationToken}`
      : "";
    const confirmationLink = confirmationToken
      ? `https://dramichelletiago.com.br/confirmar/${confirmationToken}`
      : "";

    const [yyyy, mm, dd] = data.appointmentDate.split("-");
    const dateFormattedBr = `${dd}/${mm}/${yyyy}`;
    const timeShort = data.appointmentTime.slice(0, 5);

    const messageText =
      `📌 NOVO AGENDAMENTO ONLINE RECEBIDO\n\n` +
      `Protocolo: ${data.protocol}\n` +
      `Paciente: ${data.patientName}\n` +
      `WhatsApp: ${data.patientPhone}\n` +
      `E-mail: ${data.patientEmail || "Não informado"}\n` +
      `Data: ${dateFormattedBr} às ${timeShort}\n` +
      `Serviço: ${data.serviceName}\n` +
      `Duração: ${durationMinutes} min\n` +
      `Observações: ${data.notes || "Nenhuma"}\n\n` +
      `🔗 Painel da Clínica: https://dramichelletiago.com.br/painel\n` +
      (confirmationLink ? `✅ Confirmar consulta: ${confirmationLink}\n` : "") +
      (cancellationLink ? `❌ Cancelar consulta: ${cancellationLink}` : "");

    const emailSubject = `🦷 [Novo Agendamento] ${data.patientName} — ${dateFormattedBr} às ${timeShort}`;

    // 3a. Direct email to dramichellebarbosatiago@gmail.com via FormSubmit AJAX
    try {
      await fetch(`https://formsubmit.co/ajax/${CLINIC.email}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Origin: "https://dramichelletiago.com.br",
          Referer: "https://dramichelletiago.com.br/agendar",
        },
        body: JSON.stringify({
          _subject: emailSubject,
          _template: "table",
          _captcha: "false",
          Protocolo: data.protocol,
          Paciente: data.patientName,
          WhatsApp: data.patientPhone,
          Email_Paciente: data.patientEmail || "Não informado",
          Data_e_Horario: `${dateFormattedBr} às ${timeShort}`,
          Atendimento: data.serviceName,
          Observacoes: data.notes || "Nenhuma",
          Painel_Clinica: "https://dramichelletiago.com.br/painel",
          Link_Confirmacao: confirmationLink,
        }),
      });
    } catch (e) {
      console.warn("[saveAppointmentAndNotify] FormSubmit email warning:", e);
    }

    // 3b. Optional Resend API if RESEND_API_KEY is configured in environment
    if (process.env.RESEND_API_KEY) {
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Agenda Dra. Michelle <onboarding@resend.dev>",
            to: [CLINIC.email],
            subject: emailSubject,
            text: messageText,
          }),
        });
      } catch (e) {
        console.warn("[saveAppointmentAndNotify] Resend email warning:", e);
      }
    }

    // 3c. Optional WhatsApp Webhook / Evolution API / Z-API if WHATSAPP_WEBHOOK_URL is configured
    if (process.env.WHATSAPP_WEBHOOK_URL) {
      try {
        await fetch(process.env.WHATSAPP_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: CLINIC.whatsapp,
            text: messageText,
            protocol: data.protocol,
            patientName: data.patientName,
            patientPhone: data.patientPhone,
            appointmentDate: dateFormattedBr,
            appointmentTime: timeShort,
            serviceName: data.serviceName,
          }),
        });
      } catch (e) {
        console.warn("[saveAppointmentAndNotify] WhatsApp webhook warning:", e);
      }
    }

    // 3d. Formspree fallback
    try {
      await fetch("https://formspree.io/f/xbjnqpyz", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          _replyto: data.patientEmail || "noreply@site.com",
          subject: emailSubject,
          message: messageText,
          protocol: data.protocol,
          patientName: data.patientName,
          patientPhone: data.patientPhone,
          confirmationLink,
          cancellationLink,
        }),
      });
      console.log("[saveAppointmentAndNotify] Email notification dispatched for", data.protocol);
    } catch (e) {
      console.warn("[saveAppointmentAndNotify] Email warning:", e);
    }

    // 4. Google Calendar via Apps Script (optional background sync if configured)
    if (APPS_SCRIPT_SECRET && APPS_SCRIPT_URL && APPS_SCRIPT_URL.startsWith("http")) {
      try {
        const [hh, mm] = data.appointmentTime.split(":").map(Number);
        const pad = (n: number) => String(n).padStart(2, "0");
        const startStr = `${data.appointmentDate}T${pad(hh)}:${pad(mm)}:00`;
        const endMinutes = hh * 60 + mm + durationMinutes;
        const endHh = Math.floor(endMinutes / 60) % 24;
        const endMm = endMinutes % 60;
        const endStr = `${data.appointmentDate}T${pad(endHh)}:${pad(endMm)}:00`;

        const desc = `Protocolo: ${data.protocol}\nTelefone: ${data.patientPhone}\nServiço: ${data.serviceName}\nDuração: ${durationMinutes} min\nObs: ${data.notes || "Nenhuma"}`;

        const calendarRequest = buildGoogleCalendarRequest(APPS_SCRIPT_URL, APPS_SCRIPT_SECRET, {
          title: `🦷 ${data.patientName}`,
          description: desc,
          start: startStr,
          end: endStr,
          protocol: data.protocol,
        });

        const res = await fetch(calendarRequest.url, calendarRequest.init);
        const text = await res.text();
        if (!res.ok) {
          throw new Error(`Google Calendar request failed: ${res.status}`);
        }
        const calendarResult = parseGoogleCalendarResponse(text);
        console.log("[saveAppointmentAndNotify] Google Calendar synced", {
          duplicate: calendarResult.duplicate === true,
        });
      } catch (e) {
        console.warn("[saveAppointmentAndNotify] Google Calendar warning:", e);
      }
    } else {
      console.warn("[saveAppointmentAndNotify] Google Calendar is not configured, skipping sync");
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
          patient_email: data.patientEmail ?? "",
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

    return {
      success: true,
      dbSaved,
      protocol: data.protocol,
      patientId,
      appointmentId,
      confirmationToken,
      cancellationToken,
      anamnesisToken,
    };
  });
