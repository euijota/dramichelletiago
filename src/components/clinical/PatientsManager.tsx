import { useState, useEffect, useMemo } from "react";
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
  ChevronRight,
  ChevronLeft,
  Filter,
  ArrowUpDown,
  X,
  Edit,
  CheckCircle2,
  Trash2,
  ArrowLeft,
  Bell,
  DollarSign,
  Camera,
  ClipboardList,
  Stethoscope,
  ShieldCheck,
  FileCheck,
  Receipt,
  Sparkles,
  MessageCircle,
  ArrowRight,
  Layers,
  Check,
  Printer,
} from "lucide-react";
import { OdontogramView } from "./OdontogramView";
import { DocumentGenerator } from "./DocumentGenerator";
import { NewAppointmentModal } from "./NewAppointmentModal";
import { STATUS_LABELS, trimSeconds } from "@/lib/clinic";
import { cn } from "@/lib/utils";

export interface Patient {
  id: string;
  legacy_patient_id?: number | null;
  record_number: number;
  name: string;
  nickname?: string | null;
  phone: string | null;
  phone2?: string | null;
  email: string | null;
  cpf: string | null;
  rg?: string | null;
  birth_date: string | null;
  gender: string | null;
  marital_status?: string | null;
  profession?: string | null;
  origin?: string | null;
  insurance: string | null;
  insurance_number: string | null;
  medical_warning: string | null;
  postal_code?: string | null;
  address: string | null;
  address_number?: string | null;
  address_extra?: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  notes?: string | null;
  return_alert_date?: string | null;
  return_alert_notes?: string | null;
  funnel_stage?: string | null;
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

type ClinicorpTab =
  | "visao_geral"
  | "orcamentos"
  | "financeiro"
  | "fotos"
  | "plano_ficha"
  | "fichas_especialidades"
  | "odontograma"
  | "anamnese"
  | "planos"
  | "documentos"
  | "exames"
  | "recibos"
  | "agendamentos";

const CLINICORP_TABS: { id: ClinicorpTab; label: string }[] = [
  { id: "visao_geral", label: "Visão Geral" },
  { id: "orcamentos", label: "Orçamentos" },
  { id: "financeiro", label: "Financeiro" },
  { id: "fotos", label: "Fotos" },
  { id: "plano_ficha", label: "Plano e Ficha Clínica" },
  { id: "fichas_especialidades", label: "Fichas Especialidades" },
  { id: "odontograma", label: "Odontograma" },
  { id: "anamnese", label: "Anamnese" },
  { id: "planos", label: "Planos" },
  { id: "documentos", label: "Documentos" },
  { id: "exames", label: "Exames" },
  { id: "recibos", label: "Recibos" },
  { id: "agendamentos", label: "Agendamentos" },
];

const FUNNEL_STAGES = [
  {
    id: "all",
    label: "Todos os Pacientes",
    badge: "Base Completa",
    tone: "bg-primary/10 text-primary border-primary/25",
  },
  {
    id: "triagem",
    label: "Novos / 1ª Consulta",
    badge: "Aguardando Avaliação",
    tone: "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30",
  },
  {
    id: "anamnese",
    label: "Anamnese Preenchida",
    badge: "Ficha de Saúde OK",
    tone: "bg-indigo-500/15 text-indigo-800 dark:text-indigo-300 border-indigo-500/30",
  },
  {
    id: "orcamento",
    label: "Orçamento em Aberto",
    badge: "Em Negociação",
    tone: "bg-orange-500/15 text-orange-800 dark:text-orange-300 border-orange-500/30",
  },
  {
    id: "tratamento",
    label: "Em Tratamento Ativo",
    badge: "Paciente Ativo",
    tone: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/30",
  },
];

const SPECIALTY_TEMPLATES: Record<string, { label: string; template: string }> = {
  endodontia: {
    label: "Ficha de Endodontia",
    template:
      "Dente: \nDiagnóstico Pulpar / Periapical: \nTeste de Sensibilidade: \nComprimento de Trabalho (CAD / CRD / CRT): \nInstrumentação / Limas utilizadas: \nMedicação Intracanal: \nObturação (Cimento / Técnica): \nObservações pós-operatórias:",
  },
  ortodontia: {
    label: "Ficha de Ortodontia / Alinhadores",
    template:
      "Classificação de Angle (Classe I / II / III): \nPadrão Facial / Perfil: \nArco Superior (Fio / Alinhador nº): \nArco Inferior (Fio / Alinhador nº): \nElásticos intermaxilares: \nHigiene Bucal (Boa / Regular / Deficiente): \nConduta na próxima manutenção:",
  },
  protese: {
    label: "Ficha de Prótese / Reabilitação",
    template:
      "Tipo de Prótese (Coroa / Faceta / PPR / Total / Sobre Implante): \nDentes envolvidos: \nEscala de Cor (Vita): \nMoldagem / Escaneamento: \nLaboratório / Protético: \nProva de estrutura / Ajuste oclusal: \nCimentação (Cimento utilizado):",
  },
  hof: {
    label: "Ficha de Harmonização Orofacial (HOF)",
    template:
      "Procedimento (Toxina Botulínica / Preenchimento / Bioestimulador): \nProduto / Marca / Lote / Validade: \nDiluição / Volume total aplicado: \nPontos e doses por região facial: \nOrientações pós-procedimento entregues: \nData do retorno de 15 dias:",
  },
  odontopediatria: {
    label: "Ficha de Odontopediatria",
    template:
      "Comportamento da criança (Colaborador / Ansioso / Choro): \nResponsável acompanhante: \nDieta cariogênica / Hábitos (Chupeta / Mamadeira / Bruxismo infantil): \nAplicação tópica de flúor / Selante: \nProcedimento realizado: \nOrientação de escovação aos pais:",
  },
  periodontia: {
    label: "Ficha de Periodontia (PSR / Raspagem)",
    template:
      "Índice de Placa / Sangramento Gengival: \nPresença de Cálculo (Supragengival / Subgengival): \nBolsas periodontais / Mobilidade dentária: \nRaspagem e Alisamento Radicular (Sextantes): \nProfilaxia / Jato de Bicarbonato: \nManutenção periodontal recomendada em:",
  },
};

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
  hideTopBar?: boolean;
  onSelectedPatientChange?: (patient: Patient | null) => void;
}

export function PatientsManager({
  initialPatientId,
  onPatientLoaded,
  hideTopBar = false,
  onSelectedPatientChange,
}: PatientsManagerProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [quickJumpSearch, setQuickJumpSearch] = useState("");
  const [selectedInsurance, setSelectedInsurance] = useState<string>("all");
  const [selectedFunnelStage, setSelectedFunnelStage] = useState<string>("all");
  const [selectedLetter, setSelectedLetter] = useState<string>("Todos");
  const [onlyWarnings, setOnlyWarnings] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<"name_asc" | "name_desc" | "recent" | "record_num">(
    "name_asc",
  );
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [activeTab, setActiveTab] = useState<ClinicorpTab>("visao_geral");
  const [infoSubTab, setInfoSubTab] = useState<"cadastro" | "contato" | "complemento">("cadastro");

  // Modais específicos do Clinicorp
  const [patientFormMode, setPatientFormMode] = useState<"create" | "edit" | null>(null);
  const [showReturnAlertModal, setShowReturnAlertModal] = useState(false);
  const [returnAlertForm, setReturnAlertForm] = useState({ date: "", notes: "" });

  const [showGeneralNoteModal, setShowGeneralNoteModal] = useState(false);
  const [generalNoteText, setGeneralNoteText] = useState("");

  // Orçamentos state
  const [budgetForm, setBudgetForm] = useState({
    description: "",
    tooth: "",
    amount: "",
    paymentForm: "PIX / À vista",
    status: "Aberto",
  });

  // Financeiro state
  const [financeForm, setFinanceForm] = useState({
    description: "",
    amount: "",
    method: "PIX",
    status: "Pago",
  });

  // Plano e Ficha Clínica state
  const [newEvolutionText, setNewEvolutionText] = useState("");
  const [newEvolutionTitle, setNewEvolutionTitle] = useState("Evolução em Consulta");

  // Fichas Especialidades state
  const [selectedSpecialty, setSelectedSpecialty] = useState<string>("endodontia");
  const [specialtyText, setSpecialtyText] = useState(SPECIALTY_TEMPLATES.endodontia.template);

  // Anamnese estruturada state (Perguntas Oficiais do Clinicorp - Dra. Michelle)
  const [anamnesisForm, setAnamnesisForm] = useState({
    reasonForVisit: "",
    lastDentalTreatment: "",
    medicalTreatment: "Não",
    medicalTreatmentDetails: "",
    takingMedication: "Não",
    continuousMeds: "",
    drugAllergy: "Não",
    drugAllergyDetails: "",
    localAnesthesiaReaction: "Não",
    foodAllergy: "Não",
    foodAllergyDetails: "",
    bleedingGums: "Não",
    foodRetention: "Não",
    sensitivity: "Não",
    bruxism: "Não",
    habits: "Não",
    habitsDetails: "",
    smoking: "Não",
    smokingDetails: "",
    excessiveBleeding: "Não",
    faintingOrEpilepsy: "Não",
    facialOrTmjPain: "Não",
    normalBloodPressure: "Sim",
    pregnant: "Não",
    pregnantMonth: "",
    previousOrthodontics: "Não",
    smileComplaint: "Não",
    smileComplaintDetails: "",
    systemicConditions: [] as string[],
    notes: "",
  });

  // Fotos & Exames state
  const [photoTitle, setPhotoTitle] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [examTitle, setExamTitle] = useState("");
  const [examNotes, setExamNotes] = useState("");

  const [patientForm, setPatientForm] = useState({
    name: "",
    nickname: "",
    phone: "",
    phone2: "",
    cpf: "",
    rg: "",
    birth_date: "",
    gender: "",
    marital_status: "",
    profession: "",
    email: "",
    origin: "",
    insurance: "PARTICULAR",
    insurance_number: "",
    postal_code: "",
    address: "",
    address_number: "",
    address_extra: "",
    neighborhood: "",
    city: "Macapá",
    state: "AP",
    medical_warning: "",
    notes: "",
    funnel_stage: "tratamento",
  });

  // Notificar barra superior global quando um paciente é aberto ou fechado
  useEffect(() => {
    if (onSelectedPatientChange) {
      onSelectedPatientChange(selectedPatient);
    }
  }, [selectedPatient, onSelectedPatientChange]);

  // Carregar paciente vindo da Agenda ou Smartbar automaticamente
  useEffect(() => {
    if (!initialPatientId) {
      return;
    }
    if (initialPatientId === "__close__") {
      setSelectedPatient(null);
      if (onPatientLoaded) onPatientLoaded();
      return;
    }
    supabase
      .from("patients")
      .select("*")
      .eq("id", initialPatientId)
      .single()
      .then(({ data: p }) => {
        if (p) {
          setSelectedPatient(p as Patient);
          setActiveTab("visao_geral");
        }
        if (onPatientLoaded) onPatientLoaded();
      });
  }, [initialPatientId, onPatientLoaded]);

  function openCreatePatientModal() {
    setPatientForm({
      name: "",
      nickname: "",
      phone: "",
      phone2: "",
      cpf: "",
      rg: "",
      birth_date: "",
      gender: "",
      marital_status: "",
      profession: "",
      email: "",
      origin: "",
      insurance: "PARTICULAR",
      insurance_number: "",
      postal_code: "",
      address: "",
      address_number: "",
      address_extra: "",
      neighborhood: "",
      city: "Macapá",
      state: "AP",
      medical_warning: "",
      notes: "",
      funnel_stage: "tratamento",
    });
    setPatientFormMode("create");
  }

  function openEditPatientModal(p: Patient) {
    setPatientForm({
      name: p.name || "",
      nickname: p.nickname || "",
      phone: p.phone || "",
      phone2: p.phone2 || "",
      cpf: p.cpf || "",
      rg: p.rg || "",
      birth_date: p.birth_date || "",
      gender: p.gender || "",
      marital_status: p.marital_status || "",
      profession: p.profession || "",
      email: p.email || "",
      origin: p.origin || "",
      insurance: p.insurance || "PARTICULAR",
      insurance_number: p.insurance_number || "",
      postal_code: p.postal_code || "",
      address: p.address || "",
      address_number: p.address_number || "",
      address_extra: p.address_extra || "",
      neighborhood: p.neighborhood || "",
      city: p.city || "Macapá",
      state: p.state || "AP",
      medical_warning: p.medical_warning || "",
      notes: p.notes || "",
      funnel_stage: p.funnel_stage || "tratamento",
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
        nickname: patientForm.nickname.trim() || null,
        phone: patientForm.phone.trim() || null,
        phone2: patientForm.phone2.trim() || null,
        cpf: patientForm.cpf.trim() || null,
        rg: patientForm.rg.trim() || null,
        birth_date: patientForm.birth_date || null,
        gender: patientForm.gender || null,
        marital_status: patientForm.marital_status || null,
        profession: patientForm.profession.trim() || null,
        email: patientForm.email.trim() || null,
        origin: patientForm.origin.trim() || null,
        insurance: patientForm.insurance.trim() || "PARTICULAR",
        insurance_number: patientForm.insurance_number.trim() || null,
        postal_code: patientForm.postal_code.trim() || null,
        address: patientForm.address.trim() || null,
        address_number: patientForm.address_number.trim() || null,
        address_extra: patientForm.address_extra.trim() || null,
        neighborhood: patientForm.neighborhood.trim() || null,
        city: patientForm.city.trim() || "Macapá",
        state: patientForm.state.trim() || "AP",
        medical_warning: patientForm.medical_warning.trim() || null,
        notes: patientForm.notes.trim() || null,
        funnel_stage: patientForm.funnel_stage || "tratamento",
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
          .insert(payload)
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
      queryClient.invalidateQueries({ queryKey: ["funnel_counts"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Não foi possível salvar os dados do paciente.");
    },
  });

  const updateFunnelStageMutation = useMutation({
    mutationFn: async ({ patientId, stage }: { patientId: string; stage: string }) => {
      const { data: updated, error } = await supabase
        .from("patients")
        .update({ funnel_stage: stage })
        .eq("id", patientId)
        .select("*")
        .single();
      if (error) throw error;
      return updated as Patient;
    },
    onSuccess: (updated) => {
      setSelectedPatient(updated);
      toast.success("Status do paciente atualizado!");
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      queryClient.invalidateQueries({ queryKey: ["funnel_counts"] });
    },
  });

  // Salvar Alerta de Retorno
  const saveReturnAlertMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPatient) return;
      const { data: updated, error } = await supabase
        .from("patients")
        .update({
          return_alert_date: returnAlertForm.date || null,
          return_alert_notes: returnAlertForm.notes.trim() || null,
        })
        .eq("id", selectedPatient.id)
        .select("*")
        .single();
      if (error) throw error;
      return updated as Patient;
    },
    onSuccess: (updated) => {
      if (updated) setSelectedPatient(updated);
      setShowReturnAlertModal(false);
      toast.success("Alerta de retorno atualizado!");
      queryClient.invalidateQueries({ queryKey: ["patients"] });
    },
  });

  // Contadores do Funil (Triagem Consultório.me -> Clinicorp)
  const { data: funnelCounts = { all: 0, triagem: 0, anamnese: 0, orcamento: 0, tratamento: 0 } } =
    useQuery({
      queryKey: ["funnel_counts"],
      queryFn: async () => {
        const [allRes, triRes, anaRes, orcRes, traRes] = await Promise.all([
          supabase.from("patients").select("id", { count: "exact", head: true }),
          supabase
            .from("patients")
            .select("id", { count: "exact", head: true })
            .eq("funnel_stage", "triagem"),
          supabase
            .from("patients")
            .select("id", { count: "exact", head: true })
            .eq("funnel_stage", "anamnese"),
          supabase
            .from("patients")
            .select("id", { count: "exact", head: true })
            .eq("funnel_stage", "orcamento"),
          supabase
            .from("patients")
            .select("id", { count: "exact", head: true })
            .eq("funnel_stage", "tratamento"),
        ]);
        return {
          all: allRes.count ?? 0,
          triagem: triRes.count ?? 0,
          anamnese: anaRes.count ?? 0,
          orcamento: orcRes.count ?? 0,
          tratamento: traRes.count ?? 0,
        };
      },
    });

  // Busca rápida global estilo Smartbar Clinicorp ("Encontre pacientes ou funções do sistema")
  const { data: quickJumpResults = [] } = useQuery({
    queryKey: ["patients_quick_jump", quickJumpSearch],
    enabled: quickJumpSearch.trim().length >= 2,
    queryFn: async () => {
      const term = quickJumpSearch.trim();
      const { data } = await supabase
        .from("patients")
        .select("*")
        .or(`name.ilike.%${term}%,cpf.ilike.%${term}%,phone.ilike.%${term}%`)
        .order("name")
        .limit(8);
      return (data || []) as Patient[];
    },
  });

  // Buscar lista de pacientes com paginação e contagem exata
  const { data, isLoading } = useQuery({
    queryKey: [
      "patients",
      search,
      selectedInsurance,
      selectedFunnelStage,
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

      if (selectedFunnelStage !== "all") {
        query = query.eq("funnel_stage", selectedFunnelStage);
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

  // Buscar consultas agendadas/realizadas deste paciente
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

  // Categorizar os registros clínicos para cada aba do Clinicorp
  const categorizedRecords = useMemo(() => {
    const anamneses = records.filter((r) => r.record_type === "formulario");
    const evolutions = records.filter(
      (r) => r.record_type === "evolucao" || r.record_type === "sinais_vitais",
    );
    const specialtySheets = records.filter((r) => r.record_type === "ficha_especialidade");
    const budgets = records.filter((r) => r.record_type === "orcamento");
    const payments = records.filter((r) => r.record_type === "pagamento");
    const documents = records.filter(
      (r) => r.record_type === "receita" || r.record_type === "atestado",
    );
    const photos = records.filter((r) => r.record_type === "foto");
    const exams = records.filter((r) => r.record_type === "exame");
    const generalNotes = records.filter((r) => r.record_type === "nota_geral");

    return {
      anamneses,
      evolutions,
      specialtySheets,
      budgets,
      payments,
      documents,
      photos,
      exams,
      generalNotes,
    };
  }, [records]);

  const todayISO = new Date().toISOString().split("T")[0];
  const nextAppointment = useMemo(() => {
    const upcoming = patientAppointments
      .filter((a) => a.appointment_date >= todayISO && a.status !== "cancelled")
      .sort((a, b) =>
        `${a.appointment_date}_${a.appointment_time}`.localeCompare(
          `${b.appointment_date}_${b.appointment_time}`,
        ),
      );
    return upcoming[0] || null;
  }, [patientAppointments, todayISO]);

  // Mutação genérica para criar qualquer registro clínico nas abas do Clinicorp
  const createClinicalRecordMutation = useMutation({
    mutationFn: async (payload: {
      record_type: string;
      title: string;
      content: string;
      promoteStage?: string;
    }) => {
      if (!selectedPatient) return;
      const { error } = await supabase.from("clinical_records").insert({
        patient_id: selectedPatient.id,
        record_type: payload.record_type,
        record_date: new Date().toISOString(),
        title: payload.title,
        content: payload.content,
      });
      if (error) throw error;

      if (payload.promoteStage && selectedPatient.funnel_stage !== "tratamento") {
        const { data: updated } = await supabase
          .from("patients")
          .update({ funnel_stage: payload.promoteStage })
          .eq("id", selectedPatient.id)
          .select("*")
          .single();
        if (updated) setSelectedPatient(updated as Patient);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clinical_records", selectedPatient?.id] });
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      queryClient.invalidateQueries({ queryKey: ["funnel_counts"] });
    },
    onError: (err: Error) => {
      toast.error(`Erro ao salvar registro: ${err.message}`);
    },
  });

  const deleteClinicalRecordMutation = useMutation({
    mutationFn: async (recordId: string) => {
      const { error } = await supabase.from("clinical_records").delete().eq("id", recordId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Registro removido.");
      queryClient.invalidateQueries({ queryKey: ["clinical_records", selectedPatient?.id] });
    },
  });

  function clearAllFilters() {
    setSearch("");
    setSelectedInsurance("all");
    setSelectedFunnelStage("all");
    setSelectedLetter("Todos");
    setOnlyWarnings(false);
    setSortBy("name_asc");
    setPage(1);
  }

  const isFiltered =
    search.trim() !== "" ||
    selectedInsurance !== "all" ||
    selectedFunnelStage !== "all" ||
    selectedLetter !== "Todos" ||
    onlyWarnings ||
    sortBy !== "name_asc";

  // ============================================================================
  // VISÃO INTERNA DO PACIENTE — LAYOUT IDÊNTICO AO CLINICORP (sistema.clinicorp.com)
  // ============================================================================
  if (selectedPatient) {
    const currentStageObj =
      FUNNEL_STAGES.find((s) => s.id === (selectedPatient.funnel_stage || "triagem")) ||
      FUNNEL_STAGES[1];

    return (
      <div className="space-y-4">
        {!hideTopBar && (
          <div className="rounded-2xl bg-[#262626] text-white px-5 py-3.5 shadow-md flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSelectedPatient(null)}
                className="inline-flex items-center gap-2 text-sm font-medium text-neutral-200 hover:text-white transition-colors cursor-pointer"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Voltar para Pacientes</span>
              </button>
              <span className="text-neutral-600">|</span>
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-mono text-amber-400 font-semibold">
                  #{selectedPatient.record_number}
                </span>
                <span className="text-sm font-bold text-white truncate">
                  {selectedPatient.name}
                </span>
              </div>
            </div>

            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <input
                type="text"
                value={quickJumpSearch}
                onChange={(e) => setQuickJumpSearch(e.target.value)}
                placeholder="Encontre pacientes ou funções do sistema"
                className="w-full rounded-lg bg-white text-neutral-900 pl-10 pr-8 py-2 text-xs font-medium placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              {quickJumpSearch && (
                <button
                  onClick={() => setQuickJumpSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              {quickJumpSearch.trim().length >= 2 && quickJumpResults.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl bg-card border border-border shadow-xl divide-y divide-border overflow-hidden">
                  {quickJumpResults.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setSelectedPatient(p);
                        setQuickJumpSearch("");
                      }}
                      className="w-full px-4 py-2.5 text-left hover:bg-muted flex items-center justify-between text-xs text-foreground cursor-pointer"
                    >
                      <div>
                        <span className="font-bold">#{p.record_number}</span> — {p.name}
                      </div>
                      <span className="text-muted-foreground">{p.phone || p.cpf || ""}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setShowAppointmentModal(true)}
                className="rounded-lg bg-[#e66c2c] hover:bg-[#d45d1e] text-white px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Novo Agendamento</span>
              </button>
            </div>
          </div>
        )}

        {/* IDENTIFICAÇÃO DO PACIENTE ATIVO */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-card border border-border shadow-sm">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedPatient(null)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Voltar para Pacientes</span>
            </button>
            <span className="text-border">|</span>
            <span className="text-xs font-mono font-bold text-[#e66c2c]">
              Prontuário #{selectedPatient.record_number}
            </span>
            <span className="text-sm font-bold text-foreground">{selectedPatient.name}</span>
            {selectedPatient.insurance && (
              <span className="px-2 py-0.5 rounded bg-muted text-[10px] font-semibold uppercase text-foreground">
                {selectedPatient.insurance}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => openEditPatientModal(selectedPatient)}
              className="px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted text-xs font-semibold text-foreground flex items-center gap-1.5 cursor-pointer"
            >
              <Edit className="h-3.5 w-3.5" />
              <span>Editar Cadastro</span>
            </button>
            <button
              onClick={() => setShowAppointmentModal(true)}
              className="px-3.5 py-1.5 rounded-lg bg-[#e66c2c] hover:bg-[#d45d1e] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Agendar Consulta</span>
            </button>
          </div>
        </div>

        {/* ALERTA CLÍNICO (SE EXISTIR) */}
        {selectedPatient.medical_warning && (
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs font-semibold text-rose-700 dark:text-rose-300">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
              <span>Alerta Médico / Anamnese: {selectedPatient.medical_warning}</span>
            </div>
            <button
              onClick={() => openEditPatientModal(selectedPatient)}
              className="underline hover:opacity-80 cursor-pointer"
            >
              Editar alerta
            </button>
          </div>
        )}

        {/* BARRA DE 13 ABAS DO PRONTUÁRIO */}
        <div className="rounded-xl bg-card border border-border px-4 pt-2 shadow-sm overflow-x-auto">
          <div className="flex items-center gap-6 min-w-max">
            {CLINICORP_TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "pb-3 pt-1.5 text-xs font-medium transition-all border-b-2 cursor-pointer whitespace-nowrap",
                    isActive
                      ? "border-[#e66c2c] text-foreground font-semibold"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ====================================================================
            ABA 1: VISÃO GERAL
           ==================================================================== */}
        {activeTab === "visao_geral" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* COLUNA ESQUERDA (4 cols): INFORMAÇÕES DO PACIENTE (Cadastro | Contato | Complemento) */}
            <div className="lg:col-span-4 rounded-2xl bg-card border border-border p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-foreground">Informações do paciente</h3>
                <button
                  onClick={() => openEditPatientModal(selectedPatient)}
                  className="text-xs font-semibold text-[#e66c2c] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Edit className="h-3.5 w-3.5" />
                  <span>Editar</span>
                </button>
              </div>

              {/* Sub-abas: Cadastro | Contato | Complemento */}
              <div className="grid grid-cols-3 rounded-xl bg-muted/60 p-1 text-xs">
                <button
                  onClick={() => setInfoSubTab("cadastro")}
                  className={cn(
                    "py-1.5 rounded-lg font-medium transition-all cursor-pointer",
                    infoSubTab === "cadastro"
                      ? "bg-card text-foreground shadow-sm font-semibold"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Cadastro
                </button>
                <button
                  onClick={() => setInfoSubTab("contato")}
                  className={cn(
                    "py-1.5 rounded-lg font-medium transition-all cursor-pointer",
                    infoSubTab === "contato"
                      ? "bg-card text-foreground shadow-sm font-semibold"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Contato
                </button>
                <button
                  onClick={() => setInfoSubTab("complemento")}
                  className={cn(
                    "py-1.5 rounded-lg font-medium transition-all cursor-pointer",
                    infoSubTab === "complemento"
                      ? "bg-card text-foreground shadow-sm font-semibold"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Complemento
                </button>
              </div>

              {infoSubTab === "cadastro" && (
                <div className="divide-y divide-border/60 text-xs">
                  {[
                    { label: "Apelido", value: selectedPatient.nickname || "-" },
                    {
                      label: "Data de nascimento",
                      value: selectedPatient.birth_date
                        ? new Date(selectedPatient.birth_date + "T12:00:00").toLocaleDateString(
                            "pt-BR",
                          )
                        : "-",
                    },
                    { label: "CPF", value: selectedPatient.cpf || "-" },
                    { label: "RG", value: selectedPatient.rg || "-" },
                    { label: "Estado civil", value: selectedPatient.marital_status || "-" },
                    { label: "Sexo", value: selectedPatient.gender || "-" },
                    { label: "E-mail", value: selectedPatient.email || "-" },
                    { label: "Telefone", value: selectedPatient.phone || "-" },
                    {
                      label: "Como conheceu?",
                      value: selectedPatient.origin || "-",
                    },
                    { label: "Plano", value: selectedPatient.insurance || "-" },
                    { label: "Nº Plano", value: selectedPatient.insurance_number || "-" },
                    {
                      label: "Cadastrado em",
                      value: new Date(selectedPatient.created_at).toLocaleDateString("pt-BR"),
                    },
                    { label: "Observações", value: selectedPatient.notes || "-" },
                  ].map((row) => (
                    <div key={row.label} className="py-2.5 flex items-center justify-between gap-3">
                      <span className="font-semibold text-foreground shrink-0">{row.label}</span>
                      <span className="text-muted-foreground text-right truncate max-w-[60%]">
                        {row.value}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {infoSubTab === "contato" && (
                <div className="divide-y divide-border/60 text-xs">
                  {[
                    { label: "Celular / WhatsApp", value: selectedPatient.phone || "-" },
                    { label: "Telefone Secundário", value: selectedPatient.phone2 || "-" },
                    { label: "E-mail", value: selectedPatient.email || "-" },
                    { label: "CEP", value: selectedPatient.postal_code || "-" },
                    { label: "Endereço", value: selectedPatient.address || "-" },
                    { label: "Número", value: selectedPatient.address_number || "-" },
                    { label: "Complemento", value: selectedPatient.address_extra || "-" },
                    { label: "Bairro", value: selectedPatient.neighborhood || "-" },
                    { label: "Cidade", value: selectedPatient.city || "Macapá" },
                    { label: "UF", value: selectedPatient.state || "AP" },
                  ].map((row) => (
                    <div key={row.label} className="py-2.5 flex items-center justify-between gap-3">
                      <span className="font-semibold text-foreground shrink-0">{row.label}</span>
                      <span className="text-muted-foreground text-right">{row.value}</span>
                    </div>
                  ))}
                  {selectedPatient.phone && (
                    <div className="pt-3">
                      <a
                        href={`https://wa.me/55${selectedPatient.phone.replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full py-2 rounded-lg border border-emerald-600/30 bg-emerald-500/10 text-emerald-700 font-semibold flex items-center justify-center gap-1.5 hover:bg-emerald-500/20 transition-colors"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        <span>Conversar no WhatsApp</span>
                      </a>
                    </div>
                  )}
                </div>
              )}

              {infoSubTab === "complemento" && (
                <div className="divide-y divide-border/60 text-xs">
                  {[
                    { label: "Nº Prontuário", value: `#${selectedPatient.record_number}` },
                    { label: "Status Clínico", value: currentStageObj.label },
                    { label: "Profissão", value: selectedPatient.profession || "-" },
                    {
                      label: "Alerta Clínico",
                      value: selectedPatient.medical_warning || "Sem alertas registrados",
                    },
                    { label: "Responsável / Notas", value: selectedPatient.notes || "-" },
                  ].map((row) => (
                    <div key={row.label} className="py-2.5 flex items-center justify-between gap-3">
                      <span className="font-semibold text-foreground shrink-0">{row.label}</span>
                      <span className="text-muted-foreground text-right">{row.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* COLUNA DIREITA/CENTRO (8 cols): 4 CARDS CLINICORP + NOTAS GERAIS */}
            <div className="lg:col-span-8 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* CARD 1: PRÓXIMO AGENDAMENTO */}
                <div className="rounded-2xl bg-card border border-border p-5 shadow-sm flex flex-col justify-between min-h-[210px]">
                  <h4 className="text-sm font-bold text-foreground">Próximo agendamento</h4>
                  {nextAppointment ? (
                    <div className="my-4 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center gap-3.5">
                      <div className="h-11 w-11 rounded-xl bg-emerald-500/20 text-emerald-700 flex items-center justify-center shrink-0">
                        <Calendar className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-foreground">
                          {new Date(
                            nextAppointment.appointment_date + "T12:00:00",
                          ).toLocaleDateString("pt-BR")}{" "}
                          às {trimSeconds(nextAppointment.appointment_time)}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {nextAppointment.service_name} ({STATUS_LABELS[nextAppointment.status]})
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="my-4 flex items-center gap-3.5">
                      <div className="h-12 w-12 rounded-2xl bg-[#fff3ec] text-[#e66c2c] flex items-center justify-center shrink-0">
                        <Calendar className="h-6 w-6" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-foreground">
                          Sem próximo agendamento
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                          Realize o agendamento de uma nova consulta para este paciente.
                        </p>
                      </div>
                    </div>
                  )}
                  <button
                    onClick={() => setShowAppointmentModal(true)}
                    className="w-full py-2.5 rounded-lg border border-border bg-background hover:bg-muted text-xs font-semibold text-foreground transition-colors cursor-pointer"
                  >
                    Novo Agendamento
                  </button>
                </div>

                {/* CARD 2: ANAMNESE */}
                <div className="rounded-2xl bg-card border border-border p-5 shadow-sm flex flex-col justify-between min-h-[210px]">
                  <h4 className="text-sm font-bold text-foreground">Anamnese</h4>
                  {categorizedRecords.anamneses.length > 0 || selectedPatient.medical_warning ? (
                    <div className="my-4 p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/25 flex items-center gap-3.5">
                      <div className="h-11 w-11 rounded-xl bg-indigo-500/20 text-indigo-700 flex items-center justify-center shrink-0">
                        <ClipboardList className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-foreground">
                          {categorizedRecords.anamneses.length > 0
                            ? `${categorizedRecords.anamneses.length} ficha(s) preenchida(s)`
                            : "Alerta de saúde registrado"}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {selectedPatient.medical_warning ||
                            categorizedRecords.anamneses[0]?.title ||
                            "Questionário de saúde disponível"}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="my-4 flex items-center gap-3.5">
                      <div className="h-12 w-12 rounded-2xl bg-[#fff3ec] text-[#e66c2c] flex items-center justify-center shrink-0">
                        <ClipboardList className="h-6 w-6" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-foreground">Sem anamnese</div>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                          Preencha a anamnese para iniciar o atendimento do paciente.
                        </p>
                      </div>
                    </div>
                  )}
                  <button
                    onClick={() => setActiveTab("anamnese")}
                    className="w-full py-2.5 rounded-lg border border-border bg-background hover:bg-muted text-xs font-semibold text-foreground transition-colors cursor-pointer"
                  >
                    {categorizedRecords.anamneses.length > 0
                      ? "Ver / Atualizar anamnese"
                      : "Preencher anamnese"}
                  </button>
                </div>

                {/* CARD 3: ALERTA DE RETORNO */}
                <div className="rounded-2xl bg-card border border-border p-5 shadow-sm flex flex-col justify-between min-h-[210px]">
                  <h4 className="text-sm font-bold text-foreground">Alerta de retorno</h4>
                  {selectedPatient.return_alert_date ? (
                    <div className="my-4 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="h-11 w-11 rounded-xl bg-amber-500/20 text-amber-700 flex items-center justify-center shrink-0">
                          <Bell className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-foreground">
                            Retorno:{" "}
                            {new Date(
                              selectedPatient.return_alert_date + "T12:00:00",
                            ).toLocaleDateString("pt-BR")}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {selectedPatient.return_alert_notes || "Retorno preventivo programado"}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="my-4 flex items-center gap-3.5">
                      <div className="h-12 w-12 rounded-2xl bg-[#fff3ec] text-[#e66c2c] flex items-center justify-center shrink-0">
                        <Bell className="h-6 w-6" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-foreground">
                          Sem alerta de retorno
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                          Defina um alerta de retorno para lembrar o retorno do paciente.
                        </p>
                      </div>
                    </div>
                  )}
                  <button
                    onClick={() => {
                      setReturnAlertForm({
                        date: selectedPatient.return_alert_date || "",
                        notes: selectedPatient.return_alert_notes || "Retorno preventivo (6 meses)",
                      });
                      setShowReturnAlertModal(true);
                    }}
                    className="w-full py-2.5 rounded-lg border border-border bg-background hover:bg-muted text-xs font-semibold text-foreground transition-colors cursor-pointer"
                  >
                    Novo alerta
                  </button>
                </div>

                {/* CARD 4: ORÇAMENTOS EM ABERTO */}
                <div className="rounded-2xl bg-card border border-border p-5 shadow-sm flex flex-col justify-between min-h-[210px]">
                  <h4 className="text-sm font-bold text-foreground">Orçamentos em aberto</h4>
                  {categorizedRecords.budgets.length > 0 ? (
                    <div className="my-4 p-3.5 rounded-xl bg-orange-500/10 border border-orange-500/25 flex items-center gap-3.5">
                      <div className="h-11 w-11 rounded-xl bg-orange-500/20 text-orange-700 flex items-center justify-center shrink-0">
                        <DollarSign className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-foreground">
                          {categorizedRecords.budgets.length} orçamento(s) registrado(s)
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {categorizedRecords.budgets[0]?.title}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="my-4 flex items-center gap-3.5">
                      <div className="h-12 w-12 rounded-2xl bg-[#fff3ec] text-[#e66c2c] flex items-center justify-center shrink-0">
                        <FileText className="h-6 w-6" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-foreground">
                          Sem orçamentos em aberto
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                          Nenhum orçamento em aberto para acompanhar ou converter em proposta.
                        </p>
                      </div>
                    </div>
                  )}
                  <button
                    onClick={() => setActiveTab("orcamentos")}
                    className="w-full py-2.5 rounded-lg border border-border bg-background hover:bg-muted text-xs font-semibold text-foreground transition-colors cursor-pointer"
                  >
                    Ver orçamentos
                  </button>
                </div>
              </div>

              {/* CARD INFERIOR LARGO: NOTAS GERAIS */}
              <div className="rounded-2xl bg-card border border-border p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-foreground">Notas Gerais</h4>
                  <button
                    onClick={() => {
                      setGeneralNoteText("");
                      setShowGeneralNoteModal(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-border bg-background hover:bg-muted text-xs font-semibold text-foreground transition-colors cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Adicionar nota</span>
                  </button>
                </div>

                {categorizedRecords.generalNotes.length === 0 && !selectedPatient.notes ? (
                  <div className="py-4 flex items-center gap-3.5">
                    <div className="h-12 w-12 rounded-2xl bg-[#fff3ec] text-[#e66c2c] flex items-center justify-center shrink-0">
                      <FileText className="h-6 w-6" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-foreground">Sem notas gerais</div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Registre aqui observações importantes sobre o paciente para manter todas as
                        informações organizadas em um só lugar.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {selectedPatient.notes && (
                      <div className="p-3.5 rounded-xl bg-muted/40 border border-border text-xs">
                        <span className="font-semibold text-foreground block mb-0.5">
                          Observação do Cadastro:
                        </span>
                        <span className="text-muted-foreground">{selectedPatient.notes}</span>
                      </div>
                    )}
                    {categorizedRecords.generalNotes.map((n) => (
                      <div
                        key={n.id}
                        className="p-3.5 rounded-xl bg-muted/30 border border-border flex items-start justify-between gap-3 text-xs"
                      >
                        <div>
                          <div className="font-semibold text-foreground">
                            {new Date(n.record_date).toLocaleDateString("pt-BR")} —{" "}
                            {n.title || "Nota Geral"}
                          </div>
                          <p className="text-muted-foreground mt-1 whitespace-pre-line">
                            {n.content}
                          </p>
                        </div>
                        <button
                          onClick={() => deleteClinicalRecordMutation.mutate(n.id)}
                          className="text-muted-foreground hover:text-rose-600 p-1 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ====================================================================
            ABA 2: ORÇAMENTOS (CRIAR E APROVAR PROPOSTAS / TRATAMENTOS)
           ==================================================================== */}
        {activeTab === "orcamentos" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-5 rounded-2xl bg-card border border-border p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Plus className="h-4 w-4 text-[#e66c2c]" />
                Novo Orçamento / Proposta de Tratamento
              </h3>
              <div className="space-y-3 text-xs">
                <div>
                  <label className="font-semibold text-foreground block mb-1">
                    Procedimento / Plano *
                  </label>
                  <input
                    type="text"
                    value={budgetForm.description}
                    onChange={(e) => setBudgetForm({ ...budgetForm, description: e.target.value })}
                    placeholder="Ex: Restauração em Resina, Clareamento, Prótese, Profilaxia..."
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold text-foreground block mb-1">
                      Dente / Região
                    </label>
                    <input
                      type="text"
                      value={budgetForm.tooth}
                      onChange={(e) => setBudgetForm({ ...budgetForm, tooth: e.target.value })}
                      placeholder="Ex: 24, Arcada Sup..."
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-foreground block mb-1">Valor (R$) *</label>
                    <input
                      type="text"
                      value={budgetForm.amount}
                      onChange={(e) => setBudgetForm({ ...budgetForm, amount: e.target.value })}
                      placeholder="Ex: 350,00"
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold text-foreground block mb-1">
                      Forma de Pagamento
                    </label>
                    <select
                      value={budgetForm.paymentForm}
                      onChange={(e) =>
                        setBudgetForm({ ...budgetForm, paymentForm: e.target.value })
                      }
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                    >
                      <option value="PIX / À vista">PIX / À vista</option>
                      <option value="Cartão de Crédito">Cartão de Crédito</option>
                      <option value="Parcelado">Parcelado</option>
                      <option value="Convênio">Convênio</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-semibold text-foreground block mb-1">Status</label>
                    <select
                      value={budgetForm.status}
                      onChange={(e) => setBudgetForm({ ...budgetForm, status: e.target.value })}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                    >
                      <option value="Aberto">Em Aberto</option>
                      <option value="Aprovado">Aprovado pelo Paciente</option>
                      <option value="Executado">Executado</option>
                    </select>
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (!budgetForm.description.trim()) {
                      toast.error("Informe a descrição do orçamento.");
                      return;
                    }
                    createClinicalRecordMutation.mutate(
                      {
                        record_type: "orcamento",
                        title: `Orçamento [${budgetForm.status}] — ${budgetForm.description}`,
                        content: `Procedimento: ${budgetForm.description}\nDente/Região: ${budgetForm.tooth || "Geral"}\nValor: R$ ${budgetForm.amount || "0,00"}\nForma de Pagamento: ${budgetForm.paymentForm}\nStatus: ${budgetForm.status}`,
                        promoteStage: budgetForm.status === "Aprovado" ? "tratamento" : "orcamento",
                      },
                      {
                        onSuccess: () => {
                          toast.success("Orçamento registrado!");
                          setBudgetForm({
                            description: "",
                            tooth: "",
                            amount: "",
                            paymentForm: "PIX / À vista",
                            status: "Aberto",
                          });
                        },
                      },
                    );
                  }}
                  className="w-full py-2.5 rounded-xl bg-[#e66c2c] hover:bg-[#d45d1e] text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  Salvar Orçamento
                </button>
              </div>
            </div>

            <div className="lg:col-span-7 rounded-2xl bg-card border border-border p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-foreground">
                Orçamentos do Paciente ({categorizedRecords.budgets.length})
              </h3>
              {categorizedRecords.budgets.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  Nenhum orçamento cadastrado ainda para este paciente.
                </div>
              ) : (
                <div className="space-y-3">
                  {categorizedRecords.budgets.map((b) => (
                    <div
                      key={b.id}
                      className="p-4 rounded-xl border border-border bg-background flex items-start justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="font-bold text-foreground">{b.title}</div>
                        <p className="text-muted-foreground whitespace-pre-line">{b.content}</p>
                        <div className="text-[11px] text-muted-foreground font-mono pt-1">
                          Criado em {new Date(b.record_date).toLocaleDateString("pt-BR")}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => {
                            createClinicalRecordMutation.mutate(
                              {
                                record_type: "pagamento",
                                title: `Recebimento de Orçamento — ${b.title?.replace("Orçamento ", "")}`,
                                content: `${b.content}\nStatus Financeiro: Pago / Aprovado`,
                                promoteStage: "tratamento",
                              },
                              {
                                onSuccess: () =>
                                  toast.success(
                                    "Orçamento aprovado e lançado na aba Financeiro e Tratamento!",
                                  ),
                              },
                            );
                          }}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 cursor-pointer"
                        >
                          Aprovar & Lançar Financeiro
                        </button>
                        <button
                          onClick={() => deleteClinicalRecordMutation.mutate(b.id)}
                          className="p-1.5 text-muted-foreground hover:text-rose-600 cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ====================================================================
            ABA 3: FINANCEIRO (PAGAMENTOS E LANÇAMENTOS DO PACIENTE)
           ==================================================================== */}
        {activeTab === "financeiro" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-5 rounded-2xl bg-card border border-border p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-emerald-600" />
                Novo Lançamento Financeiro / Pagamento
              </h3>
              <div className="space-y-3 text-xs">
                <div>
                  <label className="font-semibold text-foreground block mb-1">
                    Descrição / Procedimento *
                  </label>
                  <input
                    type="text"
                    value={financeForm.description}
                    onChange={(e) =>
                      setFinanceForm({ ...financeForm, description: e.target.value })
                    }
                    placeholder="Ex: Consulta Particular, Restauração Dente 24, Limpeza..."
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold text-foreground block mb-1">Valor (R$) *</label>
                    <input
                      type="text"
                      value={financeForm.amount}
                      onChange={(e) => setFinanceForm({ ...financeForm, amount: e.target.value })}
                      placeholder="Ex: 250,00"
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-foreground block mb-1">Meio de Pgto</label>
                    <select
                      value={financeForm.method}
                      onChange={(e) => setFinanceForm({ ...financeForm, method: e.target.value })}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                    >
                      <option value="PIX">PIX</option>
                      <option value="Cartão de Crédito">Cartão de Crédito</option>
                      <option value="Cartão de Débito">Cartão de Débito</option>
                      <option value="Dinheiro">Dinheiro</option>
                      <option value="Convênio">Repasse Convênio</option>
                    </select>
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (!financeForm.description.trim()) {
                      toast.error("Informe a descrição do lançamento.");
                      return;
                    }
                    createClinicalRecordMutation.mutate(
                      {
                        record_type: "pagamento",
                        title: `Pagamento (${financeForm.method}) — R$ ${financeForm.amount || "0,00"}`,
                        content: `Descrição: ${financeForm.description}\nValor: R$ ${financeForm.amount || "0,00"}\nForma de Pagamento: ${financeForm.method}\nStatus: ${financeForm.status}`,
                        promoteStage: "tratamento",
                      },
                      {
                        onSuccess: () => {
                          toast.success("Pagamento registrado no Financeiro do paciente!");
                          setFinanceForm({
                            description: "",
                            amount: "",
                            method: "PIX",
                            status: "Pago",
                          });
                        },
                      },
                    );
                  }}
                  className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  Registrar Recebimento
                </button>
              </div>
            </div>

            <div className="lg:col-span-7 rounded-2xl bg-card border border-border p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-foreground">
                Histórico Financeiro ({categorizedRecords.payments.length})
              </h3>
              {categorizedRecords.payments.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  Nenhum lançamento financeiro para este paciente.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {categorizedRecords.payments.map((pay) => (
                    <div
                      key={pay.id}
                      className="p-4 rounded-xl border border-border bg-background flex items-start justify-between gap-3 text-xs"
                    >
                      <div>
                        <div className="font-bold text-emerald-700 dark:text-emerald-400">
                          {pay.title}
                        </div>
                        <p className="text-muted-foreground whitespace-pre-line mt-1">
                          {pay.content}
                        </p>
                        <div className="text-[11px] font-mono text-muted-foreground mt-1">
                          Data: {new Date(pay.record_date).toLocaleDateString("pt-BR")}
                        </div>
                      </div>
                      <button
                        onClick={() => deleteClinicalRecordMutation.mutate(pay.id)}
                        className="p-1 text-muted-foreground hover:text-rose-600 cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ====================================================================
            ABA 4: FOTOS (GALERIA CLÍNICA ANTES / DEPOIS)
           ==================================================================== */}
        {activeTab === "fotos" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-5 rounded-2xl bg-card border border-border p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Camera className="h-4 w-4 text-[#e66c2c]" />
                Adicionar Foto Clínica / Sorriso
              </h3>
              <div className="space-y-3 text-xs">
                <div>
                  <label className="font-semibold text-foreground block mb-1">
                    Legenda / Etapa do Tratamento *
                  </label>
                  <input
                    type="text"
                    value={photoTitle}
                    onChange={(e) => setPhotoTitle(e.target.value)}
                    placeholder="Ex: Foto Inicial Intraoral, Pós-Clareamento..."
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="font-semibold text-foreground block mb-1">
                    Selecionar Imagem do Computador / Celular
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        if (typeof reader.result === "string") {
                          setPhotoUrl(reader.result);
                        }
                      };
                      reader.readAsDataURL(file);
                    }}
                    className="w-full text-xs"
                  />
                </div>
                <button
                  onClick={() => {
                    if (!photoTitle.trim() && !photoUrl) {
                      toast.error("Informe uma legenda ou selecione uma foto.");
                      return;
                    }
                    createClinicalRecordMutation.mutate(
                      {
                        record_type: "foto",
                        title: photoTitle.trim() || "Foto Clínica",
                        content: photoUrl || "Foto registrada no prontuário",
                      },
                      {
                        onSuccess: () => {
                          toast.success("Foto salva na galeria do paciente!");
                          setPhotoTitle("");
                          setPhotoUrl("");
                        },
                      },
                    );
                  }}
                  className="w-full py-2.5 rounded-xl bg-[#e66c2c] text-white text-xs font-semibold cursor-pointer"
                >
                  Salvar Foto na Ficha
                </button>
              </div>
            </div>
            <div className="lg:col-span-7 rounded-2xl bg-card border border-border p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-foreground">
                Galeria de Fotos do Paciente ({categorizedRecords.photos.length})
              </h3>
              {categorizedRecords.photos.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  Nenhuma foto clínica anexada para este paciente.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {categorizedRecords.photos.map((ph) => (
                    <div
                      key={ph.id}
                      className="rounded-xl border border-border overflow-hidden bg-background p-3 space-y-2"
                    >
                      {ph.content.startsWith("data:image") || ph.content.startsWith("http") ? (
                        <img
                          src={ph.content}
                          alt={ph.title || "Foto clínica"}
                          className="w-full h-44 object-cover rounded-lg"
                        />
                      ) : null}
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-foreground">{ph.title}</span>
                        <button
                          onClick={() => deleteClinicalRecordMutation.mutate(ph.id)}
                          className="text-muted-foreground hover:text-rose-600 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ====================================================================
            ABA 5: PLANO E FICHA CLÍNICA (EVOLUÇÃO DE TRATAMENTO)
           ==================================================================== */}
        {activeTab === "plano_ficha" && (
          <div className="space-y-5">
            <div className="rounded-2xl bg-card border border-border p-5 shadow-sm space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Stethoscope className="h-4 w-4 text-[#e66c2c]" />
                  Novo Item no Plano e Ficha Clínica
                </h3>
                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    {
                      label: "+ Evolução de Consulta",
                      title: "Evolução Clínica",
                      text: "Procedimento executado:\nDente / Região:\nAnestésico / Material utilizado:\nOrientações e conduta para próxima sessão:",
                    },
                    {
                      label: "+ Profilaxia / Limpeza",
                      title: "Profilaxia + Raspagem Periodontal",
                      text: "Realizada evidenciação de placa, raspagem supragengival por ultrassom, polimento coronário com pasta profilática e aplicação tópica de flúor neutro. Orientação de higiene oral e uso de fio dental.",
                    },
                    {
                      label: "+ Restauração em Resina",
                      title: "Restauração Direta em Resina Composta",
                      text: "Dente: \nFaces envolvidas: \nAnestesia infiltrativa + isolamento relativo. Remoção de tecido cariado, condicionamento ácido seletivo, sistema adesivo fotopolimerizável e restauração incremental em resina composta (Cor: ). Ajuste oclusal e acabamento/polimento.",
                    },
                  ].map((tpl) => (
                    <button
                      key={tpl.label}
                      type="button"
                      onClick={() => {
                        setNewEvolutionTitle(tpl.title);
                        setNewEvolutionText(tpl.text);
                      }}
                      className="px-2.5 py-1 rounded-lg border border-border bg-background hover:bg-muted text-[11px] font-semibold text-foreground cursor-pointer"
                    >
                      {tpl.label}
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="text"
                value={newEvolutionTitle}
                onChange={(e) => setNewEvolutionTitle(e.target.value)}
                placeholder="Título do Procedimento / Sessão"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold"
              />
              <textarea
                rows={4}
                value={newEvolutionText}
                onChange={(e) => setNewEvolutionText(e.target.value)}
                placeholder="Descreva o procedimento executado na sessão, dente, materiais, intercorrências e próximo passo do plano..."
                className="w-full rounded-xl border border-border bg-background p-3 text-xs"
              />
              <div className="flex justify-end">
                <button
                  onClick={() => {
                    if (!newEvolutionText.trim()) return;
                    createClinicalRecordMutation.mutate(
                      {
                        record_type: "evolucao",
                        title: newEvolutionTitle.trim() || "Evolução Clínica",
                        content: newEvolutionText.trim(),
                        promoteStage: "tratamento",
                      },
                      {
                        onSuccess: () => {
                          toast.success("Item registrado no Plano e Ficha Clínica!");
                          setNewEvolutionText("");
                        },
                      },
                    );
                  }}
                  className="px-5 py-2 rounded-xl bg-[#e66c2c] hover:bg-[#d45d1e] text-white text-xs font-semibold cursor-pointer"
                >
                  Salvar na Ficha Clínica
                </button>
              </div>
            </div>

            <div className="rounded-2xl bg-card border border-border p-5 shadow-sm space-y-3">
              <h3 className="text-sm font-bold text-foreground">
                Histórico do Plano e Ficha Clínica ({categorizedRecords.evolutions.length})
              </h3>
              {categorizedRecords.evolutions.length === 0 ? (
                <div className="py-10 text-center text-xs text-muted-foreground">
                  Nenhum procedimento ou evolução clínica registrada ainda.
                </div>
              ) : (
                <div className="space-y-3">
                  {categorizedRecords.evolutions.map((ev) => (
                    <div
                      key={ev.id}
                      className="p-4 rounded-xl border border-border bg-background space-y-1.5 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-foreground">
                          {ev.title || "Evolução Clínica"}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground font-mono text-[11px]">
                            {new Date(ev.record_date).toLocaleDateString("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          <button
                            onClick={() => deleteClinicalRecordMutation.mutate(ev.id)}
                            className="text-muted-foreground hover:text-rose-600 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      <p className="text-muted-foreground whitespace-pre-line leading-relaxed">
                        {ev.content}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ====================================================================
            ABA 6: FICHAS ESPECIALIDADES (ENDODONTIA, ORTODONTIA, PRÓTESE, HOF...)
           ==================================================================== */}
        {activeTab === "fichas_especialidades" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-6 rounded-2xl bg-card border border-border p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-foreground">
                Preencher Ficha de Especialidade
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(SPECIALTY_TEMPLATES).map(([key, spec]) => (
                  <button
                    key={key}
                    onClick={() => {
                      setSelectedSpecialty(key);
                      setSpecialtyText(spec.template);
                    }}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer",
                      selectedSpecialty === key
                        ? "bg-[#e66c2c] text-white border-[#e66c2c]"
                        : "bg-background text-foreground border-border hover:bg-muted",
                    )}
                  >
                    {spec.label.replace("Ficha de ", "")}
                  </button>
                ))}
              </div>
              <textarea
                rows={8}
                value={specialtyText}
                onChange={(e) => setSpecialtyText(e.target.value)}
                className="w-full rounded-xl border border-border bg-background p-3 text-xs font-mono leading-relaxed"
              />
              <button
                onClick={() => {
                  const specTitle =
                    SPECIALTY_TEMPLATES[selectedSpecialty]?.label || "Ficha de Especialidade";
                  createClinicalRecordMutation.mutate(
                    {
                      record_type: "ficha_especialidade",
                      title: specTitle,
                      content: specialtyText,
                      promoteStage: "tratamento",
                    },
                    {
                      onSuccess: () => toast.success(`${specTitle} salva no prontuário!`),
                    },
                  );
                }}
                className="w-full py-2.5 rounded-xl bg-[#e66c2c] hover:bg-[#d45d1e] text-white text-xs font-semibold cursor-pointer"
              >
                Salvar Ficha de Especialidade
              </button>
            </div>

            <div className="lg:col-span-6 rounded-2xl bg-card border border-border p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-foreground">
                Fichas de Especialidades Salvas ({categorizedRecords.specialtySheets.length})
              </h3>
              {categorizedRecords.specialtySheets.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  Nenhuma ficha de especialidade preenchida ainda.
                </div>
              ) : (
                <div className="space-y-3">
                  {categorizedRecords.specialtySheets.map((s) => (
                    <div
                      key={s.id}
                      className="p-4 rounded-xl border border-border bg-background space-y-1.5 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-foreground">{s.title}</span>
                        <span className="text-muted-foreground font-mono">
                          {new Date(s.record_date).toLocaleDateString("pt-BR")}
                        </span>
                      </div>
                      <p className="text-muted-foreground whitespace-pre-line">{s.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ====================================================================
            ABA 7: ODONTOGRAMA
           ==================================================================== */}
        {activeTab === "odontograma" && (
          <OdontogramView patientId={selectedPatient.id} patientName={selectedPatient.name} />
        )}

        {/* ====================================================================
            ABA 8: ANAMNESE (QUESTIONÁRIO OFICIAL CLINICORP)
           ==================================================================== */}
        {activeTab === "anamnese" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-7 rounded-2xl bg-card border border-border p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-[#e66c2c]" />
                Questionário Oficial de Anamnese Clínica
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs max-h-[620px] overflow-y-auto pr-1">
                <div>
                  <label className="font-semibold text-foreground block mb-1">
                    1. Qual o motivo da consulta?
                  </label>
                  <input
                    type="text"
                    value={anamnesisForm.reasonForVisit}
                    onChange={(e) =>
                      setAnamnesisForm({ ...anamnesisForm, reasonForVisit: e.target.value })
                    }
                    placeholder="Ex: Dor, limpeza, avaliação estética, prótese..."
                    className="w-full rounded-xl border border-border bg-background px-3 py-2"
                  />
                </div>
                <div>
                  <label className="font-semibold text-foreground block mb-1">
                    2. Quando foi o último tratamento odontológico?
                  </label>
                  <input
                    type="text"
                    value={anamnesisForm.lastDentalTreatment}
                    onChange={(e) =>
                      setAnamnesisForm({ ...anamnesisForm, lastDentalTreatment: e.target.value })
                    }
                    placeholder="Ex: Há 6 meses, 1 ano..."
                    className="w-full rounded-xl border border-border bg-background px-3 py-2"
                  />
                </div>

                <div>
                  <label className="font-semibold text-foreground block mb-1">
                    3. Está fazendo algum tratamento médico?
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={anamnesisForm.medicalTreatment}
                      onChange={(e) =>
                        setAnamnesisForm({ ...anamnesisForm, medicalTreatment: e.target.value })
                      }
                      className="w-24 rounded-xl border border-border bg-background px-2.5 py-2"
                    >
                      <option value="Não">Não</option>
                      <option value="Sim">Sim</option>
                    </select>
                    <input
                      type="text"
                      value={anamnesisForm.medicalTreatmentDetails}
                      onChange={(e) =>
                        setAnamnesisForm({
                          ...anamnesisForm,
                          medicalTreatmentDetails: e.target.value,
                        })
                      }
                      placeholder="Qual tratamento?"
                      className="flex-1 rounded-xl border border-border bg-background px-3 py-2"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-semibold text-foreground block mb-1">
                    4. Está tomando algum medicamento?
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={anamnesisForm.takingMedication}
                      onChange={(e) =>
                        setAnamnesisForm({ ...anamnesisForm, takingMedication: e.target.value })
                      }
                      className="w-24 rounded-xl border border-border bg-background px-2.5 py-2"
                    >
                      <option value="Não">Não</option>
                      <option value="Sim">Sim</option>
                    </select>
                    <input
                      type="text"
                      value={anamnesisForm.continuousMeds}
                      onChange={(e) =>
                        setAnamnesisForm({ ...anamnesisForm, continuousMeds: e.target.value })
                      }
                      placeholder="Quais medicamentos?"
                      className="flex-1 rounded-xl border border-border bg-background px-3 py-2"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-semibold text-foreground block mb-1">
                    5. Tem alergia a algum medicamento?
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={anamnesisForm.drugAllergy}
                      onChange={(e) =>
                        setAnamnesisForm({ ...anamnesisForm, drugAllergy: e.target.value })
                      }
                      className="w-24 rounded-xl border border-border bg-background px-2.5 py-2"
                    >
                      <option value="Não">Não</option>
                      <option value="Sim">Sim</option>
                    </select>
                    <input
                      type="text"
                      value={anamnesisForm.drugAllergyDetails}
                      onChange={(e) =>
                        setAnamnesisForm({ ...anamnesisForm, drugAllergyDetails: e.target.value })
                      }
                      placeholder="Qual medicamento? (Ex: Dipirona)"
                      className="flex-1 rounded-xl border border-border bg-background px-3 py-2"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-semibold text-foreground block mb-1">
                    6. Teve alguma reação à anestesia local?
                  </label>
                  <select
                    value={anamnesisForm.localAnesthesiaReaction}
                    onChange={(e) =>
                      setAnamnesisForm({
                        ...anamnesisForm,
                        localAnesthesiaReaction: e.target.value,
                      })
                    }
                    className="w-full rounded-xl border border-border bg-background px-3 py-2"
                  >
                    <option value="Não">Não</option>
                    <option value="Sim">Sim</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-foreground block mb-1">
                    7. Já teve reação alérgica a algum alimento?
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={anamnesisForm.foodAllergy}
                      onChange={(e) =>
                        setAnamnesisForm({ ...anamnesisForm, foodAllergy: e.target.value })
                      }
                      className="w-24 rounded-xl border border-border bg-background px-2.5 py-2"
                    >
                      <option value="Não">Não</option>
                      <option value="Sim">Sim</option>
                    </select>
                    <input
                      type="text"
                      value={anamnesisForm.foodAllergyDetails}
                      onChange={(e) =>
                        setAnamnesisForm({ ...anamnesisForm, foodAllergyDetails: e.target.value })
                      }
                      placeholder="Qual alimento?"
                      className="flex-1 rounded-xl border border-border bg-background px-3 py-2"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-semibold text-foreground block mb-1">
                    8. Sua gengiva sangra com frequência / facilmente?
                  </label>
                  <select
                    value={anamnesisForm.bleedingGums}
                    onChange={(e) =>
                      setAnamnesisForm({ ...anamnesisForm, bleedingGums: e.target.value })
                    }
                    className="w-full rounded-xl border border-border bg-background px-3 py-2"
                  >
                    <option value="Não">Não</option>
                    <option value="Sim">Sim</option>
                    <option value="Às vezes">Às vezes</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-foreground block mb-1">
                    9. Há retenção de alimentos entre os dentes?
                  </label>
                  <select
                    value={anamnesisForm.foodRetention}
                    onChange={(e) =>
                      setAnamnesisForm({ ...anamnesisForm, foodRetention: e.target.value })
                    }
                    className="w-full rounded-xl border border-border bg-background px-3 py-2"
                  >
                    <option value="Não">Não</option>
                    <option value="Sim">Sim</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-foreground block mb-1">
                    10. Sente sensibilidade nos dentes?
                  </label>
                  <select
                    value={anamnesisForm.sensitivity}
                    onChange={(e) =>
                      setAnamnesisForm({ ...anamnesisForm, sensitivity: e.target.value })
                    }
                    className="w-full rounded-xl border border-border bg-background px-3 py-2"
                  >
                    <option value="Não">Não</option>
                    <option value="Sim">Sim</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-foreground block mb-1">
                    11. Range os dentes ou tem apertamento (dia/noite)?
                  </label>
                  <select
                    value={anamnesisForm.bruxism}
                    onChange={(e) =>
                      setAnamnesisForm({ ...anamnesisForm, bruxism: e.target.value })
                    }
                    className="w-full rounded-xl border border-border bg-background px-3 py-2"
                  >
                    <option value="Não">Não</option>
                    <option value="Sim">Sim</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-foreground block mb-1">
                    12. Tem hábito (roer unhas, morder lápis/caneta)?
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={anamnesisForm.habits}
                      onChange={(e) =>
                        setAnamnesisForm({ ...anamnesisForm, habits: e.target.value })
                      }
                      className="w-24 rounded-xl border border-border bg-background px-2.5 py-2"
                    >
                      <option value="Não">Não</option>
                      <option value="Sim">Sim</option>
                    </select>
                    <input
                      type="text"
                      value={anamnesisForm.habitsDetails}
                      onChange={(e) =>
                        setAnamnesisForm({ ...anamnesisForm, habitsDetails: e.target.value })
                      }
                      placeholder="Qual hábito?"
                      className="flex-1 rounded-xl border border-border bg-background px-3 py-2"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-semibold text-foreground block mb-1">
                    13. É fumante? Quantos cigarros por dia?
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={anamnesisForm.smoking}
                      onChange={(e) =>
                        setAnamnesisForm({ ...anamnesisForm, smoking: e.target.value })
                      }
                      className="w-24 rounded-xl border border-border bg-background px-2.5 py-2"
                    >
                      <option value="Não">Não</option>
                      <option value="Sim">Sim</option>
                    </select>
                    <input
                      type="text"
                      value={anamnesisForm.smokingDetails}
                      onChange={(e) =>
                        setAnamnesisForm({ ...anamnesisForm, smokingDetails: e.target.value })
                      }
                      placeholder="Quantidade/dia"
                      className="flex-1 rounded-xl border border-border bg-background px-3 py-2"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-semibold text-foreground block mb-1">
                    14. Quando você se corta, sangra muito?
                  </label>
                  <select
                    value={anamnesisForm.excessiveBleeding}
                    onChange={(e) =>
                      setAnamnesisForm({ ...anamnesisForm, excessiveBleeding: e.target.value })
                    }
                    className="w-full rounded-xl border border-border bg-background px-3 py-2"
                  >
                    <option value="Não">Não</option>
                    <option value="Sim">Sim</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-foreground block mb-1">
                    15. Sente dores de cabeça, face, ouvido ou articulação (ATM)?
                  </label>
                  <select
                    value={anamnesisForm.facialOrTmjPain}
                    onChange={(e) =>
                      setAnamnesisForm({ ...anamnesisForm, facialOrTmjPain: e.target.value })
                    }
                    className="w-full rounded-xl border border-border bg-background px-3 py-2"
                  >
                    <option value="Não">Não</option>
                    <option value="Sim">Sim</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-foreground block mb-1">
                    16. Desmaio, ataques nervosos, epilepsia ou convulsão?
                  </label>
                  <select
                    value={anamnesisForm.faintingOrEpilepsy}
                    onChange={(e) =>
                      setAnamnesisForm({ ...anamnesisForm, faintingOrEpilepsy: e.target.value })
                    }
                    className="w-full rounded-xl border border-border bg-background px-3 py-2"
                  >
                    <option value="Não">Não</option>
                    <option value="Sim">Sim</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-foreground block mb-1">
                    17. Sua pressão arterial é normal?
                  </label>
                  <select
                    value={anamnesisForm.normalBloodPressure}
                    onChange={(e) =>
                      setAnamnesisForm({ ...anamnesisForm, normalBloodPressure: e.target.value })
                    }
                    className="w-full rounded-xl border border-border bg-background px-3 py-2"
                  >
                    <option value="Sim">Sim (Normal)</option>
                    <option value="Não">Não (Alterada)</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-foreground block mb-1">
                    18. Está grávida? Qual mês?
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={anamnesisForm.pregnant}
                      onChange={(e) =>
                        setAnamnesisForm({ ...anamnesisForm, pregnant: e.target.value })
                      }
                      className="w-24 rounded-xl border border-border bg-background px-2.5 py-2"
                    >
                      <option value="Não">Não</option>
                      <option value="Sim">Sim</option>
                    </select>
                    <input
                      type="text"
                      value={anamnesisForm.pregnantMonth}
                      onChange={(e) =>
                        setAnamnesisForm({ ...anamnesisForm, pregnantMonth: e.target.value })
                      }
                      placeholder="Qual mês?"
                      className="flex-1 rounded-xl border border-border bg-background px-3 py-2"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-semibold text-foreground block mb-1">
                    19. Já fez tratamento ortodôntico?
                  </label>
                  <select
                    value={anamnesisForm.previousOrthodontics}
                    onChange={(e) =>
                      setAnamnesisForm({ ...anamnesisForm, previousOrthodontics: e.target.value })
                    }
                    className="w-full rounded-xl border border-border bg-background px-3 py-2"
                  >
                    <option value="Não">Não</option>
                    <option value="Sim">Sim</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-foreground block mb-1">
                    20. Há algo que lhe incomoda no seu sorriso?
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={anamnesisForm.smileComplaint}
                      onChange={(e) =>
                        setAnamnesisForm({ ...anamnesisForm, smileComplaint: e.target.value })
                      }
                      className="w-24 rounded-xl border border-border bg-background px-2.5 py-2"
                    >
                      <option value="Não">Não</option>
                      <option value="Sim">Sim</option>
                    </select>
                    <input
                      type="text"
                      value={anamnesisForm.smileComplaintDetails}
                      onChange={(e) =>
                        setAnamnesisForm({
                          ...anamnesisForm,
                          smileComplaintDetails: e.target.value,
                        })
                      }
                      placeholder="O que incomoda?"
                      className="flex-1 rounded-xl border border-border bg-background px-3 py-2"
                    />
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="font-semibold text-foreground block mb-1">
                    Condições Sistêmicas (Hipertensão, Diabetes, Cardíaco, Respiratório, Renal):
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      "Hipertenso",
                      "Diabetes",
                      "Problemas Cardíacos",
                      "Problemas Respiratórios",
                      "Problemas Renais",
                      "Gastrite",
                    ].map((cond) => {
                      const active = anamnesisForm.systemicConditions.includes(cond);
                      return (
                        <button
                          key={cond}
                          type="button"
                          onClick={() => {
                            setAnamnesisForm((prev) => ({
                              ...prev,
                              systemicConditions: active
                                ? prev.systemicConditions.filter((c) => c !== cond)
                                : [...prev.systemicConditions, cond],
                            }));
                          }}
                          className={cn(
                            "px-2.5 py-1 rounded-lg border text-xs font-medium cursor-pointer",
                            active
                              ? "bg-rose-500/15 border-rose-500/40 text-rose-700 font-semibold"
                              : "bg-background border-border text-muted-foreground",
                          )}
                        >
                          {cond}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="font-semibold text-foreground block mb-1">
                    Possui outro tipo de enfermidade ou observações adicionais?
                  </label>
                  <textarea
                    rows={2}
                    value={anamnesisForm.notes}
                    onChange={(e) => setAnamnesisForm({ ...anamnesisForm, notes: e.target.value })}
                    placeholder="Observações complementares da anamnese..."
                    className="w-full rounded-xl border border-border bg-background p-2.5"
                  />
                </div>
              </div>
              <button
                onClick={async () => {
                  const warnings: string[] = [];
                  if (anamnesisForm.drugAllergy === "Sim") {
                    warnings.push(
                      `Alergia Medicamentosa: ${anamnesisForm.drugAllergyDetails || "Sim"}`,
                    );
                  }
                  if (anamnesisForm.localAnesthesiaReaction === "Sim") {
                    warnings.push("Reação a Anestesia Local");
                  }
                  if (anamnesisForm.pregnant === "Sim") {
                    warnings.push(
                      `Gestante${anamnesisForm.pregnantMonth ? ` (${anamnesisForm.pregnantMonth})` : ""}`,
                    );
                  }
                  if (anamnesisForm.excessiveBleeding === "Sim") {
                    warnings.push("Sangramento excessivo");
                  }
                  if (anamnesisForm.faintingOrEpilepsy === "Sim") {
                    warnings.push("Histórico de desmaio/epilepsia");
                  }
                  warnings.push(...anamnesisForm.systemicConditions);

                  const content = [
                    anamnesisForm.reasonForVisit
                      ? `• Qual o motivo da consulta? ${anamnesisForm.reasonForVisit}`
                      : null,
                    anamnesisForm.lastDentalTreatment
                      ? `• Quando foi o seu último tratamento odontológico? ${anamnesisForm.lastDentalTreatment}`
                      : null,
                    `• Está fazendo algum tratamento médico? ${anamnesisForm.medicalTreatment}${anamnesisForm.medicalTreatmentDetails ? ` (${anamnesisForm.medicalTreatmentDetails})` : ""}`,
                    `• Está tomando algum medicamento? ${anamnesisForm.takingMedication}${anamnesisForm.continuousMeds ? ` (${anamnesisForm.continuousMeds})` : ""}`,
                    `• Tem alergia a algum medicamento? ${anamnesisForm.drugAllergy}${anamnesisForm.drugAllergyDetails ? ` (${anamnesisForm.drugAllergyDetails})` : ""}`,
                    `• Teve alguma reação a anestesia local? ${anamnesisForm.localAnesthesiaReaction}`,
                    `• Já teve ou tem reação alérgica a algum alimento? ${anamnesisForm.foodAllergy}${anamnesisForm.foodAllergyDetails ? ` (${anamnesisForm.foodAllergyDetails})` : ""}`,
                    `• Sua gengiva sangra com frequência? ${anamnesisForm.bleedingGums}`,
                    `• Há retenção de alimentos entre os dentes? ${anamnesisForm.foodRetention}`,
                    `• Sente sensibilidade nos dentes? ${anamnesisForm.sensitivity}`,
                    `• Range os dentes ou tem apertamento? ${anamnesisForm.bruxism}`,
                    `• Tem algum hábito? ${anamnesisForm.habits}${anamnesisForm.habitsDetails ? ` (${anamnesisForm.habitsDetails})` : ""}`,
                    `• Fuma? ${anamnesisForm.smoking}${anamnesisForm.smokingDetails ? ` (${anamnesisForm.smokingDetails})` : ""}`,
                    `• Quando você se corta, sangra muito? ${anamnesisForm.excessiveBleeding}`,
                    `• Sente dores de cabeça, dores na face, ouvido ou articulação? ${anamnesisForm.facialOrTmjPain}`,
                    `• Teve algum desmaio, tem ataques nervosos, epilepsia ou convulsão? ${anamnesisForm.faintingOrEpilepsy}`,
                    `• Sua pressão arterial é normal? ${anamnesisForm.normalBloodPressure}`,
                    `• Está grávida? ${anamnesisForm.pregnant}${anamnesisForm.pregnantMonth ? ` (${anamnesisForm.pregnantMonth})` : ""}`,
                    `• Já fez tratamento ortodôntico? ${anamnesisForm.previousOrthodontics}`,
                    `• Há algo que lhe incomoda no seu sorriso? ${anamnesisForm.smileComplaint}${anamnesisForm.smileComplaintDetails ? ` (${anamnesisForm.smileComplaintDetails})` : ""}`,
                    `• Condições sistêmicas: ${anamnesisForm.systemicConditions.join(", ") || "Nenhuma"}`,
                    anamnesisForm.notes ? `• Observações: ${anamnesisForm.notes}` : null,
                  ]
                    .filter(Boolean)
                    .join("\n");

                  if (warnings.length > 0) {
                    await supabase
                      .from("patients")
                      .update({ medical_warning: warnings.join(" | ") })
                      .eq("id", selectedPatient.id);
                  }

                  createClinicalRecordMutation.mutate(
                    {
                      record_type: "formulario",
                      title: "Anamnese Clínica",
                      content,
                      promoteStage:
                        selectedPatient.funnel_stage === "triagem" ? "anamnese" : undefined,
                    },
                    {
                      onSuccess: () => toast.success("Anamnese salva com sucesso!"),
                    },
                  );
                }}
                className="w-full py-2.5 rounded-xl bg-[#e66c2c] hover:bg-[#d45d1e] text-white text-xs font-semibold cursor-pointer"
              >
                Salvar Anamnese
              </button>
            </div>

            <div className="lg:col-span-5 rounded-2xl bg-card border border-border p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-foreground">
                Histórico de Anamnese do Paciente ({categorizedRecords.anamneses.length})
              </h3>
              {categorizedRecords.anamneses.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  Nenhuma ficha de anamnese respondida ainda para este paciente.
                </div>
              ) : (
                <div className="space-y-3 max-h-[620px] overflow-y-auto pr-1">
                  {categorizedRecords.anamneses.map((a) => (
                    <div
                      key={a.id}
                      className="p-4 rounded-xl border border-border bg-background space-y-1.5 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-indigo-700 dark:text-indigo-400">
                          {a.title || "Anamnese Clínica"}
                        </span>
                        <span className="font-mono text-muted-foreground">
                          {new Date(a.record_date).toLocaleDateString("pt-BR")}
                        </span>
                      </div>
                      <p className="text-muted-foreground whitespace-pre-line leading-relaxed">
                        {a.content}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ====================================================================
            ABA 9: PLANOS (CONVÊNIOS E PLANOS RECORRENTES)
           ==================================================================== */}
        {activeTab === "planos" && (
          <div className="rounded-2xl bg-card border border-border p-6 shadow-sm space-y-4 max-w-2xl">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[#e66c2c]" />
              Plano / Convênio Odontológico Vinculado
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-xl bg-muted/40 border border-border">
                <span className="text-muted-foreground block">Plano / Convênio Atual</span>
                <span className="text-base font-bold text-foreground mt-1 block">
                  {selectedPatient.insurance || "PARTICULAR"}
                </span>
              </div>
              <div className="p-4 rounded-xl bg-muted/40 border border-border">
                <span className="text-muted-foreground block">Nº da Carteirinha / Matrícula</span>
                <span className="text-base font-mono font-bold text-foreground mt-1 block">
                  {selectedPatient.insurance_number || "Não informado"}
                </span>
              </div>
            </div>
            <button
              onClick={() => openEditPatientModal(selectedPatient)}
              className="px-4 py-2 rounded-xl bg-[#e66c2c] text-white text-xs font-semibold cursor-pointer"
            >
              Alterar Plano ou Nº da Carteirinha
            </button>
          </div>
        )}

        {/* ====================================================================
            ABA 10: DOCUMENTOS (ATESTADOS, RECEITUÁRIOS, CONTRATOS EM PDF)
           ==================================================================== */}
        {activeTab === "documentos" && (
          <div className="space-y-6">
            <DocumentGenerator
              patientId={selectedPatient.id}
              patientName={selectedPatient.name}
              patientCpf={selectedPatient.cpf || undefined}
            />
            {categorizedRecords.documents.length > 0 && (
              <div className="rounded-2xl bg-card border border-border p-5 shadow-sm space-y-3">
                <h3 className="text-sm font-bold text-foreground">
                  Receituários e Atestados Emitidos ({categorizedRecords.documents.length})
                </h3>
                <div className="space-y-2.5">
                  {categorizedRecords.documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="p-4 rounded-xl border border-border bg-background text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-foreground">{doc.title}</span>
                        <span className="font-mono text-muted-foreground">
                          {new Date(doc.record_date).toLocaleDateString("pt-BR")}
                        </span>
                      </div>
                      <p className="text-muted-foreground whitespace-pre-line">{doc.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ====================================================================
            ABA 11: EXAMES (RADIOGRAFIAS, TOMOGRAFIAS E LAUDOS)
           ==================================================================== */}
        {activeTab === "exames" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-5 rounded-2xl bg-card border border-border p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <FileCheck className="h-4 w-4 text-[#e66c2c]" />
                Registrar Pedido ou Laudo de Exame
              </h3>
              <div className="space-y-3 text-xs">
                <div>
                  <label className="font-semibold text-foreground block mb-1">
                    Tipo de Exame *
                  </label>
                  <input
                    type="text"
                    value={examTitle}
                    onChange={(e) => setExamTitle(e.target.value)}
                    placeholder="Ex: Radiografia Panorâmica, Periapical Dente 24, Tomografia..."
                    className="w-full rounded-xl border border-border bg-background px-3 py-2"
                  />
                </div>
                <div>
                  <label className="font-semibold text-foreground block mb-1">
                    Laudo / Achados Radiográficos / Indicação
                  </label>
                  <textarea
                    rows={4}
                    value={examNotes}
                    onChange={(e) => setExamNotes(e.target.value)}
                    placeholder="Anote os achados do exame ou indicação clínica..."
                    className="w-full rounded-xl border border-border bg-background p-3"
                  />
                </div>
                <button
                  onClick={() => {
                    if (!examTitle.trim()) {
                      toast.error("Informe o tipo de exame.");
                      return;
                    }
                    createClinicalRecordMutation.mutate(
                      {
                        record_type: "exame",
                        title: `Exame: ${examTitle.trim()}`,
                        content: examNotes.trim() || "Exame solicitado/avaliado em consulta.",
                      },
                      {
                        onSuccess: () => {
                          toast.success("Exame registrado no prontuário!");
                          setExamTitle("");
                          setExamNotes("");
                        },
                      },
                    );
                  }}
                  className="w-full py-2.5 rounded-xl bg-[#e66c2c] text-white text-xs font-semibold cursor-pointer"
                >
                  Salvar Exame
                </button>
              </div>
            </div>
            <div className="lg:col-span-7 rounded-2xl bg-card border border-border p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-foreground">
                Exames do Paciente ({categorizedRecords.exams.length})
              </h3>
              {categorizedRecords.exams.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  Nenhum exame complementar registrado para este paciente.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {categorizedRecords.exams.map((ex) => (
                    <div
                      key={ex.id}
                      className="p-4 rounded-xl border border-border bg-background flex items-start justify-between text-xs"
                    >
                      <div>
                        <div className="font-bold text-foreground">{ex.title}</div>
                        <p className="text-muted-foreground mt-1 whitespace-pre-line">
                          {ex.content}
                        </p>
                      </div>
                      <button
                        onClick={() => deleteClinicalRecordMutation.mutate(ex.id)}
                        className="text-muted-foreground hover:text-rose-600 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ====================================================================
            ABA 12: RECIBOS
           ==================================================================== */}
        {activeTab === "recibos" && (
          <div className="rounded-2xl bg-card border border-border p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Receipt className="h-4 w-4 text-[#e66c2c]" />
                Recibos de Pagamento do Paciente ({categorizedRecords.payments.length})
              </h3>
              <button
                onClick={() => setActiveTab("financeiro")}
                className="px-3.5 py-1.5 rounded-lg bg-[#e66c2c] text-white text-xs font-semibold cursor-pointer"
              >
                + Novo Recebimento
              </button>
            </div>
            {categorizedRecords.payments.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground">
                Nenhum recibo emitido ainda. Registre um pagamento na aba Financeiro para gerar o
                recibo.
              </div>
            ) : (
              <div className="space-y-2.5">
                {categorizedRecords.payments.map((pay) => (
                  <div
                    key={pay.id}
                    className="p-4 rounded-xl border border-border bg-background flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="font-bold text-foreground">{pay.title}</div>
                      <p className="text-muted-foreground whitespace-pre-line mt-0.5">
                        {pay.content}
                      </p>
                    </div>
                    <button
                      onClick={() => window.print()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted font-semibold cursor-pointer shrink-0"
                    >
                      <Printer className="h-3.5 w-3.5" />
                      <span>Imprimir Recibo</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ====================================================================
            ABA 13: AGENDAMENTOS DO PACIENTE
           ==================================================================== */}
        {activeTab === "agendamentos" && (
          <div className="rounded-2xl bg-card border border-border p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Calendar className="h-4 w-4 text-[#e66c2c]" />
                Histórico de Agendamentos do Paciente ({patientAppointments.length})
              </h3>
              <button
                onClick={() => setShowAppointmentModal(true)}
                className="px-4 py-2 rounded-lg bg-[#e66c2c] hover:bg-[#d45d1e] text-white text-xs font-semibold cursor-pointer flex items-center gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Novo Agendamento</span>
              </button>
            </div>

            {patientAppointments.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground">
                Nenhum agendamento encontrado para este paciente.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {patientAppointments.map((appt) => (
                  <div
                    key={appt.id}
                    className="p-4 rounded-xl border border-border bg-background flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="font-bold text-foreground">
                        {new Date(appt.appointment_date + "T12:00:00").toLocaleDateString("pt-BR")}{" "}
                        às {trimSeconds(appt.appointment_time)}
                      </div>
                      <div className="text-muted-foreground mt-0.5">{appt.service_name}</div>
                      {appt.notes && (
                        <div className="text-[11px] text-muted-foreground/80 mt-0.5">
                          {appt.notes}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase border",
                          appt.status === "confirmed"
                            ? "bg-emerald-500/15 text-emerald-800 border-emerald-500/30"
                            : appt.status === "pending"
                              ? "bg-amber-500/15 text-amber-800 border-amber-500/30"
                              : appt.status === "completed"
                                ? "bg-primary/10 text-primary border-primary/25"
                                : "bg-muted text-muted-foreground border-border",
                        )}
                      >
                        {STATUS_LABELS[appt.status]}
                      </span>
                      <button
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
                            queryKey: ["patient_appointments", selectedPatient.id],
                          });
                          queryClient.invalidateQueries({ queryKey: ["appointments"] });
                        }}
                        className="p-1.5 text-muted-foreground hover:text-rose-600 cursor-pointer"
                        title="Excluir agendamento"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* MODAL: NOVO ALERTA DE RETORNO */}
        {showReturnAlertModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
            onClick={() => setShowReturnAlertModal(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl bg-card border border-border p-6 shadow-xl space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-foreground">Definir Alerta de Retorno</h3>
                <button
                  onClick={() => setShowReturnAlertModal(false)}
                  className="p-1 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                {[
                  { label: "Daqui a 3 meses", months: 3 },
                  { label: "Daqui a 6 meses", months: 6 },
                  { label: "Daqui a 12 meses", months: 12 },
                ].map((preset) => (
                  <button
                    key={preset.months}
                    type="button"
                    onClick={() => {
                      const d = new Date();
                      d.setMonth(d.getMonth() + preset.months);
                      setReturnAlertForm((prev) => ({
                        ...prev,
                        date: d.toISOString().split("T")[0],
                      }));
                    }}
                    className="px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted font-semibold cursor-pointer"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="space-y-3 text-xs">
                <div>
                  <label className="font-semibold text-foreground block mb-1">
                    Data do Retorno
                  </label>
                  <input
                    type="date"
                    value={returnAlertForm.date}
                    onChange={(e) =>
                      setReturnAlertForm({ ...returnAlertForm, date: e.target.value })
                    }
                    className="w-full rounded-xl border border-border bg-background px-3 py-2"
                  />
                </div>
                <div>
                  <label className="font-semibold text-foreground block mb-1">
                    Motivo / Observação
                  </label>
                  <input
                    type="text"
                    value={returnAlertForm.notes}
                    onChange={(e) =>
                      setReturnAlertForm({ ...returnAlertForm, notes: e.target.value })
                    }
                    placeholder="Ex: Profilaxia de 6 meses, Controle pós-operatório..."
                    className="w-full rounded-xl border border-border bg-background px-3 py-2"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowReturnAlertModal(false)}
                  className="px-4 py-2 rounded-lg border border-border text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => saveReturnAlertMutation.mutate()}
                  className="px-5 py-2 rounded-lg bg-[#e66c2c] text-white text-xs font-semibold cursor-pointer"
                >
                  Salvar Alerta
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: ADICIONAR NOTA GERAL */}
        {showGeneralNoteModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
            onClick={() => setShowGeneralNoteModal(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl bg-card border border-border p-6 shadow-xl space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-foreground">Adicionar Nota Geral</h3>
                <button
                  onClick={() => setShowGeneralNoteModal(false)}
                  className="p-1 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <textarea
                rows={4}
                value={generalNoteText}
                onChange={(e) => setGeneralNoteText(e.target.value)}
                placeholder="Registre observações gerais importantes sobre este paciente..."
                className="w-full rounded-xl border border-border bg-background p-3 text-xs"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowGeneralNoteModal(false)}
                  className="px-4 py-2 rounded-lg border border-border text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    if (!generalNoteText.trim()) return;
                    createClinicalRecordMutation.mutate(
                      {
                        record_type: "nota_geral",
                        title: "Nota Geral",
                        content: generalNoteText.trim(),
                      },
                      {
                        onSuccess: () => {
                          toast.success("Nota geral adicionada!");
                          setShowGeneralNoteModal(false);
                        },
                      },
                    );
                  }}
                  className="px-5 py-2 rounded-lg bg-[#e66c2c] text-white text-xs font-semibold cursor-pointer"
                >
                  Salvar Nota
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL DE EDITAR CADASTRO COMPLETO (CLINICORP) */}
        {patientFormMode && renderPatientModal()}

        <NewAppointmentModal
          open={showAppointmentModal}
          onOpenChange={setShowAppointmentModal}
          defaultPatient={selectedPatient}
          onSuccess={() => {
            queryClient.invalidateQueries({
              queryKey: ["patient_appointments", selectedPatient.id],
            });
            queryClient.invalidateQueries({ queryKey: ["appointments"] });
          }}
        />
      </div>
    );
  }

  // ============================================================================
  // FUNÇÃO AUXILIAR PARA RENDERIZAR O MODAL DE CRIAR / EDITAR PACIENTE (CLINICORP)
  // ============================================================================
  function renderPatientModal() {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
        onClick={() => setPatientFormMode(null)}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-2xl rounded-3xl bg-card border border-border p-7 shadow-bloom space-y-5 max-h-[90vh] overflow-y-auto"
        >
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <h3 className="font-display text-2xl text-foreground">
                {patientFormMode === "edit" ? "Editar Cadastro do Paciente" : "Novo Paciente"}
              </h3>
              <p className="text-xs text-muted-foreground">
                Cadastro, Contato, Complemento e Alertas de Saúde.
              </p>
            </div>
            <button
              onClick={() => setPatientFormMode(null)}
              className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-xs">
            <div className="sm:col-span-2 space-y-1">
              <label className="font-semibold text-foreground">Nome Completo *</label>
              <input
                type="text"
                value={patientForm.name}
                onChange={(e) => setPatientForm({ ...patientForm, name: e.target.value })}
                placeholder="Nome completo do paciente"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="font-semibold text-foreground">Apelido</label>
              <input
                type="text"
                value={patientForm.nickname}
                onChange={(e) => setPatientForm({ ...patientForm, nickname: e.target.value })}
                placeholder="Como prefere ser chamado(a)"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-foreground">Telefone / WhatsApp</label>
              <input
                type="text"
                value={patientForm.phone}
                onChange={(e) => setPatientForm({ ...patientForm, phone: e.target.value })}
                placeholder="(96) 99100-0000"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="font-semibold text-foreground">CPF</label>
              <input
                type="text"
                value={patientForm.cpf}
                onChange={(e) => setPatientForm({ ...patientForm, cpf: e.target.value })}
                placeholder="000.000.000-00"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="font-semibold text-foreground">RG</label>
              <input
                type="text"
                value={patientForm.rg}
                onChange={(e) => setPatientForm({ ...patientForm, rg: e.target.value })}
                placeholder="RG"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-foreground">Data de Nascimento</label>
              <input
                type="date"
                value={patientForm.birth_date}
                onChange={(e) => setPatientForm({ ...patientForm, birth_date: e.target.value })}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="font-semibold text-foreground">Sexo</label>
              <select
                value={patientForm.gender}
                onChange={(e) => setPatientForm({ ...patientForm, gender: e.target.value })}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
              >
                <option value="">Selecione</option>
                <option value="Feminino">Feminino</option>
                <option value="Masculino">Masculino</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="font-semibold text-foreground">Estado civil</label>
              <select
                value={patientForm.marital_status}
                onChange={(e) => setPatientForm({ ...patientForm, marital_status: e.target.value })}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
              >
                <option value="">Selecione</option>
                <option value="Solteiro(a)">Solteiro(a)</option>
                <option value="Casado(a)">Casado(a)</option>
                <option value="Divorciado(a)">Divorciado(a)</option>
                <option value="Viúvo(a)">Viúvo(a)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-foreground">Plano / Convênio</label>
              <select
                value={patientForm.insurance}
                onChange={(e) => setPatientForm({ ...patientForm, insurance: e.target.value })}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
              >
                <option value="PARTICULAR">Particular</option>
                <option value="REDE UNNA">Rede Unna</option>
                <option value="ODONTOPREV">Odontoprev</option>
                <option value="BRADESCO">Bradesco Dental</option>
                <option value="AMIL DENTAL">Amil Dental</option>
                <option value="SESC">SESC</option>
                <option value="GEAP">GEAP</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="font-semibold text-foreground">Nº Plano (Carteirinha)</label>
              <input
                type="text"
                value={patientForm.insurance_number}
                onChange={(e) =>
                  setPatientForm({ ...patientForm, insurance_number: e.target.value })
                }
                placeholder="Número da carteirinha"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="font-semibold text-foreground">Como conheceu?</label>
              <input
                type="text"
                value={patientForm.origin}
                onChange={(e) => setPatientForm({ ...patientForm, origin: e.target.value })}
                placeholder="Indicação / Instagram / Google / Site"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-foreground">E-mail</label>
              <input
                type="email"
                value={patientForm.email}
                onChange={(e) => setPatientForm({ ...patientForm, email: e.target.value })}
                placeholder="email@exemplo.com"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="font-semibold text-foreground">Endereço</label>
              <input
                type="text"
                value={patientForm.address}
                onChange={(e) => setPatientForm({ ...patientForm, address: e.target.value })}
                placeholder="Rua / Av. e Número"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="font-semibold text-foreground">Bairro</label>
              <input
                type="text"
                value={patientForm.neighborhood}
                onChange={(e) => setPatientForm({ ...patientForm, neighborhood: e.target.value })}
                placeholder="Bairro"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
              />
            </div>

            <div className="sm:col-span-3 space-y-1">
              <label className="font-semibold text-foreground">Observações / Responsável</label>
              <input
                type="text"
                value={patientForm.notes}
                onChange={(e) => setPatientForm({ ...patientForm, notes: e.target.value })}
                placeholder="Nome do responsável legal ou observações gerais"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
              />
            </div>

            <div className="sm:col-span-3 space-y-1 pt-1">
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
                placeholder="Ex: Alergia a Dipirona, Hipertenso, Gestante..."
                className="w-full rounded-xl border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-xs"
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
              className="px-6 py-2.5 rounded-full bg-[#e66c2c] text-white text-xs font-semibold shadow-sm hover:bg-[#d45d1e] transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {savePatientMutation.isPending ? "Salvando..." : "Salvar Cadastro"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // LISTA PRINCIPAL DE PACIENTES + FUNIL DE TRIAGEM (CONSULTÓRIO.ME → CLINICORP)
  // ============================================================================
  return (
    <div className="space-y-6">
      {/* FUNIL DE CAPTAÇÃO / TRIAGEM (CONSULTÓRIO.ME → GESTÃO CLINICORP) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {FUNNEL_STAGES.map((stage) => {
          const isSelected = selectedFunnelStage === stage.id;
          const count =
            stage.id === "all"
              ? funnelCounts.all
              : stage.id === "triagem"
                ? funnelCounts.triagem
                : stage.id === "anamnese"
                  ? funnelCounts.anamnese
                  : stage.id === "orcamento"
                    ? funnelCounts.orcamento
                    : funnelCounts.tratamento;
          return (
            <button
              key={stage.id}
              onClick={() => {
                setSelectedFunnelStage(stage.id);
                setPage(1);
              }}
              className={cn(
                "text-left p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between",
                isSelected
                  ? "bg-card border-[#e66c2c] ring-2 ring-[#e66c2c]/25 shadow-md"
                  : "bg-card/80 border-border hover:border-foreground/30",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border",
                    stage.tone,
                  )}
                >
                  {stage.badge}
                </span>
                <span className="font-display text-2xl font-bold text-foreground">{count}</span>
              </div>
              <div className="mt-2.5 text-xs font-semibold text-foreground">{stage.label}</div>
            </button>
          );
        })}
      </div>

      {/* BARRA DE BUSCA GLOBAL ESTILO CLINICORP + FILTROS */}
      <div className="p-5 rounded-3xl bg-card border border-border shadow-petal space-y-4">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Encontre pacientes por nome, CPF, telefone, alerta médico ou nº prontuário..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-10 pr-9 py-2.5 rounded-2xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {search && (
              <button
                onClick={() => {
                  setSearch("");
                  setPage(1);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-background border border-border rounded-xl px-2.5 py-1.5">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <select
                value={selectedInsurance}
                onChange={(e) => {
                  setSelectedInsurance(e.target.value);
                  setPage(1);
                }}
                className="text-xs bg-transparent text-foreground focus:outline-none cursor-pointer"
              >
                <option value="all">Todos os Planos</option>
                <option value="PARTICULAR">Particular</option>
                <option value="REDE UNNA">Rede Unna</option>
                <option value="ODONTOPREV">Odontoprev</option>
                <option value="BRADESCO">Bradesco Dental</option>
                <option value="AMIL DENTAL">Amil Dental</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5 bg-background border border-border rounded-xl px-2.5 py-1.5">
              <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
              <select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value as typeof sortBy);
                  setPage(1);
                }}
                className="text-xs bg-transparent text-foreground focus:outline-none cursor-pointer"
              >
                <option value="name_asc">Nome (A → Z)</option>
                <option value="name_desc">Nome (Z → A)</option>
                <option value="recent">Mais Recentes</option>
                <option value="record_num">Nº Prontuário</option>
              </select>
            </div>

            <button
              onClick={() => {
                setOnlyWarnings((prev) => !prev);
                setPage(1);
              }}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-all cursor-pointer",
                onlyWarnings
                  ? "bg-rose-500/15 border-rose-500/40 text-rose-600 shadow-sm"
                  : "bg-background border-border text-muted-foreground hover:text-foreground",
              )}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              Com Alerta
            </button>

            {isFiltered && (
              <button
                onClick={clearAllFilters}
                className="px-2.5 py-1.5 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all flex items-center gap-1 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
                Limpar
              </button>
            )}

            <button
              onClick={openCreatePatientModal}
              className="px-4 py-2 rounded-xl bg-[#e66c2c] hover:bg-[#d45d1e] text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              Novo Paciente
            </button>
          </div>
        </div>

        {/* Barra Alfabética A–Z */}
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
                  onClick={() => {
                    setSelectedLetter(letter);
                    setPage(1);
                  }}
                  className={cn(
                    "min-w-[28px] h-7 px-2 rounded-lg text-xs font-semibold transition-all shrink-0 cursor-pointer flex items-center justify-center",
                    isSelected
                      ? "bg-[#e66c2c] text-white shadow-sm scale-105"
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

      {/* TABELA / LISTA DE PACIENTES LARGURA TOTAL (CLIQUE ABRE A FICHA CLINICORP COMPLETA) */}
      <div className="rounded-3xl border border-border bg-card shadow-petal overflow-hidden">
        <div className="px-6 py-3.5 bg-muted/40 border-b border-border flex items-center justify-between text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <span>
            {isLoading
              ? "Carregando pacientes..."
              : `${totalCount} ${totalCount === 1 ? "paciente encontrado" : "pacientes encontrados"}`}
          </span>
          <span>
            Página {page} de {totalPages}
          </span>
        </div>

        <div className="divide-y divide-border/60">
          {patients.length === 0 && !isLoading && (
            <div className="p-12 text-center space-y-3">
              <p className="text-sm text-muted-foreground">
                Nenhum paciente encontrado para esses filtros.
              </p>
              {isFiltered && (
                <button
                  onClick={clearAllFilters}
                  className="px-4 py-2 text-xs font-semibold rounded-full bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer"
                >
                  Mostrar todos os pacientes
                </button>
              )}
            </div>
          )}

          {patients.map((patient) => {
            const stageObj =
              FUNNEL_STAGES.find((s) => s.id === (patient.funnel_stage || "triagem")) ||
              FUNNEL_STAGES[1];
            return (
              <div
                key={patient.id}
                onClick={() => {
                  setSelectedPatient(patient);
                  setActiveTab("visao_geral");
                }}
                className="px-6 py-4 hover:bg-muted/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="text-xs font-mono font-bold text-[#e66c2c]">
                      #{patient.record_number}
                    </span>
                    <span className="text-sm font-bold text-foreground">{patient.name}</span>
                    <span
                      className={cn(
                        "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border",
                        stageObj.tone,
                      )}
                    >
                      {stageObj.label.replace(/^\d+\.\s*/, "")}
                    </span>
                    {patient.insurance && (
                      <span className="px-2 py-0.5 rounded-md bg-muted text-[10px] font-semibold uppercase text-foreground">
                        {patient.insurance}
                      </span>
                    )}
                    {patient.medical_warning && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-600 bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-500/20">
                        <AlertTriangle className="h-3 w-3" />
                        {patient.medical_warning}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                    {patient.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {patient.phone}
                      </span>
                    )}
                    {patient.cpf && <span>CPF: {patient.cpf}</span>}
                    {patient.birth_date && (
                      <span>
                        Nasc:{" "}
                        {new Date(patient.birth_date + "T12:00:00").toLocaleDateString("pt-BR")}
                      </span>
                    )}
                    {patient.origin && <span>Origem: {patient.origin}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {patient.phone && (
                    <a
                      href={`https://wa.me/55${patient.phone.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="px-2.5 py-1.5 rounded-lg border border-emerald-600/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center gap-1"
                      title="Conversar no WhatsApp"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      <span className="hidden md:inline">WhatsApp</span>
                    </a>
                  )}
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#e66c2c]">
                    <span>Abrir Prontuário</span>
                    <ChevronRight className="h-4 w-4" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Paginação */}
        {totalCount > pageSize && (
          <div className="px-6 py-4 bg-muted/20 border-t border-border flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3.5 py-1.5 rounded-xl border border-border text-xs font-semibold text-foreground bg-background hover:bg-muted disabled:opacity-40 cursor-pointer flex items-center gap-1"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Anterior
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3.5 py-1.5 rounded-xl border border-border text-xs font-semibold text-foreground bg-background hover:bg-muted disabled:opacity-40 cursor-pointer flex items-center gap-1"
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
                className="text-xs p-1.5 rounded-lg border border-border bg-background text-foreground cursor-pointer"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {patientFormMode && renderPatientModal()}
    </div>
  );
}
