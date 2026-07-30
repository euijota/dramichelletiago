import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { claimAdminIfUnclaimed } from "@/lib/admin.functions";
import { useSession } from "@/hooks/useSession";
import { Logo } from "@/components/Logo";
import {
  CLINIC,
  STATUS_LABELS,
  addDays,
  buildTimeSlots,
  formatLongDate,
  formatShortDate,
  startOfWeek,
  weekdayOf,
  toISODate,
  trimSeconds,
} from "@/lib/clinic";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/painel")({
  head: () => ({
    meta: [
      { title: "Painel da agenda — Dra. Michelle Barbosa Tiago" },
      {
        name: "description",
        content:
          "Painel interno de gestão da agenda, pacientes e confirmações do consultório da Dra. Michelle Barbosa Tiago.",
      },
      { property: "og:title", content: "Painel da agenda — Dra. Michelle Tiago" },
      {
        property: "og:description",
        content: "Painel interno de gestão da agenda e confirmações.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Painel,
});

type Appointment = {
  id: string;
  patient_name: string;
  patient_email: string;
  patient_phone: string;
  service_name: string;
  appointment_date: string;
  appointment_time: string;
  status: "pending" | "confirmed" | "cancelled" | "completed";
  notes: string | null;
  reminder_sent_at: string | null;
};

const APPOINTMENT_FIELDS =
  "id, patient_name, patient_email, patient_phone, service_name, appointment_date, appointment_time, status, notes, reminder_sent_at";

const DAY_NAMES = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const statusTone: Record<Appointment["status"], string> = {
  pending: "border-warning/40 bg-warning/10 text-warning-foreground",
  confirmed: "border-success/40 bg-success/10 text-success",
  cancelled: "border-border bg-muted text-muted-foreground",
  completed: "border-primary/30 bg-accent text-accent-foreground",
};

function Painel() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session, isAdmin, loading } = useSession();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [claimChecked, setClaimChecked] = useState(false);

  // Bootstrap: the first person to reach the panel becomes the administrator.
  useEffect(() => {
    if (loading || isAdmin || claimChecked || !session) return;
    setClaimChecked(true);
    claimAdminIfUnclaimed()
      .then((res) => {
        if (res.granted) {
          toast.success("Acesso de administradora concedido.");
          queryClient.invalidateQueries();
          window.location.reload();
        }
      })
      .catch(() => undefined);
  }, [loading, isAdmin, claimChecked, session, queryClient]);

  const weekDays = useMemo(
    () => Array.from({ length: 6 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );
  const rangeStart = toISODate(weekDays[0]);
  const rangeEnd = toISODate(weekDays[5]);

  const { data: weekAppointments } = useQuery({
    queryKey: ["appointments", rangeStart, rangeEnd],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select(APPOINTMENT_FIELDS)
        .gte("appointment_date", rangeStart)
        .lte("appointment_date", rangeEnd)
        .order("appointment_time");
      if (error) throw error;
      return data as Appointment[];
    },
  });

  const { data: pending } = useQuery({
    queryKey: ["appointments", "pending"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select(APPOINTMENT_FIELDS)
        .eq("status", "pending")
        .order("appointment_date")
        .limit(20);
      if (error) throw error;
      return data as Appointment[];
    },
  });

  const tomorrowISO = toISODate(addDays(new Date(), 1));

  const { data: reminders } = useQuery({
    queryKey: ["appointments", "reminders", tomorrowISO],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select(APPOINTMENT_FIELDS)
        .eq("appointment_date", tomorrowISO)
        .in("status", ["pending", "confirmed"])
        .order("appointment_time");
      if (error) throw error;
      return data as Appointment[];
    },
  });

  async function markReminderSent(appointment: Appointment) {
    const { error } = await supabase
      .from("appointments")
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq("id", appointment.id);
    if (error) {
      toast.error("Não foi possível registrar o lembrete.");
      return;
    }
    toast.success(`Lembrete registrado para ${appointment.patient_name}.`);
    queryClient.invalidateQueries({ queryKey: ["appointments"] });
  }


  async function updateAppointment(id: string, patch: Partial<Appointment>) {
    const { error } = await supabase.from("appointments").update(patch).eq("id", id);
    if (error) {
      toast.error("Não foi possível salvar a alteração.");
      return;
    }
    toast.success("Agenda atualizada.");
    setSelected(null);
    queryClient.invalidateQueries({ queryKey: ["appointments"] });
  }

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const todayISO = toISODate(new Date());
  const todayCount =
    weekAppointments?.filter(
      (a) => a.appointment_date === todayISO && a.status !== "cancelled",
    ).length ?? 0;
  const confirmedCount =
    weekAppointments?.filter((a) => a.status === "confirmed").length ?? 0;
  const pendingCount = pending?.length ?? 0;

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <p className="text-kicker text-muted-foreground">Carregando…</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="grid min-h-screen place-items-center bg-gradient-blush px-6">
        <div className="max-w-md rounded-3xl bg-card p-10 text-center shadow-bloom">
          <h1 className="font-display text-3xl text-foreground">
            Acesso não autorizado
          </h1>
          <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
            Sua conta não tem permissão para ver a agenda do consultório. Fale com
            a Dra. Michelle para liberar o acesso.
          </p>
          <button
            onClick={handleSignOut}
            className="mt-9 rounded-full border border-border px-8 py-3.5 text-kicker text-foreground transition-silk hover:bg-accent"
          >
            Sair
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6">
          <Link to="/">
            <Logo />
          </Link>
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="hidden rounded-full border border-border px-5 py-2.5 text-kicker text-foreground transition-silk hover:bg-accent sm:inline-flex"
            >
              Ver site
            </Link>
            <button
              onClick={handleSignOut}
              className="rounded-full bg-primary px-5 py-2.5 text-kicker text-primary-foreground transition-silk hover:bg-primary-deep"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-12">
        <p className="text-kicker text-primary-soft">Painel da agenda</p>
        <h1 className="mt-5 font-display text-4xl text-foreground lg:text-5xl">
          Bem-vinda, <span className="font-script text-primary">Dra. Michelle</span>
        </h1>

        {/* Stats */}
        <div className="mt-12 grid gap-5 sm:grid-cols-3">
          {[
            { label: "Consultas hoje", value: todayCount },
            { label: "Confirmadas na semana", value: confirmedCount },
            { label: "Aguardando confirmação", value: pendingCount },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-border bg-card p-7 shadow-petal"
            >
              <p className="text-kicker text-muted-foreground">{stat.label}</p>
              <p className="mt-4 font-display text-5xl text-primary">
                {stat.value}
              </p>
            </div>
          ))}
        </div>

        {/* Week navigation */}
        <div className="mt-16 flex flex-wrap items-center justify-between gap-4">
          <h2 className="font-display text-3xl text-foreground">
            {formatShortDate(rangeStart)} – {formatShortDate(rangeEnd)}
          </h2>
          <div className="flex gap-2">
            <button
              onClick={() => setWeekStart(addDays(weekStart, -7))}
              className="rounded-full border border-border px-5 py-2.5 text-kicker text-foreground transition-silk hover:bg-accent"
            >
              Semana anterior
            </button>
            <button
              onClick={() => setWeekStart(startOfWeek(new Date()))}
              className="rounded-full border border-border px-5 py-2.5 text-kicker text-foreground transition-silk hover:bg-accent"
            >
              Hoje
            </button>
            <button
              onClick={() => setWeekStart(addDays(weekStart, 7))}
              className="rounded-full border border-border px-5 py-2.5 text-kicker text-foreground transition-silk hover:bg-accent"
            >
              Próxima semana
            </button>
          </div>
        </div>

        {/* Weekly calendar */}
        <div className="mt-8 overflow-x-auto rounded-2xl border border-border bg-card shadow-petal">
          <div className="grid min-w-[880px] grid-cols-6 divide-x divide-border">
            {weekDays.map((day, index) => {
              const iso = toISODate(day);
              const isToday = iso === todayISO;
              const dayAppointments =
                weekAppointments?.filter((a) => a.appointment_date === iso) ?? [];

              return (
                <div key={iso} className="min-h-[420px] p-4">
                  <div
                    className={cn(
                      "flex items-baseline justify-between pb-4",
                      isToday && "text-primary",
                    )}
                  >
                    <span className="text-kicker">{DAY_NAMES[index]}</span>
                    <span className="font-display text-2xl">
                      {String(day.getDate()).padStart(2, "0")}
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {dayAppointments.length === 0 && (
                      <p className="pt-8 text-center text-xs text-muted-foreground/60">
                        Sem consultas
                      </p>
                    )}
                    {dayAppointments.map((appointment) => (
                      <button
                        key={appointment.id}
                        onClick={() => setSelected(appointment)}
                        className={cn(
                          "w-full rounded-lg border-l-2 border-y border-r p-3 text-left transition-silk hover:shadow-petal",
                          statusTone[appointment.status],
                        )}
                      >
                        <span className="block text-xs font-medium">
                          {trimSeconds(appointment.appointment_time)}
                        </span>
                        <span className="mt-1 block truncate text-sm text-foreground">
                          {appointment.patient_name}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {appointment.service_name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Reminders for tomorrow */}
        <section className="mt-20">
          <h2 className="font-display text-3xl text-foreground">
            Lembretes de amanhã
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            {formatLongDate(tomorrowISO)} · a mensagem já vai pronta pelo
            WhatsApp e o envio fica registrado aqui.
          </p>

          <div className="mt-8 divide-y divide-border rounded-2xl border border-border bg-card shadow-petal">
            {(reminders?.length ?? 0) === 0 && (
              <p className="p-10 text-center text-sm text-muted-foreground">
                Nenhuma consulta marcada para amanhã.
              </p>
            )}
            {reminders?.map((appointment) => (
              <div
                key={appointment.id}
                className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-display text-2xl text-foreground">
                    {appointment.patient_name}
                  </p>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    {appointment.service_name} às{" "}
                    {trimSeconds(appointment.appointment_time)} ·{" "}
                    {STATUS_LABELS[appointment.status]}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground/80">
                    {appointment.reminder_sent_at
                      ? "Lembrete já enviado"
                      : "Lembrete pendente"}{" "}
                    · {appointment.patient_phone}
                  </p>
                </div>

                <a
                  href={buildReminderLink(appointment)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => markReminderSent(appointment)}
                  className={cn(
                    "rounded-full px-5 py-2.5 text-kicker transition-silk",
                    appointment.reminder_sent_at
                      ? "border border-border text-foreground hover:bg-accent"
                      : "bg-primary text-primary-foreground hover:bg-primary-deep",
                  )}
                >
                  {appointment.reminder_sent_at
                    ? "Enviar novamente"
                    : "Enviar lembrete"}
                </a>
              </div>
            ))}
          </div>
        </section>

        {/* Pending queue */}

        <section className="mt-20">
          <h2 className="font-display text-3xl text-foreground">
            Aguardando confirmação
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Confirme o horário e avise o paciente pelo WhatsApp em um clique.
          </p>

          <div className="mt-8 divide-y divide-border rounded-2xl border border-border bg-card shadow-petal">
            {pendingCount === 0 && (
              <p className="p-10 text-center text-sm text-muted-foreground">
                Nenhum pedido pendente. Tudo em dia.
              </p>
            )}
            {pending?.map((appointment) => (
              <div
                key={appointment.id}
                className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-display text-2xl text-foreground">
                    {appointment.patient_name}
                  </p>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    {appointment.service_name} ·{" "}
                    {formatLongDate(appointment.appointment_date)} às{" "}
                    {trimSeconds(appointment.appointment_time)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground/80">
                    {appointment.patient_phone} · {appointment.patient_email}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() =>
                      updateAppointment(appointment.id, { status: "confirmed" })
                    }
                    className="rounded-full bg-primary px-5 py-2.5 text-kicker text-primary-foreground transition-silk hover:bg-primary-deep"
                  >
                    Confirmar
                  </button>
                  <a
                    href={buildWhatsAppLink(appointment)}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-border px-5 py-2.5 text-kicker text-foreground transition-silk hover:bg-accent"
                  >
                    Avisar
                  </a>
                  <button
                    onClick={() =>
                      updateAppointment(appointment.id, { status: "cancelled" })
                    }
                    className="rounded-full border border-border px-5 py-2.5 text-kicker text-muted-foreground transition-silk hover:text-destructive"
                  >
                    Recusar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      {selected && (
        <AppointmentSheet
          appointment={selected}
          onClose={() => setSelected(null)}
          onSave={updateAppointment}
        />
      )}
    </div>
  );
}

function whatsappNumber(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.length > 11 ? digits : `55${digits}`;
}

function buildReminderLink(appointment: Appointment) {
  const message = `Olá, ${appointment.patient_name}! Passando para lembrar da sua consulta de ${appointment.service_name} com a ${CLINIC.shortName} amanhã, ${formatLongDate(appointment.appointment_date)}, às ${trimSeconds(appointment.appointment_time)}. Endereço: ${CLINIC.address}. Se precisar remarcar, é só responder por aqui.`;
  return `https://wa.me/${whatsappNumber(appointment.patient_phone)}?text=${encodeURIComponent(message)}`;
}

function buildWhatsAppLink(appointment: Appointment) {
  const message = `Olá, ${appointment.patient_name}! Aqui é do consultório da ${CLINIC.shortName}. Sua consulta de ${appointment.service_name} está confirmada para ${formatLongDate(appointment.appointment_date)} às ${trimSeconds(appointment.appointment_time)}. Até lá!`;
  return `https://wa.me/${whatsappNumber(appointment.patient_phone)}?text=${encodeURIComponent(message)}`;
}

function AppointmentSheet({
  appointment,
  onClose,
  onSave,
}: {
  appointment: Appointment;
  onClose: () => void;
  onSave: (id: string, patch: Partial<Appointment>) => void;
}) {
  const [date, setDate] = useState(appointment.appointment_date);
  const [time, setTime] = useState(trimSeconds(appointment.appointment_time));
  const slots = buildTimeSlots(weekdayOf(date));

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-primary-deep/40 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-card p-9 shadow-bloom sm:rounded-3xl"
      >
        <p className="text-kicker text-primary-soft">
          {STATUS_LABELS[appointment.status]}
        </p>
        <h2 className="mt-4 font-display text-3xl text-foreground">
          {appointment.patient_name}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {appointment.service_name}
        </p>

        <dl className="mt-8 space-y-3 border-y border-border py-7 text-sm">
          <div className="flex justify-between gap-6">
            <dt className="text-muted-foreground">Telefone</dt>
            <dd className="text-foreground">{appointment.patient_phone}</dd>
          </div>
          <div className="flex justify-between gap-6">
            <dt className="text-muted-foreground">E-mail</dt>
            <dd className="truncate text-foreground">{appointment.patient_email}</dd>
          </div>
          {appointment.notes && (
            <div className="pt-2">
              <dt className="text-muted-foreground">Observações</dt>
              <dd className="mt-2 leading-relaxed text-foreground">
                {appointment.notes}
              </dd>
            </div>
          )}
        </dl>

        <div className="mt-8 space-y-4">
          <p className="text-kicker text-primary-soft">Remarcar</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Nova data"
              className="w-full rounded-lg border border-input bg-background px-4 py-3 text-sm text-foreground outline-none focus:border-primary"
            />
            <select
              value={time}
              onChange={(e) => setTime(e.target.value)}
              aria-label="Novo horário"
              className="w-full rounded-lg border border-input bg-background px-4 py-3 text-sm text-foreground outline-none focus:border-primary"
            >
              {slots.map((slot) => (
                <option key={slot} value={slot}>
                  {slot}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-9 flex flex-wrap gap-2.5">
          <button
            onClick={() =>
              onSave(appointment.id, {
                appointment_date: date,
                appointment_time: time,
                status: "confirmed",
              })
            }
            className="rounded-full bg-primary px-6 py-3 text-kicker text-primary-foreground transition-silk hover:bg-primary-deep"
          >
            Salvar e confirmar
          </button>
          <a
            href={buildWhatsAppLink({ ...appointment, appointment_date: date, appointment_time: time })}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-border px-6 py-3 text-kicker text-foreground transition-silk hover:bg-accent"
          >
            WhatsApp
          </a>
          <button
            onClick={() => onSave(appointment.id, { status: "completed" })}
            className="rounded-full border border-border px-6 py-3 text-kicker text-foreground transition-silk hover:bg-accent"
          >
            Concluída
          </button>
          <button
            onClick={() => onSave(appointment.id, { status: "cancelled" })}
            className="rounded-full border border-border px-6 py-3 text-kicker text-muted-foreground transition-silk hover:text-destructive"
          >
            Cancelar
          </button>
        </div>

        <button
          onClick={onClose}
          className="mt-7 w-full text-center text-sm text-muted-foreground transition-silk hover:text-primary"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}
