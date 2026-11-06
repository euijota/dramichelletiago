import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Search,
  User,
  Phone,
  FileText,
  Calendar,
  AlertTriangle,
  Smile,
  Plus,
  Clock,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  Filter,
  ArrowUpDown,
  X,
  Edit,
  CheckCircle2,
  Trash2,
} from "lucide-react";
import { OdontogramView } from "./OdontogramView";
import { DocumentGenerator } from "./DocumentGenerator";
import { NewAppointmentModal } from "./NewAppointmentModal";
import { STATUS_LABELS, trimSeconds } from "@/lib/clinic";
import { cn } from "@/lib/utils";

export interface Patient {
  id: string;
  record_number: number;
  name: string;
  phone: string | null;
  email: string | null;
  cpf: string | null;
  birth_date: string | null;
  gender: string | null;
  insurance: string | null;
  insurance_number: string | null;
  medical_warning: string | null;
  address: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  notes?: string | null;
  created_at: string;
}

interface ClinicalRecord {
  id: string;
  patient_id: string;
  record_type: string;
  record_date: string;
  title: string | null;
  content: string;
}

interface PatientAppointment {
  id: string;
  appointment_date: string;
  appointment_time: string;
  service_name: string;
  status: "pending" | "confirmed" | "cancelled" | "completed";
  notes: string | null;
}

const ALPHABET = [
  "Todos",
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "U",
  "V",
  "W",
  "X",
  "Y",
  "Z",
];

interface PatientsManagerProps {
  initialPatientId?: string | null;
  onPatientLoaded?: () => void;
}

export function PatientsManager({ initialPatientId, onPatientLoaded }: PatientsManagerProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedInsurance, setSelectedInsurance] = useState<string>("all");
  const [selectedLetter, setSelectedLetter] = useState<string>("Todos");
  const [onlyWarnings, setOnlyWarnings] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<"name_asc" | "name_desc" | "recent" | "record_num">(
    "name_asc",
  );
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [activeTab, setActiveTab] = useState<"prontuario" | "odontograma" | "documentos">(
    "prontuario",
  );

  // Modal de Criar / Editar Paciente
  const [patientFormMode, setPatientFormMode] = useState<"create" | "edit" | null>(null);
  const [patientForm, setPatientForm] = useState({
    name: "",
    phone: "",
    cpf: "",
    birth_date: "",
    email: "",
    insurance: "PARTICULAR",
    neighborhood: "",
    city: "Macapá",
    medical_warning: "",
  });

  // Nova evolução clínica
  const [newEvolutionText, setNewEvolutionText] = useState("");

  // Carregar paciente vindo da Agenda automaticamente
  useEffect(() => {
    if (!initialPatientId) return;
    supabase
      .from("patients")
      .select("*")
      .eq("id", initialPatientId)
      .single()
      .then(({ data: p }) => {
        if (p) {
          setSelectedPatient(p as Patient);
          setActiveTab("prontuario");
        }
        if (onPatientLoaded) onPatientLoaded();
      });
  }, [initialPatientId]);

  function openCreatePatientModal() {
    setPatientForm({
      name: "",
      phone: "",
      cpf: "",
      birth_date: "",
      email: "",
      insurance: "PARTICULAR",
      neighborhood: "",
      city: "Macapá",
      medical_warning: "",
    });
    setPatientFormMode("create");
  }

  function openEditPatientModal(p: Patient) {
    setPatientForm({
      name: p.name || "",
      phone: p.phone || "",
      cpf: p.cpf || "",
      birth_date: p.birth_date || "",
      email: p.email || "",
      insurance: p.insurance || "PARTICULAR",
      neighborhood: p.neighborhood || "",
      city: p.city || "Macapá",
      medical_warning: p.medical_warning || "",
    });
    setPatientFormMode("edit");
  }

  const savePatientMutation = useMutation({
    mutationFn: async () => {
      if (!patientForm.name.trim()) {
        throw new Error("O nome do paciente é obrigatório.");
      }
      const payload = {
        name: patientForm.name.trim(),
        phone: patientForm.phone.trim() || null,
        cpf: patientForm.cpf.trim() || null,
        birth_date: patientForm.birth_date || null,
        email: patientForm.email.trim() || null,
        insurance: patientForm.insurance.trim() || "PARTICULAR",
        neighborhood: patientForm.neighborhood.trim() || null,
        city: patientForm.city.trim() || "Macapá",
        medical_warning: patientForm.medical_warning.trim() || null,
      };

      if (patientFormMode === "edit" && selectedPatient) {
        const { data: updated, error } = await supabase
          .from("patients")
          .update(payload)
          .eq("id", selectedPatient.id)
          .select("*")
          .single();
        if (error) throw error;
        return updated as Patient;
      } else {
        const { data: created, error } = await supabase
          .from("patients")
          .insert({ ...payload, origin: "Painel Clínico" })
          .select("*")
          .single();
        if (error) throw error;
        return created as Patient;
      }
    },
    onSuccess: (saved) => {
      toast.success(
        patientFormMode === "edit"
          ? "Cadastro do paciente atualizado!"
          : "Novo paciente cadastrado com sucesso!",
      );
      setSelectedPatient(saved);
      setPatientFormMode(null);
      queryClient.invalidateQueries({ queryKey: ["patients"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Não foi possível salvar os dados do paciente.");
    },
  });

  // Resetar página quando filtros mudarem
  function handleSearchChange(val: string) {
    setSearch(val);
    setPage(1);
  }

  function handleLetterChange(letter: string) {
    setSelectedLetter(letter);
    setPage(1);
  }

  function handleInsuranceChange(insurance: string) {
    setSelectedInsurance(insurance);
    setPage(1);
  }

  function handleSortChange(sort: typeof sortBy) {
    setSortBy(sort);
    setPage(1);
  }

  function handleToggleWarnings() {
    setOnlyWarnings((prev) => !prev);
    setPage(1);
  }

  function clearAllFilters() {
    setSearch("");
    setSelectedInsurance("all");
    setSelectedLetter("Todos");
    setOnlyWarnings(false);
    setSortBy("name_asc");
    setPage(1);
  }

  // Buscar lista de pacientes com paginação e contagem exata no Supabase
  const { data, isLoading } = useQuery({
    queryKey: [
      "patients",
      search,
      selectedInsurance,
      selectedLetter,
      onlyWarnings,
      sortBy,
      page,
      pageSize,
    ],
    queryFn: async () => {
      let query = supabase.from("patients").select("*", { count: "exact" });

      if (search.trim()) {
        const term = search.trim();
        const num = parseInt(term.replace("#", ""), 10);
        if (!isNaN(num) && num > 0) {
          query = query.or(
            `name.ilike.%${term}%,cpf.ilike.%${term}%,phone.ilike.%${term}%,record_number.eq.${num},legacy_patient_id.eq.${num}`,
          );
        } else {
          query = query.or(
            `name.ilike.%${term}%,cpf.ilike.%${term}%,phone.ilike.%${term}%,medical_warning.ilike.%${term}%`,
          );
        }
      }

      if (selectedLetter !== "Todos") {
        query = query.ilike("name", `${selectedLetter}%`);
      }

      if (selectedInsurance !== "all") {
        query = query.eq("insurance", selectedInsurance);
      }

      if (onlyWarnings) {
        query = query.not("medical_warning", "is", null).neq("medical_warning", "");
      }

      if (sortBy === "name_asc") {
        query = query.order("name", { ascending: true });
      } else if (sortBy === "name_desc") {
        query = query.order("name", { ascending: false });
      } else if (sortBy === "recent") {
        query = query.order("created_at", { ascending: false });
      } else if (sortBy === "record_num") {
        query = query.order("record_number", { ascending: true, nullsFirst: false });
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data: rows, count, error } = await query;
      if (error) throw error;

      return {
        patients: (rows || []) as Patient[],
        totalCount: count ?? 0,
      };
    },
  });

  const patients = data?.patients ?? [];
  const totalCount = data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // Buscar registros clínicos do paciente selecionado
  const { data: records = [] } = useQuery({
    queryKey: ["clinical_records", selectedPatient?.id],
    enabled: !!selectedPatient?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinical_records")
        .select("*")
        .eq("patient_id", selectedPatient!.id)
        .order("record_date", { ascending: false });
      if (error) throw error;
      return (data || []) as ClinicalRecord[];
    },
  });

  // Buscar consultas agendadas/realizadas deste paciente na Agenda
  const { data: patientAppointments = [] } = useQuery({
    queryKey: ["patient_appointments", selectedPatient?.id],
    enabled: !!selectedPatient?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("id, appointment_date, appointment_time, service_name, status, notes")
        .eq("patient_id", selectedPatient!.id)
        .order("appointment_date", { ascending: false })
        .order("appointment_time", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as PatientAppointment[];
    },
  });

  // Salvar nova evolução clínica
  const addEvolutionMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPatient || !newEvolutionText.trim()) return;
      const { error } = await supabase.from("clinical_records").insert({
        patient_id: selectedPatient.id,
        record_type: "evolucao",
        record_date: new Date().toISOString(),
        title: "Evolução em Consulta",
        content: newEvolutionText.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Evolução clínica registrada no prontuário!");
      setNewEvolutionText("");
      queryClient.invalidateQueries({ queryKey: ["clinical_records", selectedPatient?.id] });
    },
    onError: (err: any) => {
      toast.error(`Erro ao salvar: ${err.message}`);
    },
  });

  const isFiltered =
    search.trim() !== "" ||
    selectedInsurance !== "all" ||
    selectedLetter !== "Todos" ||
    onlyWarnings ||
    sortBy !== "name_asc";

  return (
    <div className="space-y-6">
      {/* Seção Superior de Busca & Filtros */}
      <div className="p-5 rounded-3xl bg-card border border-border shadow-petal space-y-4">
        {/* Linha 1: Input de Busca + Dropdowns de Filtro + Novo Paciente */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar por nome, CPF, WhatsApp, alerta médico ou # prontuário..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full pl-10 pr-9 py-2.5 rounded-2xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {search && (
              <button
                onClick={() => handleSearchChange("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                title="Limpar busca"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filtro de Convênios */}
            <div className="flex items-center gap-1.5 bg-background border border-border rounded-xl px-2.5 py-1.5">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <select
                value={selectedInsurance}
                onChange={(e) => handleInsuranceChange(e.target.value)}
                className="text-xs bg-transparent text-foreground focus:outline-none cursor-pointer"
              >
                <option value="all">Todos os Convênios</option>
                <option value="PARTICULAR">Particular</option>
                <option value="REDE UNNA">Rede Unna</option>
                <option value="ODONTOPREV">Odontoprev</option>
                <option value="BRADESCO">Bradesco Dental</option>
                <option value="AMIL DENTAL">Amil Dental</option>
              </select>
            </div>

            {/* Ordenação */}
            <div className="flex items-center gap-1.5 bg-background border border-border rounded-xl px-2.5 py-1.5">
              <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
              <select
                value={sortBy}
                onChange={(e) => handleSortChange(e.target.value as typeof sortBy)}
                className="text-xs bg-transparent text-foreground focus:outline-none cursor-pointer"
              >
                <option value="name_asc">Nome (A → Z)</option>
                <option value="name_desc">Nome (Z → A)</option>
                <option value="recent">Mais Recentes</option>
                <option value="record_num">Nº Prontuário</option>
              </select>
            </div>

            {/* Botão de Alerta Médico */}
            <button
              onClick={handleToggleWarnings}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-all cursor-pointer",
                onlyWarnings
                  ? "bg-rose-500/15 border-rose-500/40 text-rose-600 dark:text-rose-400 shadow-sm"
                  : "bg-background border-border text-muted-foreground hover:text-foreground",
              )}
              title="Filtrar pacientes com alertas clínicos"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              Com Alerta
            </button>

            {/* Botão Limpar Filtros */}
            {isFiltered && (
              <button
                onClick={clearAllFilters}
                className="px-2.5 py-1.5 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all flex items-center gap-1 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
                Limpar
              </button>
            )}

            {/* Botão Novo Paciente */}
            <button
              onClick={openCreatePatientModal}
              className="px-3.5 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold flex items-center gap-1.5 shadow-sm hover:bg-primary-deep transition-all cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              Novo Paciente
            </button>
          </div>
        </div>

        {/* Linha 2: Barra Alfabética A–Z (Índice Rápido estilo Clinicorp) */}
        <div className="pt-2 border-t border-border/50">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mr-1 shrink-0">
              Índice:
            </span>
            {ALPHABET.map((letter) => {
              const isSelected = selectedLetter === letter;
              return (
                <button
                  key={letter}
                  onClick={() => handleLetterChange(letter)}
                  className={cn(
                    "min-w-[28px] h-7 px-2 rounded-lg text-xs font-semibold transition-all shrink-0 cursor-pointer flex items-center justify-center",
                    isSelected
                      ? "bg-primary text-primary-foreground shadow-sm scale-105"
                      : "bg-background/80 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/60",
                  )}
                >
                  {letter}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Coluna da Esquerda: Lista de Pacientes (5 colunas) */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between px-2">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {isLoading
                ? "Buscando..."
                : totalCount === 0
                  ? "Nenhum paciente"
                  : `${totalCount} ${totalCount === 1 ? "paciente" : "pacientes"}${
                      selectedLetter !== "Todos" ? ` com a letra "${selectedLetter}"` : ""
                    }`}
            </span>
            {totalCount > 0 && (
              <span className="text-xs text-muted-foreground font-mono">
                Página {page} de {totalPages}
              </span>
            )}
          </div>

          <div className="divide-y divide-border/60 rounded-3xl border border-border bg-card shadow-petal max-h-[640px] overflow-y-auto">
            {patients.length === 0 && !isLoading && (
              <div className="p-10 text-center space-y-3">
                <p className="text-sm text-muted-foreground">
                  Nenhum paciente encontrado para esses filtros.
                </p>
                {isFiltered && (
                  <button
                    onClick={clearAllFilters}
                    className="px-4 py-2 text-xs font-semibold rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-all cursor-pointer"
                  >
                    Mostrar todos os pacientes
                  </button>
                )}
              </div>
            )}

            {patients.map((patient) => {
              const isSelected = selectedPatient?.id === patient.id;
              return (
                <button
                  key={patient.id}
                  onClick={() => setSelectedPatient(patient)}
                  className={cn(
                    "w-full text-left p-4 transition-all flex items-center justify-between cursor-pointer",
                    isSelected ? "bg-primary/10 border-l-4 border-l-primary" : "hover:bg-muted/40",
                  )}
                >
                  <div className="space-y-1 min-w-0 pr-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-muted-foreground">
                        #{patient.record_number || patient.id.slice(0, 4)}
                      </span>
                      <span className="text-sm font-semibold text-foreground truncate block">
                        {patient.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                      {patient.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {patient.phone}
                        </span>
                      )}
                      {patient.birth_date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(patient.birth_date + "T12:00:00").toLocaleDateString("pt-BR")}
                        </span>
                      )}
                      {patient.insurance && (
                        <span className="px-1.5 py-0.5 rounded-md bg-muted text-[10px] font-semibold uppercase">
                          {patient.insurance}
                        </span>
                      )}
                    </div>

                    {patient.medical_warning && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 bg-rose-500/10 px-2 py-0.5 rounded-md">
                        <AlertTriangle className="h-3 w-3" />
                        {patient.medical_warning}
                      </span>
                    )}
                  </div>

                  <ChevronRight
                    className={cn(
                      "h-4 w-4 shrink-0 transition-transform",
                      isSelected ? "text-primary translate-x-1" : "text-muted-foreground/40",
                    )}
                  />
                </button>
              );
            })}
          </div>

          {/* Rodapé de Paginação */}
          {totalCount > pageSize && (
            <div className="flex items-center justify-between px-2 pt-2 gap-2">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1.5 rounded-xl border border-border text-xs font-semibold text-foreground bg-background hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer transition-all"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Anterior
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 rounded-xl border border-border text-xs font-semibold text-foreground bg-background hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer transition-all"
                >
                  Próxima
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>Por página:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="text-xs p-1 rounded-lg border border-border bg-background text-foreground cursor-pointer focus:outline-none"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Coluna da Direita: Visão 360º do Paciente Selecionado (7 colunas) */}
        <div className="lg:col-span-7">
          {selectedPatient ? (
            <div className="space-y-6">
              {/* Header do Paciente */}
              <div className="p-6 rounded-3xl bg-card border border-border shadow-petal space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="text-xs font-mono font-bold text-primary uppercase tracking-wider">
                      Prontuário #{selectedPatient.record_number}
                    </span>
                    <h3 className="font-display text-2xl text-foreground">
                      {selectedPatient.name}
                    </h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {selectedPatient.insurance && (
                      <span className="text-xs font-semibold px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
                        {selectedPatient.insurance}
                      </span>
                    )}
                    <button
                      onClick={() => openEditPatientModal(selectedPatient)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border bg-background text-xs font-semibold text-foreground hover:bg-muted transition-all cursor-pointer"
                    >
                      <Edit className="h-3.5 w-3.5 text-primary" />
                      <span>Editar Dados / Alerta</span>
                    </button>
                    <button
                      onClick={() => setShowAppointmentModal(true)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-primary text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary-deep transition-all cursor-pointer"
                    >
                      <Calendar className="h-3.5 w-3.5" />
                      <span>Agendar Consulta</span>
                    </button>
                  </div>
                </div>

                {/* Dados resumidos em cards pequenos */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-muted/40 border border-border/60">
                    <span className="text-[10px] uppercase text-muted-foreground block">
                      Telefone
                    </span>
                    <span className="font-semibold text-foreground">
                      {selectedPatient.phone || "—"}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-muted/40 border border-border/60">
                    <span className="text-[10px] uppercase text-muted-foreground block">CPF</span>
                    <span className="font-semibold text-foreground">
                      {selectedPatient.cpf || "—"}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-muted/40 border border-border/60">
                    <span className="text-[10px] uppercase text-muted-foreground block">
                      Nascimento
                    </span>
                    <span className="font-semibold text-foreground">
                      {selectedPatient.birth_date
                        ? new Date(selectedPatient.birth_date + "T12:00:00").toLocaleDateString(
                            "pt-BR",
                          )
                        : "—"}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-muted/40 border border-border/60">
                    <span className="text-[10px] uppercase text-muted-foreground block">
                      Cidade / UF
                    </span>
                    <span className="font-semibold text-foreground">
                      {selectedPatient.neighborhood ? `${selectedPatient.neighborhood}, ` : ""}
                      {selectedPatient.city || "Macapá"}
                    </span>
                  </div>
                </div>

                {/* Alerta Médico em Destaque */}
                {selectedPatient.medical_warning && (
                  <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs font-semibold text-rose-700 dark:text-rose-300">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
                      <span>Alerta Clínico: {selectedPatient.medical_warning}</span>
                    </div>
                    <button
                      onClick={() => openEditPatientModal(selectedPatient)}
                      className="text-[11px] underline hover:opacity-80 cursor-pointer shrink-0"
                    >
                      Alterar
                    </button>
                  </div>
                )}

                {/* Navegação entre Tabs Clínicas */}
                <div className="flex flex-wrap items-center gap-3 border-b border-border pt-2">
                  <button
                    onClick={() => setActiveTab("prontuario")}
                    className={cn(
                      "pb-2.5 text-xs font-semibold tracking-tight border-b-2 transition-all cursor-pointer flex items-center gap-1.5",
                      activeTab === "prontuario"
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Prontuário & Consultas ({records.length + patientAppointments.length})
                  </button>

                  <button
                    onClick={() => setActiveTab("odontograma")}
                    className={cn(
                      "pb-2.5 text-xs font-semibold tracking-tight border-b-2 transition-all cursor-pointer flex items-center gap-1.5",
                      activeTab === "odontograma"
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Smile className="h-3.5 w-3.5" />
                    Odontograma
                  </button>

                  <button
                    onClick={() => setActiveTab("documentos")}
                    className={cn(
                      "pb-2.5 text-xs font-semibold tracking-tight border-b-2 transition-all cursor-pointer flex items-center gap-1.5",
                      activeTab === "documentos"
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Receitas & Atestados PDF
                  </button>
                </div>
              </div>

              {/* Conteúdo da Tab Ativa */}
              {activeTab === "prontuario" && (
                <div className="space-y-5">
                  {/* Campo para Registrar Nova Evolução */}
                  <div className="p-5 rounded-3xl bg-card border border-border shadow-petal space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                        <Plus className="h-4 w-4 text-primary" />
                        Registrar Evolução Clínica / Anamnese
                      </h4>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setNewEvolutionText(
                              "• Suas gengivas sangram facilmente? \n• Há retenção de alimentos entre os dentes? \n• Seus dentes são sensíveis? \n• Já teve reação alérgica a algum medicamento? \n• Já teve reação alérgica a algum alimento? \n• Morde lápis/caneta ou rói unhas? \n• Está grávida? \n• Enfermidades (Diabetes, Cardíaco, Asma, Hipertensão, Renal): \n• Faz uso de algum medicamento contínuo? ",
                            )
                          }
                          className="px-2.5 py-1 rounded-lg border border-primary/25 bg-primary/5 hover:bg-primary/15 text-[11px] font-semibold text-primary transition-colors cursor-pointer"
                        >
                          + Modelo Anamnese
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setNewEvolutionText(
                              "Sintomas relatados:\n\nProcedimento executado:\n\nMedicação prescrita / Orientações:\n\nDiagnóstico / Próxima sessão:",
                            )
                          }
                          className="px-2.5 py-1 rounded-lg border border-primary/25 bg-primary/5 hover:bg-primary/15 text-[11px] font-semibold text-primary transition-colors cursor-pointer"
                        >
                          + Atendimento Clínico
                        </button>
                      </div>
                    </div>
                    <textarea
                      rows={4}
                      placeholder="Descreva o procedimento executado, queixas do paciente, anestésicos utilizados, orientações..."
                      value={newEvolutionText}
                      onChange={(e) => setNewEvolutionText(e.target.value)}
                      className="w-full p-3 rounded-2xl border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <div className="flex justify-end">
                      <button
                        onClick={() => addEvolutionMutation.mutate()}
                        disabled={addEvolutionMutation.isPending || !newEvolutionText.trim()}
                        className="text-xs font-semibold px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all cursor-pointer disabled:opacity-50"
                      >
                        Salvar no Prontuário
                      </button>
                    </div>
                  </div>

                  {/* Consultas na Agenda (Próximas e Passadas) */}
                  {patientAppointments.length > 0 && (
                    <div className="space-y-2.5">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-2 flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-primary" />
                        Consultas na Agenda ({patientAppointments.length})
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {patientAppointments.slice(0, 8).map((appt) => (
                          <div
                            key={appt.id}
                            className="p-3.5 rounded-2xl bg-card border border-border shadow-sm flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                                <span>
                                  {new Date(appt.appointment_date + "T12:00:00").toLocaleDateString(
                                    "pt-BR",
                                  )}
                                </span>
                                <span className="text-primary font-mono">
                                  às {trimSeconds(appt.appointment_time)}
                                </span>
                              </div>
                              <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                                {appt.service_name}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span
                                className={cn(
                                  "text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border",
                                  appt.status === "confirmed"
                                    ? "text-emerald-800 bg-emerald-500/15 border-emerald-600/30"
                                    : appt.status === "pending"
                                      ? "text-amber-800 bg-amber-500/15 border-amber-500/30"
                                      : appt.status === "completed"
                                        ? "text-primary bg-primary/10 border-primary/25"
                                        : "text-muted-foreground bg-muted border-border",
                                )}
                              >
                                {STATUS_LABELS[appt.status]}
                              </span>
                              <button
                                type="button"
                                onClick={async () => {
                                  const { error } = await supabase
                                    .from("appointments")
                                    .delete()
                                    .eq("id", appt.id);
                                  if (error) {
                                    toast.error("Não foi possível excluir o agendamento.");
                                    return;
                                  }
                                  toast.success("Agendamento excluído.");
                                  queryClient.invalidateQueries({
                                    queryKey: ["patient_appointments", selectedPatient?.id],
                                  });
                                  queryClient.invalidateQueries({ queryKey: ["appointments"] });
                                }}
                                title="Excluir este agendamento"
                                className="p-1 rounded-lg text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10 transition-colors cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Linha do Tempo de Registros Clínicos / Anamneses */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-2">
                      Evoluções & Fichas de Anamnese ({records.length})
                    </h4>

                    {records.length === 0 ? (
                      <div className="p-8 rounded-3xl border border-border bg-card text-center text-xs text-muted-foreground">
                        Nenhuma evolução ou ficha clínica registrada ainda para este paciente.
                      </div>
                    ) : (
                      records.map((r) => (
                        <div
                          key={r.id}
                          className="p-5 rounded-2xl bg-card border border-border shadow-sm space-y-2"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-foreground flex items-center gap-1.5">
                              <Clock className="h-3.5 w-3.5 text-primary" />
                              {r.title || "Evolução Clínica"}
                            </span>
                            <span className="text-muted-foreground font-mono text-[11px]">
                              {new Date(r.record_date).toLocaleDateString("pt-BR", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground whitespace-pre-line leading-relaxed">
                            {r.content}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {activeTab === "odontograma" && (
                <OdontogramView patientId={selectedPatient.id} patientName={selectedPatient.name} />
              )}

              {activeTab === "documentos" && (
                <DocumentGenerator
                  patientId={selectedPatient.id}
                  patientName={selectedPatient.name}
                  patientCpf={selectedPatient.cpf || undefined}
                />
              )}
            </div>
          ) : (
            <div className="h-full min-h-[400px] flex flex-col items-center justify-center p-10 rounded-3xl border border-dashed border-border bg-card/40 text-center">
              <User className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <h4 className="font-display text-xl text-foreground">Selecione um Paciente</h4>
              <p className="text-xs text-muted-foreground max-w-sm mt-1">
                Escolha um paciente da lista ao lado para acessar seu prontuário eletrônico,
                odontograma interativo, histórico de consultas e emitir receitas ou atestados.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Modal de Criar / Editar Paciente */}
      {patientFormMode && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-primary-deep/40 p-4 backdrop-blur-sm"
          onClick={() => setPatientFormMode(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl rounded-3xl bg-card border border-border p-7 shadow-bloom space-y-5 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="font-display text-2xl text-foreground">
                  {patientFormMode === "edit" ? "Editar Cadastro do Paciente" : "Novo Paciente"}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Preencha os dados cadastrais e alertas clínicos de anamnese.
                </p>
              </div>
              <button
                onClick={() => setPatientFormMode(null)}
                className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
              <div className="sm:col-span-2 space-y-1">
                <label className="font-semibold text-foreground">Nome Completo *</label>
                <input
                  type="text"
                  value={patientForm.name}
                  onChange={(e) => setPatientForm({ ...patientForm, name: e.target.value })}
                  placeholder="Nome completo do paciente"
                  className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">Telefone / WhatsApp</label>
                <input
                  type="text"
                  value={patientForm.phone}
                  onChange={(e) => setPatientForm({ ...patientForm, phone: e.target.value })}
                  placeholder="(96) 99100-0000"
                  className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">CPF</label>
                <input
                  type="text"
                  value={patientForm.cpf}
                  onChange={(e) => setPatientForm({ ...patientForm, cpf: e.target.value })}
                  placeholder="000.000.000-00"
                  className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">Data de Nascimento</label>
                <input
                  type="date"
                  value={patientForm.birth_date}
                  onChange={(e) => setPatientForm({ ...patientForm, birth_date: e.target.value })}
                  className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">Convênio / Plano</label>
                <select
                  value={patientForm.insurance}
                  onChange={(e) => setPatientForm({ ...patientForm, insurance: e.target.value })}
                  className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="PARTICULAR">Particular</option>
                  <option value="REDE UNNA">Rede Unna</option>
                  <option value="ODONTOPREV">Odontoprev</option>
                  <option value="BRADESCO">Bradesco Dental</option>
                  <option value="AMIL DENTAL">Amil Dental</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">Bairro</label>
                <input
                  type="text"
                  value={patientForm.neighborhood}
                  onChange={(e) => setPatientForm({ ...patientForm, neighborhood: e.target.value })}
                  placeholder="Ex: Central, Trem, Buritizal..."
                  className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">E-mail</label>
                <input
                  type="email"
                  value={patientForm.email}
                  onChange={(e) => setPatientForm({ ...patientForm, email: e.target.value })}
                  placeholder="paciente@email.com"
                  className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              <div className="sm:col-span-2 space-y-1 pt-1">
                <label className="font-semibold text-rose-600 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Alerta Clínico / Alergias / Condições Sistêmicas
                </label>
                <input
                  type="text"
                  value={patientForm.medical_warning}
                  onChange={(e) =>
                    setPatientForm({ ...patientForm, medical_warning: e.target.value })
                  }
                  placeholder="Ex: Alergia a Dipirona, Hipertenso, Gestante, Pacientes Especiais..."
                  className="w-full rounded-xl border border-rose-500/30 bg-rose-500/5 px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-rose-500/30"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => setPatientFormMode(null)}
                className="px-5 py-2.5 rounded-full border border-border text-xs font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => savePatientMutation.mutate()}
                disabled={savePatientMutation.isPending}
                className="px-6 py-2.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold shadow-sm hover:bg-primary-deep transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {savePatientMutation.isPending ? "Salvando..." : "Salvar Cadastro"}
              </button>
            </div>
          </div>
        </div>
      )}

      <NewAppointmentModal
        open={showAppointmentModal}
        onOpenChange={setShowAppointmentModal}
        defaultPatient={selectedPatient}
        onSuccess={() => {
          queryClient.invalidateQueries({
            queryKey: ["patient_appointments", selectedPatient?.id],
          });
          queryClient.invalidateQueries({ queryKey: ["appointments"] });
        }}
      />
    </div>
  );
}
