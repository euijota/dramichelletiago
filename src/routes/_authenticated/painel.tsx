import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { Logo } from "@/components/Logo";
import { ExportModal } from "@/components/ExportModal";
import { NewAppointmentModal } from "@/components/clinical/NewAppointmentModal";
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
  Calendar,
  CalendarDays,
  CheckCircle2,
  Clock,
  Download,
  Globe,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Users,
  FileText,
  Ban,
  Link2,
} from "lucide-react";
import { PatientsManager } from "@/components/clinical/PatientsManager";

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
  patient_id: string | null;
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
  "id, patient_id, patient_name, patient_email, patient_phone, service_name, appointment_date, appointment_time, status, notes, reminder_sent_at";

const DAY_NAMES = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const statusTone: Record<Appointment["status"], string> = {
  pending:
    "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200 hover:border-amber-500/70 hover:bg-amber-500/15 shadow-sm",
  confirmed:
    "border-emerald-600/40 bg-emerald-500/10 text-emerald-950 dark:text-emerald-200 hover:border-emerald-600/70 hover:bg-emerald-500/15 shadow-sm",
  cancelled: "border-border/60 bg-muted/40 text-muted-foreground opacity-75 hover:opacity-100",
  completed:
    "border-primary/35 bg-primary/10 text-primary dark:text-primary-soft hover:border-primary/60 hover:bg-primary/15 shadow-sm",
};

function Painel() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session, isAdmin, loading } = useSession();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [selectedGoogle, setSelectedGoogle] = useState<ICSEvent | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showNewAppointmentModal, setShowNewAppointmentModal] = useState(false);
  const [newAppointmentDate, setNewAppointmentDate] = useState<string | undefined>(undefined);
  const [newAppointmentMode, setNewAppointmentMode] = useState<"existing" | "new" | "block">(
    "existing",
  );
  const [mainTab, setMainTab] = useState<"agenda" | "pacientes">("agenda");
  const [selectedPatientIdForChart, setSelectedPatientIdForChart] = useState<string | null>(null);

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
      if (error.code === "23505") {
        toast.error("Este horário já está ocupado por outro paciente na agenda!");
        return;
      }
      toast.error("Não foi possível salvar a alteração.");
      return;
    }
    toast.success("Agenda atualizada.");
    setSelected(null);
    queryClient.invalidateQueries({ queryKey: ["appointments"] });
  }

  async function deleteAppointment(id: string) {
    const { error } = await supabase.from("appointments").delete().eq("id", id);
    if (error) {
      toast.error("Não foi possível excluir o agendamento.");
      return;
    }
    toast.success("Agendamento excluído permanentemente da agenda.");
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
  const supaToday =
    weekAppointments?.filter((a) => a.appointment_date === todayISO && a.status !== "cancelled")
      .length ?? 0;
  const googleToday = googleEvents.filter((g) => g.date === todayISO).length;
  const todayCount = supaToday + googleToday;

  const supaConfirmedWeek = weekAppointments?.filter((a) => a.status === "confirmed").length ?? 0;
  const googleWeekCount = googleEvents.filter(
    (g) => g.date >= rangeStart && g.date <= rangeEnd,
  ).length;
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
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-2xl transition-all duration-300">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6">
          <Link
            to="/"
            className="transition-transform duration-300 hover:scale-105 active:scale-95"
          >
            <Logo />
          </Link>
          <div className="flex items-center gap-2.5 sm:gap-3">
            <button
              onClick={() => {
                setNewAppointmentDate(undefined);
                setNewAppointmentMode("existing");
                setShowNewAppointmentModal(true);
              }}
              className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full bg-primary px-4 sm:px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-primary-foreground shadow-sm transition-all duration-300 hover:bg-primary-deep hover:shadow-md hover:shadow-primary/20 active:scale-95 cursor-pointer"
            >
              <Plus className="h-4 w-4 transition-transform duration-300 group-hover:rotate-90" />
              <span>Novo Agendamento</span>
            </button>
            <button
              onClick={() => {
                setNewAppointmentDate(undefined);
                setNewAppointmentMode("block");
                setShowNewAppointmentModal(true);
              }}
              className="group relative hidden items-center gap-2 overflow-hidden rounded-full border border-amber-500/35 bg-amber-500/10 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-300 shadow-sm transition-all duration-300 hover:border-amber-500/60 hover:bg-amber-500/20 active:scale-95 md:inline-flex cursor-pointer"
            >
              <Ban className="h-3.5 w-3.5" />
              <span>Bloquear Horário</span>
            </button>
            <button
              onClick={() => {
                const publicUrl = `${window.location.origin}/agendar`;
                navigator.clipboard.writeText(publicUrl);
                toast.success(`Link de agendamento copiado: ${publicUrl}`);
              }}
              title="Copiar link público de agendamento online para enviar aos pacientes"
              className="group relative hidden items-center gap-2 overflow-hidden rounded-full border border-emerald-600/30 bg-emerald-500/10 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 shadow-sm transition-all duration-300 hover:border-emerald-600/50 hover:bg-emerald-500/20 active:scale-95 lg:inline-flex cursor-pointer"
            >
              <Link2 className="h-4 w-4 transition-transform duration-300 group-hover:rotate-6" />
              <span>Link Online</span>
            </button>
            <button
              onClick={() => setShowExportModal(true)}
              className="group relative hidden items-center gap-2 overflow-hidden rounded-full border border-primary/25 bg-primary/8 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-primary shadow-sm transition-all duration-300 hover:border-primary/50 hover:bg-primary/15 hover:shadow-md hover:shadow-primary/10 active:scale-95 sm:inline-flex cursor-pointer"
            >
              <Download className="h-4 w-4 transition-transform duration-300 group-hover:-translate-y-0.5" />
              <span>Exportar</span>
            </button>
            <Link
              to="/"
              className="group hidden items-center gap-2 rounded-full border border-border bg-card/80 px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-foreground shadow-sm transition-all duration-300 hover:border-foreground/30 hover:bg-accent active:scale-95 sm:inline-flex"
            >
              <Globe className="h-4 w-4 text-muted-foreground transition-transform duration-300 group-hover:scale-110 group-hover:text-foreground" />
              <span>Ver site</span>
            </Link>
            <button
              onClick={handleSignOut}
              className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full bg-primary px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-primary-foreground shadow-sm transition-all duration-300 hover:bg-primary-deep hover:shadow-md hover:shadow-primary/20 active:scale-95"
            >
              <span>Sair</span>
              <LogOut className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-12">
        <div className="flex flex-col gap-2">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Painel Clínico Integrado
          </span>
          <h1 className="mt-2 font-display text-4xl text-foreground lg:text-5xl">
            Bem-vinda, <span className="font-script text-primary">Dra. Michelle</span>
          </h1>
        </div>

        {/* Navigation Tabs (Estilo Clinicorp Solo) */}
        <div className="mt-8 flex flex-wrap items-center gap-3 border-b border-border pb-4">
          <button
            onClick={() => setMainTab("agenda")}
            className={cn(
              "px-6 py-2.5 rounded-full text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2",
              mainTab === "agenda"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
          >
            <Calendar className="h-4 w-4" />
            Agenda & Consultas
          </button>
          <button
            onClick={() => setMainTab("pacientes")}
            className={cn(
              "px-6 py-2.5 rounded-full text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2",
              mainTab === "pacientes"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
          >
            <Users className="h-4 w-4" />
            Pacientes & Prontuários
          </button>
        </div>

        {mainTab === "pacientes" ? (
          <div className="mt-8">
            <PatientsManager
              initialPatientId={selectedPatientIdForChart}
              onPatientLoaded={() => setSelectedPatientIdForChart(null)}
            />
          </div>
        ) : (
          <>
            {/* Stats with Uiverse-inspired glassmorphic cards */}
            <div className="mt-10 grid gap-6 sm:grid-cols-3">
              {/* Card 1: Hoje */}
              <div className="group relative overflow-hidden rounded-3xl border border-border/80 bg-gradient-to-br from-card via-card to-primary/[0.04] p-7 shadow-soft transition-all duration-500 hover:-translate-y-1 hover:border-primary/40 hover:shadow-raised">
                <div className="absolute top-0 right-0 h-28 w-28 rounded-bl-full bg-primary/5 transition-transform duration-500 group-hover:scale-125 pointer-events-none" />
                <div className="flex items-center justify-between">
                  <span className="text-kicker text-muted-foreground">Consultas hoje</span>
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-inner transition-transform duration-300 group-hover:scale-110">
                    <CalendarDays className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-5 flex items-baseline gap-3">
                  <span className="font-display text-5xl font-light tracking-tight text-foreground transition-colors duration-300 group-hover:text-primary">
                    {todayCount}
                  </span>
                  <span className="text-xs font-medium text-muted-foreground">
                    {todayCount === 1 ? "agendamento" : "agendamentos"}
                  </span>
                </div>
                <div className="mt-4 flex items-center gap-2 border-t border-border/40 pt-3 text-xs text-muted-foreground">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                  <span>{formatLongDate(todayISO)}</span>
                </div>
              </div>

              {/* Card 2: Confirmadas */}
              <div className="group relative overflow-hidden rounded-3xl border border-border/80 bg-gradient-to-br from-card via-card to-emerald-500/[0.04] p-7 shadow-soft transition-all duration-500 hover:-translate-y-1 hover:border-emerald-500/40 hover:shadow-raised">
                <div className="absolute top-0 right-0 h-28 w-28 rounded-bl-full bg-emerald-500/5 transition-transform duration-500 group-hover:scale-125 pointer-events-none" />
                <div className="flex items-center justify-between">
                  <span className="text-kicker text-muted-foreground">Confirmadas na semana</span>
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shadow-inner transition-transform duration-300 group-hover:scale-110">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-5 flex items-baseline gap-3">
                  <span className="font-display text-5xl font-light tracking-tight text-foreground transition-colors duration-300 group-hover:text-emerald-700 dark:group-hover:text-emerald-400">
                    {confirmedCount}
                  </span>
                  <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    consultas ativas
                  </span>
                </div>
                <div className="mt-4 flex items-center gap-2 border-t border-border/40 pt-3 text-xs text-muted-foreground">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                  <span>
                    {formatShortDate(rangeStart)} a {formatShortDate(rangeEnd)}
                  </span>
                </div>
              </div>

              {/* Card 3: Pendentes */}
              <div className="group relative overflow-hidden rounded-3xl border border-border/80 bg-gradient-to-br from-card via-card to-amber-500/[0.04] p-7 shadow-soft transition-all duration-500 hover:-translate-y-1 hover:border-amber-500/40 hover:shadow-raised">
                <div className="absolute top-0 right-0 h-28 w-28 rounded-bl-full bg-amber-500/5 transition-transform duration-500 group-hover:scale-125 pointer-events-none" />
                <div className="flex items-center justify-between">
                  <span className="text-kicker text-muted-foreground">Aguardando confirmação</span>
                  <div
                    className={cn(
                      "flex h-11 w-11 items-center justify-center rounded-2xl shadow-inner transition-transform duration-300 group-hover:scale-110",
                      pendingCount > 0
                        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    <Clock className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-5 flex items-baseline gap-3">
                  <span className="font-display text-5xl font-light tracking-tight text-foreground transition-colors duration-300 group-hover:text-amber-600 dark:group-hover:text-amber-400">
                    {pendingCount}
                  </span>
                  <span
                    className={cn(
                      "text-xs font-medium",
                      pendingCount > 0
                        ? "font-semibold text-amber-700 dark:text-amber-400"
                        : "text-muted-foreground",
                    )}
                  >
                    {pendingCount === 0 ? "fila em dia" : "requer atenção"}
                  </span>
                </div>
                <div className="mt-4 flex items-center gap-2 border-t border-border/40 pt-3 text-xs text-muted-foreground">
                  <span
                    className={cn(
                      "inline-block h-2 w-2 rounded-full",
                      pendingCount > 0 ? "bg-amber-500 animate-pulse" : "bg-muted-foreground/40",
                    )}
                  />
                  <span>
                    {pendingCount > 0 ? `${pendingCount} aguardando resposta` : "Todas confirmadas"}
                  </span>
                </div>
              </div>
            </div>

            {/* Week navigation with Segmented Controls */}
            <div className="mt-16 flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-kicker text-muted-foreground">Período selecionado</span>
                <h2 className="mt-1 font-display text-3xl text-foreground">
                  {formatShortDate(rangeStart)} – {formatShortDate(rangeEnd)}
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => {
                    setNewAppointmentDate(todayISO);
                    setShowNewAppointmentModal(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wider text-primary-foreground shadow-sm transition-all duration-200 hover:bg-primary-deep active:scale-95 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Agendar Consulta</span>
                </button>
                <div className="flex items-center gap-1.5 rounded-full border border-border/80 bg-card/80 p-1.5 shadow-sm backdrop-blur-md">
                  <button
                    onClick={() => setWeekStart(addDays(weekStart, -7))}
                    className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold text-foreground transition-all duration-200 hover:bg-accent active:scale-95"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    <span>Anterior</span>
                  </button>
                  <button
                    onClick={() => setWeekStart(startOfWeek(new Date()))}
                    className="inline-flex items-center rounded-full bg-primary/10 px-4 py-2 text-xs font-semibold text-primary transition-all duration-200 hover:bg-primary/20 active:scale-95"
                  >
                    Hoje
                  </button>
                  <button
                    onClick={() => setWeekStart(addDays(weekStart, 7))}
                    className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold text-foreground transition-all duration-200 hover:bg-accent active:scale-95"
                  >
                    <span>Próxima</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Weekly calendar with tactile cards */}
            <div className="mt-8 overflow-x-auto rounded-3xl border border-border/80 bg-card/90 shadow-petal backdrop-blur-md">
              <div className="grid min-w-[880px] grid-cols-6 divide-x divide-border/60">
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
                    <div
                      key={iso}
                      className={cn(
                        "min-h-[420px] p-4 transition-colors",
                        isToday && "bg-primary/[0.02]",
                      )}
                    >
                      <div
                        className={cn(
                          "flex items-baseline justify-between border-b border-border/50 pb-3 mb-3",
                          isToday && "text-primary font-semibold",
                        )}
                      >
                        <span className="flex items-center gap-1.5">
                          <span className="text-kicker">{DAY_NAMES[index]}</span>
                          {isToday && (
                            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                          )}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              setNewAppointmentDate(iso);
                              setShowNewAppointmentModal(true);
                            }}
                            title={`Agendar consulta para ${DAY_NAMES[index]}`}
                            className="p-1 rounded-full text-muted-foreground/60 hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                          <span
                            className={cn(
                              "font-display text-2xl transition-all",
                              isToday
                                ? "flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground shadow-sm"
                                : "text-foreground",
                            )}
                          >
                            {String(day.getDate()).padStart(2, "0")}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2.5">
                        {combined.length === 0 && (
                          <div className="flex h-40 flex-col items-center justify-center text-center">
                            <span className="text-xs text-muted-foreground/50">Sem consultas</span>
                          </div>
                        )}
                        {combined.map((item) => (
                          <button
                            key={item.id}
                            onClick={() => {
                              if (item.rawSupa) setSelected(item.rawSupa);
                              else if (item.rawGoogle) setSelectedGoogle(item.rawGoogle);
                            }}
                            className={cn(
                              "group relative w-full rounded-2xl border p-3.5 text-left transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 cursor-pointer backdrop-blur-sm",
                              item.isGoogle
                                ? "border-emerald-600/35 bg-emerald-500/10 text-emerald-950 dark:text-emerald-200 hover:border-emerald-600/70 hover:bg-emerald-500/15"
                                : statusTone[item.status],
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold tracking-tight flex items-center gap-1.5 text-foreground">
                                <Clock className="h-3 w-3 text-muted-foreground" />
                                <span>{item.time}</span>
                              </span>
                              {item.isGoogle ? (
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 bg-emerald-500/15 px-2 py-0.5 rounded-full border border-emerald-600/20">
                                  Google
                                </span>
                              ) : (
                                <span
                                  className={cn(
                                    "text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border flex items-center gap-1",
                                    item.status === "pending"
                                      ? "text-amber-800 dark:text-amber-300 bg-amber-500/15 border-amber-500/30"
                                      : item.status === "confirmed"
                                        ? "text-emerald-800 dark:text-emerald-300 bg-emerald-500/15 border-emerald-600/30"
                                        : item.status === "completed"
                                          ? "text-primary bg-primary/10 border-primary/25"
                                          : "text-muted-foreground bg-muted border-border",
                                  )}
                                >
                                  <span
                                    className={cn(
                                      "h-1.5 w-1.5 rounded-full",
                                      item.status === "pending"
                                        ? "bg-amber-500 animate-pulse"
                                        : item.status === "confirmed"
                                          ? "bg-emerald-500"
                                          : item.status === "completed"
                                            ? "bg-primary"
                                            : "bg-muted-foreground",
                                    )}
                                  />
                                  {STATUS_LABELS[item.status]}
                                </span>
                              )}
                            </div>
                            <span className="mt-2 block truncate text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
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
                {formatLongDate(tomorrowISO)} · a mensagem já vai pronta pelo WhatsApp e o envio
                fica registrado aqui.
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
                        {appointment.reminder_sent_at ? "Lembrete já enviado" : "Lembrete pendente"}{" "}
                        · {appointment.patient_phone}
                      </p>
                    </div>

                    <a
                      href={buildReminderLink(appointment)}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => markReminderSent(appointment)}
                      className={cn(
                        "group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-semibold uppercase tracking-wider transition-all duration-300 active:scale-95 shadow-sm",
                        appointment.reminder_sent_at
                          ? "border border-border bg-card text-foreground hover:bg-accent hover:border-foreground/30"
                          : "bg-primary text-primary-foreground hover:bg-primary-deep hover:shadow-md hover:shadow-primary/20",
                      )}
                    >
                      <MessageCircle className="h-4 w-4 transition-transform duration-300 group-hover:scale-110" />
                      <span>
                        {appointment.reminder_sent_at ? "Enviar novamente" : "Enviar lembrete"}
                      </span>
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
                        {appointment.service_name} · {formatLongDate(appointment.appointment_date)}{" "}
                        às {trimSeconds(appointment.appointment_time)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground/80">
                        {appointment.patient_phone} ·{" "}
                        {appointment.patient_email ?? "E-mail não informado"}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                      <button
                        onClick={() => updateAppointment(appointment.id, { status: "confirmed" })}
                        className="group inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-primary-foreground shadow-sm transition-all duration-300 hover:bg-primary-deep hover:shadow-md hover:shadow-primary/20 active:scale-95"
                      >
                        <Check className="h-3.5 w-3.5 transition-transform duration-300 group-hover:scale-125" />
                        <span>Confirmar</span>
                      </button>
                      <a
                        href={buildWhatsAppLink(appointment)}
                        target="_blank"
                        rel="noreferrer"
                        className="group inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-foreground shadow-sm transition-all duration-300 hover:border-foreground/30 hover:bg-accent active:scale-95"
                      >
                        <MessageCircle className="h-3.5 w-3.5 text-emerald-600 transition-transform duration-300 group-hover:scale-110" />
                        <span>Avisar</span>
                      </a>
                      <button
                        onClick={() => updateAppointment(appointment.id, { status: "cancelled" })}
                        className="group inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-all duration-300 hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive active:scale-95"
                      >
                        <X className="h-3.5 w-3.5 transition-transform duration-300 group-hover:rotate-90" />
                        <span>Recusar</span>
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
          </>
        )}

        {selected && (
          <AppointmentSheet
            appointment={selected}
            onClose={() => setSelected(null)}
            onSave={updateAppointment}
            onDelete={deleteAppointment}
            onOpenChart={(patientId) => {
              setSelected(null);
              setSelectedPatientIdForChart(patientId);
              setMainTab("pacientes");
            }}
          />
        )}

        {selectedGoogle && (
          <GoogleEventSheet event={selectedGoogle} onClose={() => setSelectedGoogle(null)} />
        )}

        {showExportModal && allAppointments && (
          <ExportModal appointments={allAppointments} onClose={() => setShowExportModal(false)} />
        )}

        <NewAppointmentModal
          open={showNewAppointmentModal}
          onOpenChange={setShowNewAppointmentModal}
          defaultDate={newAppointmentDate}
          defaultMode={newAppointmentMode}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["appointments"] });
          }}
        />
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
    mutationFn: (data: Omit<MessageTemplate, "id" | "created_at" | "updated_at">) =>
      createMessageTemplate({ data }),
    onSuccess: () => {
      toast.success("Template criado");
      queryClient.invalidateQueries({ queryKey: ["message-templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: (data: { id: string } & Partial<MessageTemplate>) =>
      updateMessageTemplate({ data }),
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

  const templatesByType = templates?.reduce(
    (acc, t) => {
      if (!acc[t.type]) acc[t.type] = [];
      acc[t.type].push(t);
      return acc;
    },
    {} as Record<TemplateType, MessageTemplate[]>,
  );

  return (
    <div className="mt-8 space-y-6">
      {Object.entries(typeLabels).map(([type, label]) => {
        const typeTemplates = templatesByType?.[type as TemplateType] ?? [];
        const hasActive = typeTemplates.some((t) => t.is_active);

        return (
          <div
            key={type}
            className="rounded-2xl border border-border bg-card shadow-petal overflow-hidden"
          >
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
                  <div
                    key={template.id}
                    className="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            template.is_active
                              ? "bg-success/10 text-success"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
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
                      <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                        {template.body}
                      </p>
                      {template.subject && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Assunto: {template.subject}
                        </p>
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
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            channel: e.target.value as "whatsapp" | "email" | "both",
                          })
                        }
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
                      {
                        "Variáveis: {{patient_name}}, {{appointment_date_formatted}}, {{appointment_time}}, {{service_name}}, {{protocol}}, {{confirmation_link}}, {{cancellation_link}}, {{clinic_name}}, {{clinic_short_name}}, {{clinic_address}}, {{clinic_phone}}, {{clinic_whatsapp}}, {{notes}}"
                      }
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

const CONSULTORIO_ME_QUICK_TEMPLATES = [
  {
    id: "lembrete_adulto",
    label: "Lembrete Adulto",
    build: (name: string, dateStr: string, timeStr: string) =>
      `Olá *${name}*, passando para lembrar da sua consulta, ${dateStr} às ${timeStr}.\n\n*OBSERVAÇÕES IMPORTANTES*\n• É importante que vocês cheguem no seu horário agendado.⏰\n• Caso não puder comparecer avisar com pelo menos 3h de antecedência.\n\nNosso endereço: ${CLINIC.name} — ${CLINIC.addressLine}, ${CLINIC.cityState}.`,
  },
  {
    id: "lembrete_kids",
    label: "Lembrete Kids",
    build: (name: string, dateStr: string, timeStr: string) =>
      `Olá, passando para lembrar da consulta do(a) *${name}*, ${dateStr} às ${timeStr}.\n\n*OBSERVAÇÕES IMPORTANTES*\n• É importante que vocês cheguem no seu horário agendado.⏰\n• Caso não puder comparecer avisar com pelo menos 3h de antecedência.\n\nNosso endereço: ${CLINIC.name} — ${CLINIC.addressLine}, ${CLINIC.cityState}.`,
  },
  {
    id: "consulta_okay",
    label: "Consulta Okay",
    build: (name: string, dateStr: string, timeStr: string) =>
      `Olá, a consulta do(a) *${name}* foi agendada com sucesso, será no *${dateStr} às ${timeStr}* !!\n\nNão se esqueça de chegar com _*alguns minutos de antecedência do horário agendado*_\n\nCaso não puder comparecer ou precisar reagendar a consulta, por favor entre em contato o mais breve possível.\n\nDesde já agradecemos por sua confiança no nosso serviço!!\n\n*${CLINIC.shortName}*`,
  },
  {
    id: "retorno",
    label: "Retorno",
    build: (name: string, dateStr: string, timeStr: string) =>
      `Olá, a consulta do(a) *${name}* foi agendada com sucesso, será *${dateStr}* às *${timeStr}* !!\n\nCaso não puder comparecer ou precisar reagendar a consulta, por favor entre em contato o mais breve possível.\n\nDesde já agradecemos por sua confiança no nosso serviço!!\n\n*${CLINIC.shortName}*`,
  },
  {
    id: "remarcar_18",
    label: "Remarcar pós 18h",
    build: (name: string, dateStr: string, timeStr: string) =>
      `Olá, tudo bem?☺️\n\nPassando para informá-lo(a) que a nossa clínica precisou alterar os protocolos referente ao seu horário de funcionamento. Por questões de segurança as atividades estarão sendo encerradas às 18h00.\n\nEntão diante do informado a consulta do(a) *${name}* será remarcada para *${dateStr}* às *${timeStr}*.\n\nAguardaremos a sua confirmação.😉✅\n\nObrigado pela sua compreensão.`,
  },
  {
    id: "cancelamento_manutencao",
    label: "Cancelamento (Manutenção)",
    build: (name: string) =>
      `Olá, a consulta do(a) *${name}* infelizmente será desmarcada, a clínica irá fazer manutenção dos equipamentos externos (compressores, bombas de sucção e troca de mangueiras de ar).\n\nEntraremos em contato em breve informando a nova data da consulta.\n\nDesde já agradecemos por sua compreensão.\n\n*${CLINIC.shortName}*`,
  },
];

function AppointmentSheet({
  appointment,
  onClose,
  onSave,
  onDelete,
  onOpenChart,
}: {
  appointment: Appointment;
  onClose: () => void;
  onSave: (id: string, patch: Partial<Appointment>) => void;
  onDelete: (id: string) => void;
  onOpenChart: (patientId: string) => void;
}) {
  const [date, setDate] = useState(appointment.appointment_date);
  const [time, setTime] = useState(trimSeconds(appointment.appointment_time));
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const slots = buildTimeSlots(weekdayOf(date));
  const isBlock = appointment.service_name === "Bloqueio de Agenda";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-primary-deep/40 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-card p-9 shadow-bloom sm:rounded-3xl"
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-kicker text-primary-soft">
            {isBlock ? "Horário Bloqueado" : STATUS_LABELS[appointment.status]}
          </p>
          {appointment.patient_id && !isBlock && (
            <button
              onClick={() => onOpenChart(appointment.patient_id!)}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/25 px-4 py-1.5 text-xs font-semibold text-primary hover:bg-primary hover:text-primary-foreground transition-all cursor-pointer"
            >
              <FileText className="h-3.5 w-3.5" />
              <span>Abrir Prontuário</span>
            </button>
          )}
        </div>
        <h2 className="mt-4 font-display text-3xl text-foreground">{appointment.patient_name}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{appointment.service_name}</p>

        <dl className="mt-8 space-y-3 border-y border-border py-7 text-sm">
          {!isBlock && (
            <>
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
            </>
          )}
          {appointment.notes && (
            <div className="pt-2">
              <dt className="text-muted-foreground">Observações</dt>
              <dd className="mt-2 leading-relaxed text-foreground">{appointment.notes}</dd>
            </div>
          )}
        </dl>

        <div className="mt-8 space-y-4">
          <p className="text-kicker text-primary-soft">Remarcar Data / Horário</p>
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

        {!isBlock && appointment.patient_phone && appointment.patient_phone !== "Não informado" && (
          <div className="mt-6 space-y-2.5">
            <p className="text-kicker text-primary-soft">
              Mensagens Rápidas WhatsApp (Consultório.me)
            </p>
            <div className="flex flex-wrap gap-2">
              {CONSULTORIO_ME_QUICK_TEMPLATES.map((tpl) => {
                const dateFormatted = new Date(date + "T12:00:00").toLocaleDateString("pt-BR");
                const msg = tpl.build(appointment.patient_name, dateFormatted, time);
                const url = `https://wa.me/${whatsappNumber(appointment.patient_phone)}?text=${encodeURIComponent(msg)}`;
                return (
                  <a
                    key={tpl.id}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full border border-emerald-600/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-600 hover:text-white transition-colors"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    <span>{tpl.label}</span>
                  </a>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-9 flex flex-wrap gap-2.5">
          <button
            onClick={() =>
              onSave(appointment.id, {
                appointment_date: date,
                appointment_time: time,
                status: "confirmed",
              })
            }
            className="rounded-full bg-primary px-6 py-3 text-kicker text-primary-foreground transition-silk hover:bg-primary-deep cursor-pointer"
          >
            Salvar e confirmar
          </button>
          {!isBlock && (
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
          )}
          {!isBlock && (
            <button
              onClick={() => onSave(appointment.id, { status: "completed" })}
              className="rounded-full border border-border px-6 py-3 text-kicker text-foreground transition-silk hover:bg-accent cursor-pointer"
            >
              Concluída
            </button>
          )}
          {!isBlock && (
            <button
              onClick={() => onSave(appointment.id, { status: "cancelled" })}
              className="rounded-full border border-border px-6 py-3 text-kicker text-muted-foreground transition-silk hover:text-destructive cursor-pointer"
            >
              Cancelar
            </button>
          )}
          {confirmingDelete ? (
            <div className="flex items-center gap-2 rounded-full border border-rose-500/40 bg-rose-500/10 px-4 py-2">
              <span className="text-xs font-semibold text-rose-700 dark:text-rose-300">
                Confirmar exclusão?
              </span>
              <button
                onClick={() => onDelete(appointment.id)}
                className="rounded-full bg-rose-600 px-3.5 py-1 text-xs font-bold text-white hover:bg-rose-700 transition-colors cursor-pointer"
              >
                Sim, excluir
              </button>
              <button
                onClick={() => setConfirmingDelete(false)}
                className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
              >
                Não
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                if (isBlock) {
                  onDelete(appointment.id);
                } else {
                  setConfirmingDelete(true);
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-5 py-3 text-kicker text-rose-700 dark:text-rose-300 transition-silk hover:bg-rose-600 hover:text-white cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>{isBlock ? "Liberar / Excluir Bloqueio" : "Excluir Agendamento"}</span>
            </button>
          )}
        </div>

        <button
          onClick={onClose}
          className="mt-7 w-full text-center text-sm text-muted-foreground transition-silk hover:text-primary cursor-pointer"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}

function GoogleEventSheet({ event, onClose }: { event: ICSEvent; onClose: () => void }) {
  const phoneMatch = (event.summary + " " + (event.description || "")).match(
    /(?:\(?\d{2}\)?\s*)?\d{4,5}[-\s]?\d{4}/,
  );
  const rawPhone = phoneMatch ? phoneMatch[0] : "";
  const cleanPhone = rawPhone.replace(/\D/g, "");
  const waUrl =
    cleanPhone && cleanPhone.length >= 8
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
