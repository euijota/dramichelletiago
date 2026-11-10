import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CLINIC, formatLongDate, trimSeconds, toISODate, addDays } from "@/lib/clinic";
import { buildWhatsAppReminderUrl } from "@/lib/reminders";
import { cn } from "@/lib/utils";
import {
  buildWhatsAppUniversalUrl,
  parseDateSafe,
  isBirthdayInMonth,
  calculateAge,
  classifyReturnAlert,
  classifyAppointmentTiming,
  parseOrcamentoInfo,
} from "@/lib/crc";
import {
  HeartHandshake,
  Calendar,
  Clock,
  Send,
  Check,
  X,
  MessageCircle,
  Sparkles,
  Gift,
  DollarSign,
  AlertCircle,
  CalendarDays,
  Search,
  CheckCircle2,
  Phone,
  User,
  Plus,
  History,
  CalendarCheck,
  CalendarClock,
  ArrowRight,
  RefreshCw,
} from "lucide-react";

export interface CRCManagerProps {
  initialSubTab?: "confirmacoes" | "retornos" | "orcamentos" | "aniversariantes";
  onOpenPatientChart: (patientId: string) => void;
  onScheduleAppointment?: (patient: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    cpf: string | null;
    insurance: string | null;
    record_number: number;
  }) => void;
}

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

type PatientReturnAlert = {
  id: string;
  name: string;
  phone: string | null;
  phone2: string | null;
  record_number: number;
  return_alert_date: string | null;
  return_alert_notes: string | null;
  email: string | null;
  cpf: string | null;
  insurance: string | null;
};

type OrcamentoRecord = {
  id: string;
  patient_id: string;
  record_type: string;
  record_date: string;
  title: string | null;
  content: string;
  patients?: {
    id: string;
    name: string;
    phone: string | null;
    record_number: number;
  } | null;
};

type BirthdayPatient = {
  id: string;
  name: string;
  phone: string | null;
  record_number: number;
  birth_date: string;
};

const APPOINTMENT_FIELDS =
  "id, patient_id, patient_name, patient_email, patient_phone, service_name, appointment_date, appointment_time, status, notes, reminder_sent_at";

export function CRCManager({
  initialSubTab = "confirmacoes",
  onOpenPatientChart,
  onScheduleAppointment,
}: CRCManagerProps) {
  const queryClient = useQueryClient();
  const [activeSubTab, setActiveSubTab] = useState<
    "confirmacoes" | "retornos" | "orcamentos" | "aniversariantes"
  >(initialSubTab);

  React.useEffect(() => {
    if (initialSubTab) setActiveSubTab(initialSubTab);
  }, [initialSubTab]);
  const [searchTerm, setSearchTerm] = useState("");

  // Sub-filtros internos
  const todayStr = useMemo(() => toISODate(new Date()), []);
  const tomorrowStr = useMemo(() => toISODate(addDays(new Date(), 1)), []);
  const [selectedConfirmDate, setSelectedConfirmDate] = useState(() => {
    const hour = new Date().getHours();
    return hour >= 18 ? toISODate(addDays(new Date(), 1)) : toISODate(new Date());
  });
  const [returnFilter, setReturnFilter] = useState<"todos" | "vencidos" | "mes_atual" | "futuros">(
    "todos",
  );
  const [orcamentoFilter, setOrcamentoFilter] = useState<
    "todos" | "pendentes" | "aprovados" | "recusados"
  >("todos");
  const [birthdayFilter, setBirthdayFilter] = useState<"todos" | "hoje" | "semana" | "sem_envio">(
    "todos",
  );

  // Modal para adicionar alerta de retorno rápido direto do CRC
  const [showAddReturnModal, setShowAddReturnModal] = useState(false);
  const [addReturnSearch, setAddReturnSearch] = useState("");
  const [selectedPatientForReturn, setSelectedPatientForReturn] =
    useState<PatientReturnAlert | null>(null);
  const [newReturnDate, setNewReturnDate] = useState("");
  const [newReturnNotes, setNewReturnNotes] = useState("Retorno preventivo (6 meses)");

  // Rastreio local de parabéns enviados no ano/mês
  const currentYearMonth = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, "0")}`;
  }, []);

  const [wishesSentIds, setWishesSentIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(`crc_birthday_wishes_${currentYearMonth}`);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const toggleWishSent = (patientId: string) => {
    setWishesSentIds((prev) => {
      const next = prev.includes(patientId)
        ? prev.filter((id) => id !== patientId)
        : [...prev, patientId];
      try {
        localStorage.setItem(`crc_birthday_wishes_${currentYearMonth}`, JSON.stringify(next));
      } catch {
        // localStorage indisponível
      }
      return next;
    });
  };

  // ==========================================================================
  // 1. QUERY: Confirmações Pendentes (Foco no dia selecionado)
  // ==========================================================================
  const { data: allPendingAppointments = [], isLoading: isLoadingPending } = useQuery({
    queryKey: ["crc_all_pending_appointments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select(APPOINTMENT_FIELDS)
        .eq("status", "pending")
        .order("appointment_date", { ascending: true })
        .order("appointment_time", { ascending: true });
      if (error) throw error;
      return (data || []) as Appointment[];
    },
    refetchInterval: 10_000,
  });

  const todayPendingCount = useMemo(() => {
    return allPendingAppointments.filter((a) => a.appointment_date === todayStr).length;
  }, [allPendingAppointments, todayStr]);

  const tomorrowPendingCount = useMemo(() => {
    return allPendingAppointments.filter((a) => a.appointment_date === tomorrowStr).length;
  }, [allPendingAppointments, tomorrowStr]);

  // Agendamentos pendentes ESTRITAMENTE do dia selecionado
  const pendingForSelectedDay = useMemo(() => {
    return allPendingAppointments.filter((appt) => appt.appointment_date === selectedConfirmDate);
  }, [allPendingAppointments, selectedConfirmDate]);

  // Lista efetiva considerando busca
  const activePendingList = useMemo(() => {
    return pendingForSelectedDay.filter((appt) => {
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      const matchesName = appt.patient_name.toLowerCase().includes(term);
      const matchesPhone = appt.patient_phone?.toLowerCase().includes(term);
      const matchesService = appt.service_name.toLowerCase().includes(term);
      return matchesName || matchesPhone || matchesService;
    });
  }, [pendingForSelectedDay, searchTerm]);

  // Ações em consultas
  const markReminderSentMutation = useMutation({
    mutationFn: async (appointment: Appointment) => {
      const { error } = await supabase
        .from("appointments")
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq("id", appointment.id);
      if (error) throw error;
    },
    onSuccess: (_, appointment) => {
      toast.success(`Lembrete registrado para ${appointment.patient_name}`);
      queryClient.invalidateQueries({ queryKey: ["crc_all_pending_appointments"] });
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
    },
  });

  const updateAppointmentStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "confirmed" | "cancelled" }) => {
      const { error } = await supabase.from("appointments").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { status }) => {
      toast.success(
        status === "confirmed" ? "Consulta confirmada com sucesso!" : "Consulta cancelada.",
      );
      queryClient.invalidateQueries({ queryKey: ["crc_all_pending_appointments"] });
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
    },
  });

  // ==========================================================================
  // 2. QUERY: Alertas de Retorno
  // ==========================================================================
  const { data: rawReturnAlerts = [], isLoading: isLoadingReturns } = useQuery({
    queryKey: ["crc_return_alerts_list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients")
        .select(
          "id, name, phone, phone2, record_number, return_alert_date, return_alert_notes, email, cpf, insurance",
        )
        .not("return_alert_date", "is", null)
        .order("return_alert_date", { ascending: true });
      if (error) throw error;
      return (data || []) as PatientReturnAlert[];
    },
  });

  const returnCounts = useMemo(() => {
    let vencidos = 0;
    let mesAtual = 0;
    let futuros = 0;
    for (const p of rawReturnAlerts) {
      const c = classifyReturnAlert(p.return_alert_date);
      if (c === "vencido") vencidos++;
      else if (c === "mes_atual") mesAtual++;
      else if (c === "futuro") futuros++;
    }
    return { vencidos, mesAtual, futuros, total: rawReturnAlerts.length };
  }, [rawReturnAlerts]);

  const activeReturnList = useMemo(() => {
    return rawReturnAlerts.filter((p) => {
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchesName = p.name.toLowerCase().includes(term);
        const matchesPhone = p.phone?.toLowerCase().includes(term);
        const matchesNotes = p.return_alert_notes?.toLowerCase().includes(term);
        if (!matchesName && !matchesPhone && !matchesNotes) return false;
      }

      if (returnFilter === "vencidos")
        return classifyReturnAlert(p.return_alert_date) === "vencido";
      if (returnFilter === "mes_atual")
        return classifyReturnAlert(p.return_alert_date) === "mes_atual";
      if (returnFilter === "futuros") return classifyReturnAlert(p.return_alert_date) === "futuro";

      return true;
    });
  }, [rawReturnAlerts, searchTerm, returnFilter]);

  // Ações em Alertas de Retorno
  const postponeReturnMutation = useMutation({
    mutationFn: async ({ patientId, days }: { patientId: string; days: number }) => {
      const target = new Date();
      target.setDate(target.getDate() + days);
      const newDate = toISODate(target);
      const { error } = await supabase
        .from("patients")
        .update({ return_alert_date: newDate })
        .eq("id", patientId);
      if (error) throw error;
      return newDate;
    },
    onSuccess: (newDate) => {
      toast.success(`Retorno adiado para ${newDate.split("-").reverse().join("/")}`);
      queryClient.invalidateQueries({ queryKey: ["crc_return_alerts_list"] });
      queryClient.invalidateQueries({ queryKey: ["crc_return_alerts"] });
    },
  });

  const dismissReturnMutation = useMutation({
    mutationFn: async (patientId: string) => {
      const { error } = await supabase
        .from("patients")
        .update({ return_alert_date: null, return_alert_notes: null })
        .eq("id", patientId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Alerta de retorno concluído / baixado!");
      queryClient.invalidateQueries({ queryKey: ["crc_return_alerts_list"] });
      queryClient.invalidateQueries({ queryKey: ["crc_return_alerts"] });
    },
  });

  // Busca rápida para adicionar alerta de retorno
  const { data: searchPatientsForReturn = [] } = useQuery({
    queryKey: ["search_patients_for_return", addReturnSearch],
    enabled: showAddReturnModal && addReturnSearch.trim().length >= 2,
    queryFn: async () => {
      const term = addReturnSearch.trim();
      const { data } = await supabase
        .from("patients")
        .select(
          "id, name, phone, phone2, record_number, return_alert_date, return_alert_notes, email, cpf, insurance",
        )
        .or(`name.ilike.%${term}%,cpf.ilike.%${term}%,phone.ilike.%${term}%`)
        .order("name")
        .limit(6);
      return (data || []) as PatientReturnAlert[];
    },
  });

  const saveNewReturnAlertMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPatientForReturn || !newReturnDate) return;
      const { error } = await supabase
        .from("patients")
        .update({
          return_alert_date: newReturnDate,
          return_alert_notes: newReturnNotes.trim() || null,
        })
        .eq("id", selectedPatientForReturn.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Alerta de retorno cadastrado!");
      setShowAddReturnModal(false);
      setSelectedPatientForReturn(null);
      setNewReturnDate("");
      setAddReturnSearch("");
      queryClient.invalidateQueries({ queryKey: ["crc_return_alerts_list"] });
      queryClient.invalidateQueries({ queryKey: ["crc_return_alerts"] });
    },
  });

  // ==========================================================================
  // 3. QUERY: Orçamentos em Acompanhamento
  // ==========================================================================
  const { data: rawOrcamentos = [], isLoading: isLoadingOrcamentos } = useQuery({
    queryKey: ["crc_orcamento_records"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinical_records")
        .select(
          "id, patient_id, record_type, record_date, title, content, patients(id, name, phone, record_number)",
        )
        .eq("record_type", "orcamento")
        .order("record_date", { ascending: false })
        .limit(150);
      if (error) throw error;
      return (data || []) as OrcamentoRecord[];
    },
  });

  const parsedOrcamentos = useMemo(() => {
    return rawOrcamentos.map((item) => {
      const info = parseOrcamentoInfo(item.title, item.content);
      return {
        ...item,
        parsedStatus: info.status,
        parsedAmount: info.amount,
      };
    });
  }, [rawOrcamentos]);

  const orcamentoCounts = useMemo(() => {
    let pendentes = 0;
    let aprovados = 0;
    let recusados = 0;
    for (const o of parsedOrcamentos) {
      if (o.parsedStatus === "pendente") pendentes++;
      else if (o.parsedStatus === "aprovado") aprovados++;
      else if (o.parsedStatus === "recusado") recusados++;
    }
    return { pendentes, aprovados, recusados, total: parsedOrcamentos.length };
  }, [parsedOrcamentos]);

  const activeOrcamentoList = useMemo(() => {
    return parsedOrcamentos.filter((item) => {
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchesName = item.patients?.name?.toLowerCase().includes(term);
        const matchesTitle = item.title?.toLowerCase().includes(term);
        const matchesContent = item.content?.toLowerCase().includes(term);
        if (!matchesName && !matchesTitle && !matchesContent) return false;
      }

      if (orcamentoFilter === "pendentes") return item.parsedStatus === "pendente";
      if (orcamentoFilter === "aprovados") return item.parsedStatus === "aprovado";
      if (orcamentoFilter === "recusados") return item.parsedStatus === "recusado";

      return true;
    });
  }, [parsedOrcamentos, searchTerm, orcamentoFilter]);

  // ==========================================================================
  // 4. QUERY: Aniversariantes do Mês (100% dos Pacientes)
  // ==========================================================================
  const currentMonth = useMemo(() => new Date().getMonth() + 1, []);
  const currentDay = useMemo(() => new Date().getDate(), []);

  const { data: allBirthdayPatients = [], isLoading: isLoadingBirthdays } = useQuery({
    queryKey: ["crc_all_birthday_patients_month", currentMonth],
    queryFn: async () => {
      // Busca em páginas de 1000 para contornar o limite do PostgREST sem perder pacientes
      const [p1, p2] = await Promise.all([
        supabase
          .from("patients")
          .select("id, name, phone, record_number, birth_date")
          .not("birth_date", "is", null)
          .range(0, 999),
        supabase
          .from("patients")
          .select("id, name, phone, record_number, birth_date")
          .not("birth_date", "is", null)
          .range(1000, 1999),
      ]);

      const raw = [...(p1.data || []), ...(p2.data || [])] as BirthdayPatient[];

      // Filtra estritamente pelo mês de aniversário e calcula dia e idade
      const monthPatients: Array<
        BirthdayPatient & {
          day: number;
          month: number;
          year: number;
          age: number | null;
          isToday: boolean;
        }
      > = [];

      for (const p of raw) {
        if (!isBirthdayInMonth(p.birth_date, currentMonth)) continue;
        const parsed = parseDateSafe(p.birth_date);
        if (!parsed) continue;

        const age = calculateAge(p.birth_date);
        const isToday = parsed.day === currentDay;

        monthPatients.push({
          ...p,
          day: parsed.day,
          month: parsed.month,
          year: parsed.year,
          age,
          isToday,
        });
      }

      // Ordena CRONOLOGICAMENTE pelo dia do aniversário (Dia 1, 2, 3 ... 31)
      monthPatients.sort((a, b) => a.day - b.day);

      return monthPatients;
    },
  });

  const birthdayCounts = useMemo(() => {
    let hoje = 0;
    let semEnvio = 0;
    for (const p of allBirthdayPatients) {
      if (p.isToday) hoje++;
      if (!wishesSentIds.includes(p.id)) semEnvio++;
    }
    return {
      total: allBirthdayPatients.length,
      hoje,
      semEnvio,
    };
  }, [allBirthdayPatients, wishesSentIds]);

  const activeBirthdayList = useMemo(() => {
    return allBirthdayPatients.filter((p) => {
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchesName = p.name.toLowerCase().includes(term);
        const matchesPhone = p.phone?.toLowerCase().includes(term);
        if (!matchesName && !matchesPhone) return false;
      }

      if (birthdayFilter === "hoje") return p.isToday;
      if (birthdayFilter === "semana") {
        // Dias entre hoje e hoje + 7
        return p.day >= currentDay && p.day <= currentDay + 7;
      }
      if (birthdayFilter === "sem_envio") return !wishesSentIds.includes(p.id);

      return true;
    });
  }, [allBirthdayPatients, searchTerm, birthdayFilter, currentDay, wishesSentIds]);

  return (
    <div className="space-y-6">
      {/* ====================================================================
          CABEÇALHO DO CRC COM CONTADORES EM TEMPO REAL E SMART SEARCH
         ==================================================================== */}
      <div className="flex flex-col gap-5 bg-card border border-border rounded-3xl p-6 shadow-petal">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-normal text-foreground flex items-center gap-2.5">
              <HeartHandshake className="h-6 w-6 text-primary" />
              <span>CRC — Central de Relacionamento com o Paciente</span>
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Gestão ativa de confirmações, retornos preventivos, acompanhamento de orçamentos e
              aniversariantes.
            </p>
          </div>

          {/* Busca Rápida Dentro do CRC */}
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filtrar por paciente, fone..."
              className="w-full pl-9.5 pr-8 py-2 rounded-full border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Abas Principais com Indicadores Vivos */}
        <div className="flex flex-wrap gap-2 pt-2 border-t border-border/60">
          {[
            {
              id: "confirmacoes" as const,
              label: "Confirmações do Dia",
              icon: CalendarClock,
              count: pendingForSelectedDay.length,
              urgent: pendingForSelectedDay.length > 0,
            },
            {
              id: "retornos" as const,
              label: "Alertas de Retorno",
              icon: RefreshCw,
              count: returnCounts.total,
              urgent: returnCounts.vencidos > 0,
            },
            {
              id: "orcamentos" as const,
              label: "Orçamentos em Aberto",
              icon: DollarSign,
              count: orcamentoCounts.pendentes,
              urgent: false,
            },
            {
              id: "aniversariantes" as const,
              label: "Aniversariantes do Mês",
              icon: Gift,
              count: birthdayCounts.total,
              urgent: birthdayCounts.hoje > 0,
              highlight: birthdayCounts.hoje > 0 ? `${birthdayCounts.hoje} hoje!` : undefined,
            },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveSubTab(tab.id);
                  setSearchTerm("");
                }}
                className={cn(
                  "min-h-11 px-4 py-2 rounded-full text-xs font-semibold flex items-center gap-2 border transition-all cursor-pointer relative",
                  isActive
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-background text-foreground border-border hover:bg-accent/60",
                )}
              >
                <Icon
                  className={cn("h-4 w-4", isActive ? "text-primary-foreground" : "text-primary")}
                />
                <span>{tab.label}</span>
                <span
                  className={cn(
                    "px-2 py-0.5 rounded-full text-[11px] font-bold",
                    isActive ? "bg-white/20 text-white" : "bg-muted text-foreground",
                  )}
                >
                  {tab.count}
                </span>
                {tab.highlight && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500 text-white animate-pulse shadow-xs">
                    {tab.highlight}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ====================================================================
          ABA 1: CONFIRMAÇÕES PENDENTES
         ==================================================================== */}
      {activeSubTab === "confirmacoes" && (
        <div className="space-y-4">
          {/* Seletor do Dia das Confirmações */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card border border-border rounded-2xl p-4 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-muted-foreground mr-1">Dia da Consulta:</span>
              <button
                key="btn-hoje"
                onClick={() => setSelectedConfirmDate(todayStr)}
                className={cn(
                  "min-h-9 px-4 py-1.5 rounded-full font-semibold transition-all cursor-pointer flex items-center gap-1.5",
                  selectedConfirmDate === todayStr
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
                )}
              >
                <Calendar className="h-3.5 w-3.5" />
                <span>Hoje ({todayPendingCount})</span>
              </button>

              <button
                key="btn-amanha"
                onClick={() => setSelectedConfirmDate(tomorrowStr)}
                className={cn(
                  "min-h-9 px-4 py-1.5 rounded-full font-semibold transition-all cursor-pointer flex items-center gap-1.5",
                  selectedConfirmDate === tomorrowStr
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
                )}
              >
                <CalendarDays className="h-3.5 w-3.5" />
                <span>Amanhã ({tomorrowPendingCount})</span>
              </button>

              <div className="flex items-center gap-1.5 pl-2 sm:border-l border-border">
                <span className="text-muted-foreground">Outro dia:</span>
                <input
                  type="date"
                  value={selectedConfirmDate}
                  onChange={(e) => {
                    if (e.target.value) setSelectedConfirmDate(e.target.value);
                  }}
                  className="px-3 py-1.5 rounded-xl border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            <div className="text-muted-foreground text-[11px] font-medium">
              Mostrando somente confirmações de{" "}
              <strong className="text-foreground font-bold">
                {selectedConfirmDate === todayStr
                  ? "Hoje"
                  : selectedConfirmDate === tomorrowStr
                    ? "Amanhã"
                    : formatLongDate(selectedConfirmDate)}
              </strong>
            </div>
          </div>

          {/* Lista de Consultas */}
          <div className="rounded-3xl border border-border bg-card shadow-petal divide-y divide-border overflow-hidden">
            <div className="p-4 px-6 bg-muted/30 text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
              <span>
                Confirmações Pendentes de{" "}
                {selectedConfirmDate === todayStr
                  ? "Hoje"
                  : selectedConfirmDate === tomorrowStr
                    ? "Amanhã"
                    : formatLongDate(selectedConfirmDate)}{" "}
                ({activePendingList.length})
              </span>
              {isLoadingPending && (
                <span className="text-[11px] normal-case text-muted-foreground">
                  Atualizando...
                </span>
              )}
            </div>

            {activePendingList.length === 0 ? (
              <div className="p-12 text-center text-sm text-muted-foreground space-y-2">
                <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto" />
                <p className="font-semibold text-foreground">
                  Tudo confirmado para{" "}
                  {selectedConfirmDate === todayStr
                    ? "hoje"
                    : selectedConfirmDate === tomorrowStr
                      ? "amanhã"
                      : "este dia"}
                  !
                </p>
                <p className="text-xs">Nenhum paciente aguardando confirmação nesta data.</p>
              </div>
            ) : (
              activePendingList.map((appointment) => {
                const timing = classifyAppointmentTiming(appointment.appointment_date);
                const isTomorrow = timing === "amanha";
                const isToday = timing === "hoje";
                const isPast = timing === "passado";

                // Gera mensagem do lembrete universal
                const reminderUrl = buildWhatsAppReminderUrl(appointment.patient_phone, {
                  patientName: appointment.patient_name,
                  appointmentDate: appointment.appointment_date,
                  appointmentTime: trimSeconds(appointment.appointment_time),
                  serviceName: appointment.service_name,
                  appointmentId: appointment.id,
                });

                return (
                  <div
                    key={appointment.id}
                    className={cn(
                      "p-5 px-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 text-xs transition-colors",
                      isToday
                        ? "bg-amber-500/5 hover:bg-amber-500/10"
                        : isTomorrow
                          ? "bg-primary/5 hover:bg-primary/10"
                          : "hover:bg-muted/20",
                    )}
                  >
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-foreground">
                          {appointment.patient_name}
                        </span>

                        {isToday && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500 text-white shadow-xs">
                            Consulta Hoje
                          </span>
                        )}
                        {isTomorrow && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-primary text-primary-foreground shadow-xs">
                            Consulta Amanhã
                          </span>
                        )}
                        {isPast && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-muted text-muted-foreground">
                            Data já passou
                          </span>
                        )}

                        {appointment.reminder_sent_at ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                            Lembrete Enviado ✓
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-muted-foreground border border-border">
                            Aguardando Lembrete
                          </span>
                        )}
                      </div>

                      <div className="text-muted-foreground flex flex-wrap items-center gap-3">
                        <span className="font-semibold text-foreground/90">
                          {appointment.service_name}
                        </span>
                        <span>·</span>
                        <span>
                          {formatLongDate(appointment.appointment_date)} às{" "}
                          {trimSeconds(appointment.appointment_time)}
                        </span>
                        <span>·</span>
                        <span className="flex items-center gap-1 font-mono">
                          <Phone className="h-3 w-3 text-muted-foreground" />
                          {appointment.patient_phone || "Sem telefone"}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {/* Botão de Envio de Lembrete c/ Registro */}
                      <a
                        href={reminderUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => markReminderSentMutation.mutate(appointment)}
                        className={cn(
                          "min-h-10 px-4 py-2 rounded-full font-semibold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer",
                          appointment.reminder_sent_at
                            ? "bg-card border border-border text-foreground hover:bg-accent"
                            : "bg-primary text-primary-foreground hover:bg-primary-deep",
                        )}
                      >
                        <Send className="h-3.5 w-3.5" />
                        <span>
                          {appointment.reminder_sent_at
                            ? "Reenviar Link"
                            : "Enviar Link de Confirmação"}
                        </span>
                      </a>

                      {/* Confirmar Presença */}
                      <button
                        onClick={() =>
                          updateAppointmentStatusMutation.mutate({
                            id: appointment.id,
                            status: "confirmed",
                          })
                        }
                        className="min-h-10 px-4 py-2 rounded-full bg-emerald-600 text-white font-semibold hover:bg-emerald-700 cursor-pointer flex items-center gap-1.5 shadow-sm transition-all"
                      >
                        <Check className="h-3.5 w-3.5" />
                        <span>Confirmar</span>
                      </button>

                      {/* Cancelar / Desmarcar */}
                      <button
                        onClick={() => {
                          if (
                            confirm(`Deseja desmarcar a consulta de ${appointment.patient_name}?`)
                          ) {
                            updateAppointmentStatusMutation.mutate({
                              id: appointment.id,
                              status: "cancelled",
                            });
                          }
                        }}
                        className="min-h-10 px-3 py-2 rounded-full border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-all cursor-pointer"
                        title="Desmarcar consulta"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>

                      {/* Conversar Direto */}
                      {appointment.patient_phone && (
                        <a
                          href={buildWhatsAppUniversalUrl(
                            appointment.patient_phone,
                            `Olá, ${appointment.patient_name}! Aqui é do consultório da ${CLINIC.shortName}. Tudo bem?`,
                          )}
                          target="_blank"
                          rel="noreferrer"
                          className="min-h-10 px-3 py-2 rounded-full border border-border bg-background hover:bg-accent text-emerald-600 transition-all flex items-center justify-center"
                          title="Conversar no WhatsApp"
                        >
                          <MessageCircle className="h-4 w-4" />
                        </a>
                      )}

                      {/* Abrir Prontuário */}
                      {appointment.patient_id && (
                        <button
                          onClick={() => onOpenPatientChart(appointment.patient_id!)}
                          className="min-h-10 px-3.5 py-2 rounded-full border border-primary/25 bg-primary/8 hover:bg-primary/15 text-primary font-semibold transition-all cursor-pointer"
                        >
                          Prontuário
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ====================================================================
          ABA 2: ALERTAS DE RETORNO (COM CICLO DE VIDA E AÇÕES DIRETAS)
         ==================================================================== */}
      {activeSubTab === "retornos" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-card border border-border rounded-2xl p-4 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-muted-foreground mr-1">Filtro:</span>
              {[
                { id: "todos" as const, label: `Todos (${returnCounts.total})` },
                { id: "vencidos" as const, label: `🔴 Vencidos (${returnCounts.vencidos})` },
                { id: "mes_atual" as const, label: `🟡 Deste Mês (${returnCounts.mesAtual})` },
                { id: "futuros" as const, label: `🟢 Futuros (${returnCounts.futuros})` },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setReturnFilter(f.id)}
                  className={cn(
                    "px-3 py-1.5 rounded-full font-medium transition-all cursor-pointer",
                    returnFilter === f.id
                      ? "bg-primary/10 text-primary border border-primary/30 font-semibold"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowAddReturnModal(true)}
              className="min-h-9 px-4 py-1.5 rounded-full bg-primary text-primary-foreground font-semibold flex items-center gap-1.5 hover:bg-primary-deep shadow-xs cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Programar Novo Retorno</span>
            </button>
          </div>

          <div className="rounded-3xl border border-border bg-card shadow-petal divide-y divide-border overflow-hidden">
            <div className="p-4 px-6 bg-muted/30 text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
              <span>Pacientes com Retorno Programado ({activeReturnList.length})</span>
              {isLoadingReturns && (
                <span className="text-[11px] normal-case text-muted-foreground">Carregando...</span>
              )}
            </div>

            {activeReturnList.length === 0 ? (
              <div className="p-12 text-center text-sm text-muted-foreground space-y-2">
                <CalendarCheck className="h-8 w-8 text-muted-foreground/60 mx-auto" />
                <p className="font-semibold text-foreground">
                  Nenhum alerta de retorno encontrado.
                </p>
                <p className="text-xs">
                  Programe retornos preventivos após limpezas, raspagens, restaurações ou cirurgias.
                </p>
              </div>
            ) : (
              activeReturnList.map((patient) => {
                const classification = classifyReturnAlert(patient.return_alert_date);
                const isVencido = classification === "vencido";
                const isMesAtual = classification === "mes_atual";
                const parsed = parseDateSafe(patient.return_alert_date);
                const formattedDate = parsed
                  ? `${String(parsed.day).padStart(2, "0")}/${String(parsed.month).padStart(2, "0")}/${parsed.year}`
                  : "Data não informada";

                const message = `Olá, ${patient.name}! Aqui é do consultório da Dra. Michelle Tiago. Está chegando o período do seu retorno odontológico preventivo (${patient.return_alert_notes || "avaliação periódica"}). Gostaria de verificar os horários desta semana para agendarmos seu atendimento?`;

                return (
                  <div
                    key={patient.id}
                    className={cn(
                      "p-5 px-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 text-xs transition-colors",
                      isVencido
                        ? "bg-rose-500/5 hover:bg-rose-500/10"
                        : isMesAtual
                          ? "bg-amber-500/5 hover:bg-amber-500/10"
                          : "hover:bg-muted/20",
                    )}
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-foreground">
                          #{patient.record_number} — {patient.name}
                        </span>
                        {isVencido && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-600 text-white">
                            Retorno Vencido
                          </span>
                        )}
                        {isMesAtual && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white">
                            Retorno Deste Mês
                          </span>
                        )}
                      </div>

                      <div className="text-muted-foreground flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-foreground/90">
                          Data: {formattedDate}
                        </span>
                        <span>·</span>
                        <span className="italic text-foreground/80">
                          {patient.return_alert_notes || "Retorno preventivo (6 meses)"}
                        </span>
                        <span>·</span>
                        <span className="font-mono">{patient.phone || "Sem telefone"}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {/* Chamar no WhatsApp */}
                      {patient.phone && (
                        <a
                          href={buildWhatsAppUniversalUrl(patient.phone, message)}
                          target="_blank"
                          rel="noreferrer"
                          className="min-h-10 px-4 py-2 rounded-full bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-all flex items-center gap-1.5 shadow-sm"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                          <span>Chamar p/ Retorno</span>
                        </a>
                      )}

                      {/* Agendar Consulta */}
                      {onScheduleAppointment && (
                        <button
                          onClick={() =>
                            onScheduleAppointment({
                              id: patient.id,
                              name: patient.name,
                              phone: patient.phone,
                              email: patient.email,
                              cpf: patient.cpf,
                              insurance: patient.insurance,
                              record_number: patient.record_number,
                            })
                          }
                          className="min-h-10 px-4 py-2 rounded-full bg-primary text-primary-foreground font-semibold hover:bg-primary-deep transition-all cursor-pointer flex items-center gap-1.5"
                        >
                          <Calendar className="h-3.5 w-3.5" />
                          <span>Agendar Consulta</span>
                        </button>
                      )}

                      {/* Adiar 30 Dias */}
                      <button
                        onClick={() =>
                          postponeReturnMutation.mutate({ patientId: patient.id, days: 30 })
                        }
                        className="min-h-10 px-3 py-2 rounded-full border border-border bg-background hover:bg-accent font-semibold transition-all cursor-pointer"
                        title="Adiar por 30 dias"
                      >
                        +30 dias
                      </button>

                      {/* Concluir / Baixar Alerta */}
                      <button
                        onClick={() => {
                          if (confirm(`Dar baixa no alerta de retorno de ${patient.name}?`)) {
                            dismissReturnMutation.mutate(patient.id);
                          }
                        }}
                        className="min-h-10 px-3 py-2 rounded-full border border-border text-muted-foreground hover:text-emerald-700 hover:border-emerald-300 transition-all cursor-pointer flex items-center gap-1"
                        title="Marcar retorno como concluído / baixar alerta"
                      >
                        <Check className="h-3.5 w-3.5" />
                        <span>Baixar</span>
                      </button>

                      {/* Abrir Prontuário */}
                      <button
                        onClick={() => onOpenPatientChart(patient.id)}
                        className="min-h-10 px-3.5 py-2 rounded-full border border-primary/25 bg-primary/8 hover:bg-primary/15 text-primary font-semibold transition-all cursor-pointer"
                      >
                        Prontuário
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ====================================================================
          ABA 3: ORÇAMENTOS EM ACOMPANHAMENTO (FOLLOW-UP)
         ==================================================================== */}
      {activeSubTab === "orcamentos" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-card border border-border rounded-2xl p-4 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-muted-foreground mr-1">Status:</span>
              {[
                { id: "todos" as const, label: `Todos (${orcamentoCounts.total})` },
                { id: "pendentes" as const, label: `Em Aberto (${orcamentoCounts.pendentes})` },
                { id: "aprovados" as const, label: `Aprovados (${orcamentoCounts.aprovados})` },
                { id: "recusados" as const, label: `Recusados (${orcamentoCounts.recusados})` },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setOrcamentoFilter(f.id)}
                  className={cn(
                    "px-3 py-1.5 rounded-full font-medium transition-all cursor-pointer",
                    orcamentoFilter === f.id
                      ? "bg-primary/10 text-primary border border-primary/30 font-semibold"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-card shadow-petal divide-y divide-border overflow-hidden">
            <div className="p-4 px-6 bg-muted/30 text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
              <span>Orçamentos Registrados ({activeOrcamentoList.length})</span>
              {isLoadingOrcamentos && (
                <span className="text-[11px] normal-case text-muted-foreground">Carregando...</span>
              )}
            </div>

            {activeOrcamentoList.length === 0 ? (
              <div className="p-12 text-center text-sm text-muted-foreground space-y-2">
                <DollarSign className="h-8 w-8 text-muted-foreground/60 mx-auto" />
                <p className="font-semibold text-foreground">Nenhum orçamento encontrado.</p>
                <p className="text-xs">
                  Orçamentos registrados no prontuário de cada paciente aparecem aqui para
                  acompanhamento.
                </p>
              </div>
            ) : (
              activeOrcamentoList.map((item) => {
                const patientName = item.patients?.name || "Paciente";
                const patientPhone = item.patients?.phone;
                const followUpMessage = `Olá, ${patientName}! Tudo bem? Aqui é da equipe da Dra. Michelle Barbosa Tiago. Gostaria de saber se você ficou com alguma dúvida sobre a proposta de tratamento odontológico que conversamos (${item.title || "orçamento"}). Estamos à disposição para tirar qualquer dúvida e ajudar você a iniciar seu tratamento!`;

                return (
                  <div
                    key={item.id}
                    className="p-5 px-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 text-xs hover:bg-muted/20 transition-colors"
                  >
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-foreground">{patientName}</span>
                        {item.patients?.record_number && (
                          <span className="text-muted-foreground">
                            #{item.patients.record_number}
                          </span>
                        )}

                        {item.parsedStatus === "pendente" && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-900 dark:text-amber-300 border border-amber-300">
                            Em Negociação
                          </span>
                        )}
                        {item.parsedStatus === "aprovado" && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300">
                            Aprovado ✓
                          </span>
                        )}
                        {item.parsedStatus === "recusado" && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300">
                            Recusado
                          </span>
                        )}

                        {item.parsedAmount && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-primary/10 text-primary border border-primary/20">
                            {item.parsedAmount}
                          </span>
                        )}
                      </div>

                      <div className="text-foreground/90 font-medium">{item.title}</div>

                      <div className="text-muted-foreground whitespace-pre-line line-clamp-2 max-w-2xl">
                        {item.content}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {/* WhatsApp Follow-up */}
                      {patientPhone && (
                        <a
                          href={buildWhatsAppUniversalUrl(patientPhone, followUpMessage)}
                          target="_blank"
                          rel="noreferrer"
                          className="min-h-10 px-4 py-2 rounded-full bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-all flex items-center gap-1.5 shadow-sm"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                          <span>Follow-up WhatsApp</span>
                        </a>
                      )}

                      {/* Abrir Prontuário */}
                      <button
                        onClick={() => onOpenPatientChart(item.patient_id)}
                        className="min-h-10 px-4 py-2 rounded-full bg-primary text-primary-foreground font-semibold hover:bg-primary-deep transition-all cursor-pointer flex items-center gap-1"
                      >
                        <span>Abrir no Prontuário</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ====================================================================
          ABA 4: ANIVERSARIANTES DO MÊS (100% DA BASE E ORDENADO POR DIA)
         ==================================================================== */}
      {activeSubTab === "aniversariantes" && (
        <div className="space-y-4">
          {/* Banner Celebrativo se Houver Aniversariantes Hoje */}
          {birthdayCounts.hoje > 0 && (
            <div className="p-5 px-6 rounded-3xl bg-gradient-to-r from-amber-500/15 via-primary/10 to-amber-500/15 border border-amber-500/30 shadow-petal flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="h-11 w-11 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm">
                  <Gift className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <span>
                      🎉 Temos {birthdayCounts.hoje} aniversariante
                      {birthdayCounts.hoje > 1 ? "s" : ""} hoje!
                    </span>
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Envie os parabéns em nome da Dra. Michelle para fortalecer a fidelização e o
                    carinho do paciente.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setBirthdayFilter("hoje")}
                className="min-h-10 px-4 py-2 rounded-full bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-xs transition-all cursor-pointer self-start sm:self-auto"
              >
                Ver Aniversariantes de Hoje
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 bg-card border border-border rounded-2xl p-4 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-muted-foreground mr-1">Filtro:</span>
              {[
                { id: "todos" as const, label: `Todos do Mês (${birthdayCounts.total})` },
                { id: "hoje" as const, label: `🎂 Hoje (${birthdayCounts.hoje})` },
                { id: "semana" as const, label: "Próximos 7 Dias" },
                { id: "sem_envio" as const, label: `Não Enviados (${birthdayCounts.semEnvio})` },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setBirthdayFilter(f.id)}
                  className={cn(
                    "px-3 py-1.5 rounded-full font-medium transition-all cursor-pointer",
                    birthdayFilter === f.id
                      ? "bg-primary/10 text-primary border border-primary/30 font-semibold"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-card shadow-petal divide-y divide-border overflow-hidden">
            <div className="p-4 px-6 bg-muted/30 text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
              <span>Aniversariantes Deste Mês ({activeBirthdayList.length})</span>
              {isLoadingBirthdays && (
                <span className="text-[11px] normal-case text-muted-foreground">
                  Carregando pacientes...
                </span>
              )}
            </div>

            {activeBirthdayList.length === 0 ? (
              <div className="p-12 text-center text-sm text-muted-foreground space-y-2">
                <Gift className="h-8 w-8 text-muted-foreground/60 mx-auto" />
                <p className="font-semibold text-foreground">
                  Nenhum aniversariante encontrado neste filtro.
                </p>
                <p className="text-xs">
                  Alterne os filtros acima para conferir os aniversariantes do mês.
                </p>
              </div>
            ) : (
              activeBirthdayList.map((patient) => {
                const isSent = wishesSentIds.includes(patient.id);
                const isToday = patient.isToday;

                const birthdayGreeting = `Olá, ${patient.name}! 🎉 A Dra. Michelle Barbosa Tiago e toda a equipe do consultório desejam a você um feliz aniversário! Que seu novo ciclo seja repleto de saúde, alegrias e muitos motivos para sorrir! Parabéns pelo seu dia! 🎂✨`;

                return (
                  <div
                    key={patient.id}
                    className={cn(
                      "p-5 px-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 text-xs transition-colors",
                      isToday ? "bg-amber-500/10 hover:bg-amber-500/15" : "hover:bg-muted/20",
                    )}
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-foreground">
                          #{patient.record_number} — {patient.name}
                        </span>

                        {isToday && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500 text-white animate-pulse shadow-xs">
                            🎂 É HOJE!
                          </span>
                        )}

                        {isSent ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300">
                            Parabéns Enviado ✓
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-muted-foreground">
                            Pendente
                          </span>
                        )}
                      </div>

                      <div className="text-muted-foreground flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-foreground/90">
                          Dia {patient.day} de{" "}
                          {new Date(2026, currentMonth - 1, 1).toLocaleDateString("pt-BR", {
                            month: "long",
                          })}
                        </span>
                        {patient.age !== null && (
                          <>
                            <span>·</span>
                            <span>Completa {patient.age} anos</span>
                          </>
                        )}
                        <span>·</span>
                        <span className="font-mono">{patient.phone || "Sem telefone"}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {/* Enviar Parabéns via WhatsApp */}
                      {patient.phone && (
                        <a
                          href={buildWhatsAppUniversalUrl(patient.phone, birthdayGreeting)}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => {
                            if (!isSent) toggleWishSent(patient.id);
                          }}
                          className={cn(
                            "min-h-10 px-4 py-2 rounded-full font-semibold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer",
                            isSent
                              ? "bg-card border border-border text-foreground hover:bg-accent"
                              : "bg-emerald-600 text-white hover:bg-emerald-700",
                          )}
                        >
                          <Gift className="h-3.5 w-3.5" />
                          <span>{isSent ? "Reenviar Parabéns" : "Enviar Parabéns (WhatsApp)"}</span>
                        </a>
                      )}

                      {/* Alternar Status Manualmente */}
                      <button
                        onClick={() => toggleWishSent(patient.id)}
                        className="min-h-10 px-3 py-2 rounded-full border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-all cursor-pointer"
                        title={isSent ? "Marcar como não enviado" : "Marcar como enviado"}
                      >
                        <Check className={cn("h-3.5 w-3.5", isSent && "text-emerald-600")} />
                      </button>

                      {/* Abrir Prontuário */}
                      <button
                        onClick={() => onOpenPatientChart(patient.id)}
                        className="min-h-10 px-3.5 py-2 rounded-full border border-primary/25 bg-primary/8 hover:bg-primary/15 text-primary font-semibold transition-all cursor-pointer"
                      >
                        Prontuário
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ====================================================================
          MODAL: PROGRAMAR NOVO ALERTA DE RETORNO DIRETO DO CRC
         ==================================================================== */}
      {showAddReturnModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-3xl bg-card border border-border p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-primary" />
                <span>Programar Alerta de Retorno</span>
              </h3>
              <button
                onClick={() => {
                  setShowAddReturnModal(false);
                  setSelectedPatientForReturn(null);
                }}
                className="p-1 rounded-full text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Seleção do Paciente */}
              <div>
                <label className="block font-semibold text-foreground mb-1">
                  1. Localizar Paciente
                </label>
                {selectedPatientForReturn ? (
                  <div className="flex items-center justify-between p-3 rounded-2xl bg-primary/10 border border-primary/20">
                    <div>
                      <div className="font-bold text-foreground">
                        #{selectedPatientForReturn.record_number} — {selectedPatientForReturn.name}
                      </div>
                      <div className="text-muted-foreground text-[11px]">
                        {selectedPatientForReturn.phone || "Sem telefone"}
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedPatientForReturn(null)}
                      className="px-2.5 py-1 rounded-full bg-background border border-border text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                    >
                      Trocar
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={addReturnSearch}
                      onChange={(e) => setAddReturnSearch(e.target.value)}
                      placeholder="Digite nome, CPF ou fone do paciente..."
                      className="w-full px-3.5 py-2 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    {searchPatientsForReturn.length > 0 && (
                      <div className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden max-h-48 overflow-y-auto">
                        {searchPatientsForReturn.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => setSelectedPatientForReturn(p)}
                            className="w-full p-2.5 px-3 text-left hover:bg-accent/60 flex items-center justify-between text-xs cursor-pointer"
                          >
                            <span className="font-semibold text-foreground">
                              #{p.record_number} — {p.name}
                            </span>
                            <span className="text-muted-foreground text-[11px]">{p.phone}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Data do Retorno */}
              <div>
                <label className="block font-semibold text-foreground mb-1">
                  2. Data Programada do Retorno
                </label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={newReturnDate}
                    onChange={(e) => setNewReturnDate(e.target.value)}
                    className="flex-1 px-3.5 py-2 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date();
                      d.setMonth(d.getMonth() + 6);
                      setNewReturnDate(toISODate(d));
                    }}
                    className="px-3 py-2 rounded-xl border border-border bg-muted/60 hover:bg-muted text-[11px] font-semibold text-foreground cursor-pointer"
                  >
                    +6 Meses
                  </button>
                </div>
              </div>

              {/* Motivo do Retorno */}
              <div>
                <label className="block font-semibold text-foreground mb-1">
                  3. Motivo / Notas do Retorno
                </label>
                <input
                  type="text"
                  value={newReturnNotes}
                  onChange={(e) => setNewReturnNotes(e.target.value)}
                  placeholder="Ex: Profilaxia periódica, revisão de implante..."
                  className="w-full px-3.5 py-2 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                onClick={() => {
                  setShowAddReturnModal(false);
                  setSelectedPatientForReturn(null);
                }}
                className="px-4 py-2 rounded-full border border-border text-xs font-semibold text-muted-foreground hover:bg-accent cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={() => saveNewReturnAlertMutation.mutate()}
                disabled={
                  !selectedPatientForReturn ||
                  !newReturnDate ||
                  saveNewReturnAlertMutation.isPending
                }
                className="px-5 py-2 rounded-full bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary-deep disabled:opacity-50 cursor-pointer shadow-sm"
              >
                Salvar Alerta
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
