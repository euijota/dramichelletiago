import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { Logo } from "@/components/Logo";
import { ExportModal } from "@/components/ExportModal";
import { fetchICalFeed } from "@/lib/ical-server";
import {
  CLINIC,
  STATUS_LABELS,
  addDays,
  buildTimeSlots,
  buildGoogleCalendarUrl,
  formatLongDate,
  formatShortDate,
  startOfWeek,
  weekdayOf,
  toISODate,
  trimSeconds,
  type ICSEvent,
} from "@/lib/clinic";
import { buildWhatsAppReminderUrl } from "@/lib/reminders";
import { cn } from "@/lib/utils";
import type { AppointmentExport } from "@/lib/export";
import {
  listMessageTemplates,
  createMessageTemplate,
  updateMessageTemplate,
  deleteMessageTemplate,
  initializeDefaultTemplates,
} from "@/lib/message-templates-server";
import type { MessageTemplate, TemplateType } from "@/lib/message-templates";
import {
  MessageSquare,
  Plus,
  Edit,
  Trash2,
  Check,
  X,
  Eye,
  Copy,
  Settings,
  Send,
  Bell,
  MessageCircle,
  RotateCcw,
} from "lucide-react";

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
  patient_email: string | null;
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
  const [selectedGoogle, setSelectedGoogle] = useState<ICSEvent | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);

  const weekDays = useMemo(
    () => Array.from({ length: 6 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );
  const rangeStart = toISODate(weekDays[0]);
  const rangeEnd = toISODate(weekDays[5]);

  const { data: weekAppointments } = useQuery({
    queryKey: ["appointments", rangeStart, rangeEnd],
    enabled: !!session,
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

  const { data: googleEvents = [] } = useQuery({
    queryKey: ["googleAgendaFeed"],
    enabled: !!session,
    queryFn: async () => {
      try {
        return await fetchICalFeed();
      } catch (e) {
        console.error("Google Agenda iCal fetch failed:", e);
        return [];
      }
    },
    staleTime: 0,
    refetchInterval: 60000,
  });

  const { data: pending } = useQuery({
    queryKey: ["appointments", "pending"],
    enabled: !!session,
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

  const { data: allAppointments } = useQuery({
    queryKey: ["appointments", "all"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select(`${APPOINTMENT_FIELDS}, created_at`)
        .order("appointment_date", { ascending: false });
      if (error) throw error;
      return data as AppointmentExport[];
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
  const supaToday = weekAppointments?.filter((a) => a.appointment_date === todayISO && a.status !== "cancelled").length ?? 0;
  const googleToday = googleEvents.filter((g) => g.date === todayISO).length;
  const todayCount = supaToday + googleToday;

  const supaConfirmedWeek = weekAppointments?.filter((a) => a.status === "confirmed").length ?? 0;
  const googleWeekCount = googleEvents.filter((g) => g.date >= rangeStart && g.date <= rangeEnd).length;
  const confirmedCount = supaConfirmedWeek + googleWeekCount;

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
          <h1 className="font-display text-3xl text-foreground">Acesso não autorizado</h1>
          <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
            Sua conta não tem permissão para ver a agenda do consultório. Fale com a Dra. Michelle
            para liberar o acesso.
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
            <button
              onClick={() => setShowExportModal(true)}
              className="hidden rounded-full border border-primary/30 bg-primary/10 px-5 py-2.5 text-kicker text-primary transition-silk hover:bg-primary/20 sm:inline-flex items-center gap-1.5"
            >
              📊 Exportar
            </button>
            <a
              href="https://calendar.google.com"
              target="_blank"
              rel="noreferrer"
              className="hidden rounded-full border border-emerald-600/30 bg-emerald-500/10 px-5 py-2.5 text-kicker text-emerald-800 dark:text-emerald-300 transition-silk hover:bg-emerald-500/20 sm:inline-flex items-center gap-1.5"
            >
              📅 Google Agenda
            </a>
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
              <p className="mt-4 font-display text-5xl text-primary">{stat.value}</p>
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
              const supaAppointments =
                weekAppointments?.filter((a) => a.appointment_date === iso) ?? [];
              const gEvents = googleEvents.filter((g) => g.date === iso);

              const combined = [
                ...supaAppointments.map((a) => ({
                  id: a.id,
                  time: trimSeconds(a.appointment_time),
                  title: a.patient_name,
                  subtitle: a.service_name,
                  isGoogle: false,
                  status: a.status,
                  rawSupa: a,
                  rawGoogle: null,
                })),
                ...gEvents.map((g, idx) => ({
                  id: `gcal-${g.date}-${g.time}-${idx}`,
                  time: g.time,
                  title: g.summary,
                  subtitle: "Google Agenda",
                  isGoogle: true,
                  status: "confirmed" as const,
                  rawSupa: null,
                  rawGoogle: g,
                })),
              ].sort((a, b) => a.time.localeCompare(b.time));

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
                    {combined.length === 0 && (
                      <p className="pt-8 text-center text-xs text-muted-foreground/60">
                        Sem consultas
                      </p>
                    )}
                    {combined.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => {
                          if (item.rawSupa) setSelected(item.rawSupa);
                          else if (item.rawGoogle) setSelectedGoogle(item.rawGoogle);
                        }}
                        className={cn(
                          "w-full rounded-lg border-l-2 border-y border-r p-3 text-left transition-silk hover:shadow-petal hover:scale-[1.02] cursor-pointer",
                          item.isGoogle
                            ? "border-emerald-600/40 bg-emerald-500/10 text-emerald-950 dark:text-emerald-200"
                            : statusTone[item.status],
                        )}
                      >
                        <span className="block text-xs font-medium flex items-center justify-between">
                          <span>{item.time}</span>
                          {item.isGoogle && (
                            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/60 px-1.5 py-0.5 rounded">
                              Google
                            </span>
                          )}
                        </span>
                        <span className="mt-1 block truncate text-sm font-semibold text-foreground">
                          {item.title}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {item.subtitle}
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
          <h2 className="font-display text-3xl text-foreground">Lembretes de amanhã</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            {formatLongDate(tomorrowISO)} · a mensagem já vai pronta pelo WhatsApp e o envio fica
            registrado aqui.
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
                    {appointment.service_name} às {trimSeconds(appointment.appointment_time)} ·{" "}
                    {STATUS_LABELS[appointment.status]}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground/80">
                    {appointment.reminder_sent_at ? "Lembrete já enviado" : "Lembrete pendente"} ·{" "}
                    {appointment.patient_phone}
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
                  {appointment.reminder_sent_at ? "Enviar novamente" : "Enviar lembrete"}
                </a>
              </div>
            ))}
          </div>
        </section>

        {/* Pending queue */}

        <section className="mt-20">
          <h2 className="font-display text-3xl text-foreground">Aguardando confirmação</h2>
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
                    {appointment.service_name} · {formatLongDate(appointment.appointment_date)} às{" "}
                    {trimSeconds(appointment.appointment_time)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground/80">
                    {appointment.patient_phone} · {appointment.patient_email ?? "E-mail não informado"}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => updateAppointment(appointment.id, { status: "confirmed" })}
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
                    onClick={() => updateAppointment(appointment.id, { status: "cancelled" })}
                    className="rounded-full border border-border px-5 py-2.5 text-kicker text-muted-foreground transition-silk hover:text-destructive"
                  >
                    Recusar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Message Templates */}
        <section className="mt-20">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-3xl text-foreground">Templates de Mensagens</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Gerencie mensagens automáticas enviadas aos pacientes via WhatsApp.
              </p>
            </div>
            <button
              onClick={() => {
                initializeDefaultTemplates({}).then(() => {
                  toast.success("Templates padrão inicializados");
                  queryClient.invalidateQueries({ queryKey: ["message-templates"] });
                });
              }}
              className="rounded-full border border-border px-5 py-2.5 text-kicker text-foreground transition-silk hover:bg-accent flex items-center gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Restaurar padrões
            </button>
          </div>

          <MessageTemplates queryClient={queryClient} />
        </section>

        {selected && (
          <AppointmentSheet
            appointment={selected}
            onClose={() => setSelected(null)}
            onSave={updateAppointment}
          />
        )}

        {selectedGoogle && (
          <GoogleEventSheet
            event={selectedGoogle}
            onClose={() => setSelectedGoogle(null)}
          />
        )}

        {showExportModal && allAppointments && (
          <ExportModal
            appointments={allAppointments}
            onClose={() => setShowExportModal(false)}
          />
        )}
      </main>
    </div>
  );
}

function MessageTemplates({ queryClient }: { queryClient: ReturnType<typeof useQueryClient> }) {
  const { data: templates, isLoading } = useQuery({
    queryKey: ["message-templates"],
    queryFn: async () => {
      const res = await listMessageTemplates({});
      return res as MessageTemplate[];
    },
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<MessageTemplate> & { body: string }>({
    name: "",
    channel: "whatsapp",
    subject: "",
    body: "",
    is_active: true,
  });

  const createMutation = useMutation({
    mutationFn: (data: Omit<MessageTemplate, "id" | "created_at" | "updated_at">) => createMessageTemplate({ data }),
    onSuccess: () => {
      toast.success("Template criado");
      queryClient.invalidateQueries({ queryKey: ["message-templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: (data: { id: string } & Partial<MessageTemplate>) => updateMessageTemplate({ data }),
    onSuccess: () => {
      toast.success("Template atualizado");
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ["message-templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteMessageTemplate({ data: { id } }),
    onSuccess: () => {
      toast.success("Template removido");
      queryClient.invalidateQueries({ queryKey: ["message-templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const typeLabels: Record<TemplateType, string> = {
    booking_confirmation: "Confirmação de agendamento",
    booking_confirmed: "Agendamento confirmado",
    booking_cancelled: "Agendamento cancelado",
    reminder_24h: "Lembrete 24h",
    reminder_1h: "Lembrete 1h",
    post_appointment: "Pós-consulta",
    custom: "Personalizado",
  };

  const typeIcons: Record<TemplateType, React.ReactNode> = {
    booking_confirmation: <MessageSquare className="h-4 w-4" />,
    booking_confirmed: <Check className="h-4 w-4" />,
    booking_cancelled: <X className="h-4 w-4" />,
    reminder_24h: <Bell className="h-4 w-4" />,
    reminder_1h: <Bell className="h-4 w-4" />,
    post_appointment: <MessageCircle className="h-4 w-4" />,
    custom: <Send className="h-4 w-4" />,
  };

  if (isLoading) {
    return (
      <div className="mt-8 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse rounded-xl border border-border bg-muted/50 h-24" />
        ))}
      </div>
    );
  }

  const templatesByType = templates?.reduce((acc, t) => {
    if (!acc[t.type]) acc[t.type] = [];
    acc[t.type].push(t);
    return acc;
  }, {} as Record<TemplateType, MessageTemplate[]>);

  return (
    <div className="mt-8 space-y-6">
      {Object.entries(typeLabels).map(([type, label]) => {
        const typeTemplates = templatesByType?.[type as TemplateType] ?? [];
        const hasActive = typeTemplates.some(t => t.is_active);
        
        return (
          <div key={type} className="rounded-2xl border border-border bg-card shadow-petal overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  {typeIcons[type as TemplateType]}
                </div>
                <div>
                  <h3 className="font-display text-xl text-foreground">{label}</h3>
                  <p className="text-xs text-muted-foreground">
                    {typeTemplates.length} template{typeTemplates.length !== 1 ? "s" : ""} 
                    {hasActive ? " · Ativo" : " · Inativo"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setEditForm({
                    name: `Novo ${label}`,
                    type: type as TemplateType,
                    channel: "whatsapp",
                    subject: "",
                    body: "",
                    is_active: true,
                  });
                  setEditingId("new");
                }}
                className="rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-kicker text-primary text-sm transition-silk hover:bg-primary/20 flex items-center gap-1.5"
              >
                <Plus className="h-4 w-4" />
                Adicionar
              </button>
            </div>

            <div className="divide-y divide-border p-4">
              {typeTemplates.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">
                  Nenhum template. Clique em "Adicionar" para criar.
                </p>
              ) : (
                typeTemplates.map((template) => (
                  <div key={template.id} className="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          template.is_active
                            ? "bg-success/10 text-success"
                            : "bg-muted text-muted-foreground"
                        }`}>
                          {template.is_default ? "Padrão" : "Custom"}
                        </span>
                        <span className="text-xs text-muted-foreground uppercase tracking-wide">
                          {template.channel}
                        </span>
                        {template.is_default && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-bold">
                            DEFAULT
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{template.body}</p>
                      {template.subject && (
                        <p className="mt-1 text-xs text-muted-foreground">Assunto: {template.subject}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {editingId === template.id ? (
                        <>
                          <button
                            onClick={() => {
                              updateMutation.mutate({ id: template.id, ...editForm });
                            }}
                            disabled={updateMutation.isPending}
                            className="rounded-full bg-primary px-4 py-2 text-kicker text-primary-foreground text-sm transition-silk hover:bg-primary-deep"
                          >
                            {updateMutation.isPending ? "Salvando..." : "Salvar"}
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="rounded-full border border-border px-4 py-2 text-kicker text-muted-foreground text-sm transition-silk hover:bg-accent"
                          >
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => {
                              setEditForm({
                                name: template.name,
                                channel: template.channel,
                                subject: template.subject || "",
                                body: template.body,
                                is_active: template.is_active,
                              });
                              setEditingId(template.id);
                            }}
                            className="rounded-full border border-border px-3 py-2 text-muted-foreground hover:bg-accent transition-silk"
                            aria-label="Editar"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          {!template.is_default && (
                            <button
                              onClick={() => {
                                if (confirm("Remover este template?")) {
                                  deleteMutation.mutate(template.id);
                                }
                              }}
                              disabled={deleteMutation.isPending}
                              className="rounded-full border border-border px-3 py-2 text-muted-foreground hover:bg-rose-50 hover:text-rose-600 hover:border-rose-300 transition-silk"
                              aria-label="Excluir"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}

              {editingId && (
                <div className="mt-6 p-4 rounded-xl bg-muted/50 border border-border space-y-4">
                  <h4 className="font-display text-lg text-foreground">
                    {editingId === "new" ? "Novo Template" : "Editando Template"}
                  </h4>
                  
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold">Nome</label>
                      <input
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                        placeholder="Nome do template"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold">Canal</label>
                      <select
                        value={editForm.channel}
                        onChange={(e) => setEditForm({ ...editForm, channel: e.target.value as "whatsapp" | "email" | "both" })}
                        className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                      >
                        <option value="whatsapp">WhatsApp</option>
                        <option value="email">E-mail</option>
                        <option value="both">Ambos</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold">Assunto (para e-mail)</label>
                    <input
                      value={editForm.subject || ""}
                      onChange={(e) => setEditForm({ ...editForm, subject: e.target.value })}
                      className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                      placeholder="Assunto do e-mail"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold">Corpo da mensagem</label>
                    <textarea
                      value={editForm.body}
                      onChange={(e) => setEditForm({ ...editForm, body: e.target.value })}
                      rows={6}
                      className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary font-mono text-xs"
                      placeholder="Use variáveis: {{patient_name}}, {{appointment_date_formatted}}, {{appointment_time}}, {{service_name}}, {{protocol}}, {{confirmation_link}}, {{cancellation_link}}, {{clinic_name}}, {{clinic_short_name}}, {{clinic_address}}, {{clinic_phone}}, {{clinic_whatsapp}}, {{notes}}"
                    />
                    <p className="text-xs text-muted-foreground">
                      {"Variáveis: {{patient_name}}, {{appointment_date_formatted}}, {{appointment_time}}, {{service_name}}, {{protocol}}, {{confirmation_link}}, {{cancellation_link}}, {{clinic_name}}, {{clinic_short_name}}, {{clinic_address}}, {{clinic_phone}}, {{clinic_whatsapp}}, {{notes}}"}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={editForm.is_active}
                        onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
                        className="rounded border-border text-primary focus:ring-primary"
                      />
                      Ativo
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function whatsappNumber(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.length > 11 ? digits : `55${digits}`;
}

function buildReminderLink(appointment: Appointment) {
  return buildWhatsAppReminderUrl(appointment.patient_phone, {
    patientName: appointment.patient_name,
    appointmentDate: appointment.appointment_date,
    appointmentTime: trimSeconds(appointment.appointment_time),
    serviceName: appointment.service_name,
  });
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
        <p className="text-kicker text-primary-soft">{STATUS_LABELS[appointment.status]}</p>
        <h2 className="mt-4 font-display text-3xl text-foreground">{appointment.patient_name}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{appointment.service_name}</p>

        <dl className="mt-8 space-y-3 border-y border-border py-7 text-sm">
          <div className="flex justify-between gap-6">
            <dt className="text-muted-foreground">Telefone</dt>
            <dd className="text-foreground">{appointment.patient_phone}</dd>
          </div>
          <div className="flex justify-between gap-6">
            <dt className="text-muted-foreground">E-mail</dt>
            <dd className="truncate text-foreground">
              {appointment.patient_email ?? "Não informado"}
            </dd>
          </div>
          {appointment.notes && (
            <div className="pt-2">
              <dt className="text-muted-foreground">Observações</dt>
              <dd className="mt-2 leading-relaxed text-foreground">{appointment.notes}</dd>
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
            href={buildWhatsAppLink({
              ...appointment,
              appointment_date: date,
              appointment_time: time,
            })}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-border px-6 py-3 text-kicker text-foreground transition-silk hover:bg-accent"
          >
            WhatsApp
          </a>
          <a
            href={buildGoogleCalendarUrl(
              `Consulta Odontológica: ${appointment.patient_name}`,
              date,
              time,
              `Paciente: ${appointment.patient_name}\nTelefone: ${appointment.patient_phone}\nServiço: ${appointment.service_name}\nObservações: ${appointment.notes || "Nenhuma"}`,
            )}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-border px-6 py-3 text-kicker text-foreground transition-silk hover:bg-accent"
          >
            Google Agenda
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

function GoogleEventSheet({
  event,
  onClose,
}: {
  event: ICSEvent;
  onClose: () => void;
}) {
  const phoneMatch = (event.summary + " " + (event.description || "")).match(/(?:\(?\d{2}\)?\s*)?\d{4,5}[-\s]?\d{4}/);
  const rawPhone = phoneMatch ? phoneMatch[0] : "";
  const cleanPhone = rawPhone.replace(/\D/g, "");
  const waUrl = cleanPhone && cleanPhone.length >= 8
    ? `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(`Olá! Entrando em contato sobre o seu agendamento no consultório da Dra. Michelle Tiago marcado para ${formatLongDate(event.date)} às ${event.time}.`)}`
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-primary-deep/40 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-card p-9 shadow-bloom sm:rounded-3xl"
      >
        <span className="inline-block rounded bg-emerald-100 dark:bg-emerald-900/60 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
          📅 Google Agenda
        </span>
        <h2 className="mt-4 font-display text-3xl text-foreground">{event.summary}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {formatLongDate(event.date)} às {event.time}
        </p>

        {event.description ? (
          <div className="mt-6 border-y border-border py-6">
            <p className="text-kicker text-muted-foreground">Detalhes do Agendamento</p>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground bg-muted/30 p-4 rounded-xl border border-border">
              {event.description}
            </pre>
          </div>
        ) : (
          <p className="mt-6 border-y border-border py-6 text-sm text-muted-foreground italic">
            Sem detalhes adicionais informados.
          </p>
        )}

        <div className="mt-8 flex flex-wrap gap-2.5">
          <a
            href="https://calendar.google.com"
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-emerald-600 px-6 py-3 text-kicker text-white transition-silk hover:bg-emerald-700"
          >
            Abrir no Google Agenda
          </a>
          {waUrl && (
            <a
              href={waUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-border px-6 py-3 text-kicker text-foreground transition-silk hover:bg-accent"
            >
              Falar no WhatsApp
            </a>
          )}
          <button
            onClick={onClose}
            className="rounded-full border border-border px-6 py-3 text-kicker text-muted-foreground transition-silk hover:bg-accent"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
