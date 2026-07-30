import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { ToothMark } from "@/components/Logo";
import { supabase } from "@/integrations/supabase/client";
import {
  buildTimeSlots,
  weekdayOf,
  formatLongDate,
  toISODate,
  trimSeconds,
  CLINIC,
} from "@/lib/clinic";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/agendar")({
  head: () => ({
    meta: [
      { title: "Agendar consulta — Dra. Michelle Barbosa Tiago" },
      {
        name: "description",
        content:
          "Escolha o tratamento, a data e o horário e solicite sua consulta com a Dra. Michelle Barbosa Tiago em poucos segundos.",
      },
      { property: "og:title", content: "Agendar consulta — Dra. Michelle Tiago" },
      {
        property: "og:description",
        content:
          "Escolha o tratamento, a data e o horário e solicite sua consulta online.",
      },
    ],
  }),
  component: Agendar,
});

const TODAY = toISODate(new Date());

const fieldClass =
  "w-full rounded-lg border border-input bg-card px-4 py-3.5 text-sm text-foreground outline-none transition-silk placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-ring/25";

function Agendar() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<{ date: string; time: string } | null>(null);

  const { data: services } = useQuery({
    queryKey: ["services"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("id, name, duration_minutes")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: taken } = useQuery({
    queryKey: ["booked-times", date],
    enabled: Boolean(date),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("booked_times", { _date: date });
      if (error) throw error;
      return (data ?? []).map((row) => trimSeconds(row.appointment_time));
    },
  });

  const takenSet = new Set(taken ?? []);
  const slots = date ? buildTimeSlots(weekdayOf(date)) : [];

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!serviceId || !date || !time) {
      toast.error("Escolha o tratamento, a data e o horário.");
      return;
    }
    const service = services?.find((s) => s.id === serviceId);
    if (!service) return;

    setSaving(true);
    const { error } = await supabase.from("appointments").insert({
      patient_name: name.trim(),
      patient_email: email.trim(),
      patient_phone: phone.trim(),
      service_id: service.id,
      service_name: service.name,
      appointment_date: date,
      appointment_time: time,
      notes: notes.trim() || null,
      status: "pending",
    });
    setSaving(false);

    if (error) {
      toast.error("Não foi possível enviar o pedido. Tente novamente.");
      return;
    }
    setDone({ date, time });
  }

  if (done) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <section className="mx-auto max-w-2xl px-6 py-28 text-center">
          <ToothMark className="mx-auto h-9 text-primary" />
          <h1 className="mt-10 font-display text-4xl leading-tight text-foreground">
            Pedido enviado
          </h1>
          <p className="mt-6 text-base leading-relaxed text-muted-foreground">
            Reservamos {formatLongDate(done.date)} às {done.time} para você. A
            Dra. Michelle confirma o horário em breve e você recebe um aviso em{" "}
            <span className="text-foreground">{email}</span>.
          </p>
          <div className="mt-12 flex flex-wrap justify-center gap-4">
            <Link
              to="/"
              className="rounded-full bg-primary px-9 py-4 text-kicker text-primary-foreground transition-silk hover:bg-primary-deep"
            >
              Voltar ao início
            </Link>
            <a
              href={`https://wa.me/${CLINIC.whatsapp}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-border px-9 py-4 text-kicker text-foreground transition-silk hover:bg-accent"
            >
              Falar no WhatsApp
            </a>
          </div>
        </section>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <section className="mx-auto max-w-3xl px-6 py-20 lg:py-24">
        <p className="text-kicker text-primary-soft">Agendamento</p>
        <h1 className="mt-6 max-w-[16ch] font-display text-5xl leading-tight text-foreground lg:text-6xl">
          Reserve seu horário
        </h1>
        <p className="mt-7 max-w-[50ch] text-base leading-relaxed text-muted-foreground">
          Preencha os campos abaixo. Você recebe a confirmação assim que a Dra.
          Michelle validar o horário.
        </p>

        <form onSubmit={handleSubmit} className="mt-14 space-y-10">
          <fieldset className="space-y-5">
            <legend className="text-kicker text-primary-soft">Seus dados</legend>
            <div className="grid gap-5 sm:grid-cols-2">
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome completo"
                aria-label="Nome completo"
                className={cn(fieldClass, "sm:col-span-2")}
              />
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="E-mail"
                aria-label="E-mail"
                className={fieldClass}
              />
              <input
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Telefone / WhatsApp"
                aria-label="Telefone"
                className={fieldClass}
              />
            </div>
          </fieldset>

          <fieldset className="space-y-5">
            <legend className="text-kicker text-primary-soft">Tratamento</legend>
            <select
              required
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              aria-label="Tratamento"
              className={fieldClass}
            >
              <option value="">Selecione um tratamento</option>
              {services?.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name} · {service.duration_minutes} min
                </option>
              ))}
            </select>
          </fieldset>

          <fieldset className="space-y-5">
            <legend className="text-kicker text-primary-soft">Data e horário</legend>
            <input
              required
              type="date"
              min={TODAY}
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setTime("");
              }}
              aria-label="Data da consulta"
              className={fieldClass}
            />

            {date && slots.length === 0 && (
              <p className="text-sm text-muted-foreground">
                O consultório não atende nesta data. Escolha outro dia —
                atendemos {CLINIC.hours.toLowerCase()}.
              </p>
            )}

            {date && slots.length > 0 && (
              <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
                {slots.map((slot) => {
                  const busy = takenSet.has(slot);
                  const active = time === slot;
                  return (
                    <button
                      key={slot}
                      type="button"
                      disabled={busy}
                      onClick={() => setTime(slot)}
                      className={cn(
                        "rounded-lg border py-3 text-sm transition-silk",
                        busy &&
                          "cursor-not-allowed border-border/60 text-muted-foreground/40 line-through",
                        !busy &&
                          !active &&
                          "border-border text-foreground hover:border-primary hover:text-primary",
                        active &&
                          "border-primary bg-primary text-primary-foreground",
                      )}
                    >
                      {slot}
                    </button>
                  );
                })}
              </div>
            )}
          </fieldset>

          <fieldset className="space-y-5">
            <legend className="text-kicker text-primary-soft">
              Observações (opcional)
            </legend>
            <textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Conte o que você gostaria de tratar ou qualquer coisa que devamos saber."
              aria-label="Observações"
              className={cn(fieldClass, "resize-none")}
            />
          </fieldset>

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-full bg-primary px-9 py-4 text-kicker text-primary-foreground shadow-petal transition-silk hover:bg-primary-deep disabled:opacity-60 sm:w-auto"
          >
            {saving ? "Enviando…" : "Solicitar consulta"}
          </button>
        </form>
      </section>

      <SiteFooter />
    </div>
  );
}
