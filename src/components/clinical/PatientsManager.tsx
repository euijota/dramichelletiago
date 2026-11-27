import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
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
  Settings2,
  Play,
  Download,
  ListChecks,
  RefreshCw,
  Users,
  Baby,
} from "lucide-react";
import { OdontogramView } from "./OdontogramView";
import { DocumentGenerator } from "./DocumentGenerator";
import { PatientSignatures, type SignaturePrefill } from "./PatientSignatures";
import { NewAppointmentModal } from "./NewAppointmentModal";
import { ProcedureCatalogModal } from "./ProcedureCatalogModal";
import { STATUS_LABELS, trimSeconds } from "@/lib/clinic";
import { buildWhatsAppUniversalUrl } from "@/lib/crc";
import {
  GUARDIAN_RELATIONSHIPS,
  EMPTY_GUARDIANS_DATA,
  getPatientAge,
  isMinorPatient,
  formatPatientAgeLabel,
  serializePatientNotes,
  parsePatientNotes,
} from "@/lib/patient-guardians";
import {
  PROCEDURE_CATEGORIES,
  REGION_OPTIONS,
  PERMANENT_TOOTH_NUMBERS,
  DECIDUOUS_TOOTH_NUMBERS,
  type ClinicalProcedureCatalogItem,
  type TreatmentPlanItemInput,
  loadProcedureCatalog,
  filterProcedures,
  getSuggestedProcedurePrice,
  isToothNumber,
  formatProcedureTarget,
  targetTypeToDefaultToothNumber,
  parseMoneyInput,
  formatBRLValue,
  buildProcedureEvolutionText,
  calculateTreatmentPlanTotals,
  formatBudgetRecordContent,
} from "@/lib/procedures";
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
  metadata?: Json | null;
}

interface ToothProcedureRecord {
  id: string;
  odontogram_id: string;
  tooth_number: number;
  surfaces: string[] | null;
  procedure_name: string;
  status: "planned" | "in_progress" | "completed";
  cost: number | null;
  notes: string | null;
  created_at: string;
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
  const [signaturePrefill, setSignaturePrefill] = useState<SignaturePrefill | null>(null);
  const [infoSubTab, setInfoSubTab] = useState<"cadastro" | "contato" | "complemento">("cadastro");

  // Modais específicos do Clinicorp
  const [patientFormMode, setPatientFormMode] = useState<"create" | "edit" | null>(null);
  const [showReturnAlertModal, setShowReturnAlertModal] = useState(false);
  const [returnAlertForm, setReturnAlertForm] = useState({ date: "", notes: "" });

  const [showGeneralNoteModal, setShowGeneralNoteModal] = useState(false);
  const [generalNoteText, setGeneralNoteText] = useState("");

  // Tabela de Procedimentos (Catálogo Clinicorp)
  const [procedureCatalog, setProcedureCatalog] = useState<ClinicalProcedureCatalogItem[]>(() =>
    loadProcedureCatalog(),
  );
  const [showProcedureCatalogModal, setShowProcedureCatalogModal] = useState(false);
  const [catalogSelectTarget, setCatalogSelectTarget] = useState<
    "orcamento" | "evolucao" | "plano_add" | null
  >(null);

  // Orçamentos / Planejamento Multi-Procedimentos state
  const [budgetPlanTitle, setBudgetPlanTitle] = useState("Planejamento Clínico");
  const [budgetInsuranceTable, setBudgetInsuranceTable] = useState("PARTICULAR");
  const [budgetCategoryFilter, setBudgetCategoryFilter] = useState("Todas");
  const [budgetProcSearch, setBudgetProcSearch] = useState("");
  const [budgetSelectedCatalogId, setBudgetSelectedCatalogId] = useState(
    () => loadProcedureCatalog()[0]?.id || "",
  );
  const [budgetDraftItem, setBudgetDraftItem] = useState<{
    description: string;
    toothNumber: number;
    surfaces: string[];
    amount: string;
    notes: string;
  }>(() => {
    const first = loadProcedureCatalog()[0];
    return {
      description: first?.name || "",
      toothNumber: first ? targetTypeToDefaultToothNumber(first.defaultTargetType, 11) : 0,
      surfaces: [],
      amount: first ? formatBRLValue(first.defaultPriceParticular) : "",
      notes: "",
    };
  });
  const [budgetItems, setBudgetItems] = useState<TreatmentPlanItemInput[]>([]);
  const [budgetDiscount, setBudgetDiscount] = useState("");
  const [budgetPaymentForm, setBudgetPaymentForm] = useState("PIX / À vista");
  const [budgetStatus, setBudgetStatus] = useState<"Aberto" | "Aprovado" | "Executado">("Aberto");
  const [budgetPlanNotes, setBudgetPlanNotes] = useState("");
  const [syncBudgetToOdontogram, setSyncBudgetToOdontogram] = useState(true);

  // Financeiro state
  const [financeForm, setFinanceForm] = useState({
    description: "",
    amount: "",
    method: "PIX",
    status: "Pago",
  });

  // Plano de Tratamento e Lançamento na Ficha Clínica state
  const [planStatusFilter, setPlanStatusFilter] = useState<"pending" | "completed" | "all">(
    "pending",
  );
  const [showQuickAddPlanProc, setShowQuickAddPlanProc] = useState(false);
  const [quickPlanProcId, setQuickPlanProcId] = useState(() => loadProcedureCatalog()[0]?.id || "");
  const [quickPlanToothNumber, setQuickPlanToothNumber] = useState<number>(11);
  const [quickPlanSurfaces, setQuickPlanSurfaces] = useState<string[]>([]);
  const [quickPlanCost, setQuickPlanCost] = useState<string>("");
  const [quickPlanNotes, setQuickPlanNotes] = useState<string>("");

  const [executingProc, setExecutingProc] = useState<ToothProcedureRecord | null>(null);
  const [evolutionCategoryFilter, setEvolutionCategoryFilter] = useState("Todas");
  const [evolutionProcSearch, setEvolutionProcSearch] = useState("");
  const [evolutionCatalogId, setEvolutionCatalogId] = useState<string>("");
  const [evolutionProcName, setEvolutionProcName] = useState<string>("");
  const [evolutionToothNumber, setEvolutionToothNumber] = useState<number>(0);
  const [evolutionSurfaces, setEvolutionSurfaces] = useState<string[]>([]);
  const [evolutionMaterial, setEvolutionMaterial] = useState("");
  const [evolutionAnesthetic, setEvolutionAnesthetic] = useState("");
  const [evolutionCost, setEvolutionCost] = useState("");
  const [markOdontogramCompleted, setMarkOdontogramCompleted] = useState(true);
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
    hasGuardian: EMPTY_GUARDIANS_DATA.hasGuardian,
    guardianName: EMPTY_GUARDIANS_DATA.guardianName,
    guardianRelationship: EMPTY_GUARDIANS_DATA.guardianRelationship,
    guardianCpf: EMPTY_GUARDIANS_DATA.guardianCpf,
    guardianRg: EMPTY_GUARDIANS_DATA.guardianRg,
    guardianPhone: EMPTY_GUARDIANS_DATA.guardianPhone,
    guardianEmail: EMPTY_GUARDIANS_DATA.guardianEmail,
    guardianIsFinancialResponsible: EMPTY_GUARDIANS_DATA.guardianIsFinancialResponsible,
    hasSecondGuardian: EMPTY_GUARDIANS_DATA.hasSecondGuardian,
    secondGuardianName: EMPTY_GUARDIANS_DATA.secondGuardianName,
    secondGuardianRelationship: EMPTY_GUARDIANS_DATA.secondGuardianRelationship,
    secondGuardianCpf: EMPTY_GUARDIANS_DATA.secondGuardianCpf,
    secondGuardianPhone: EMPTY_GUARDIANS_DATA.secondGuardianPhone,
  });

  // Notificar barra superior global quando um paciente é aberto ou fechado
  useEffect(() => {
    if (onSelectedPatientChange) {
      onSelectedPatientChange(selectedPatient);
    }
  }, [selectedPatient, onSelectedPatientChange]);

  // Resetar estados de planejamento/execução ao trocar de paciente
  useEffect(() => {
    setBudgetItems([]);
    setBudgetDiscount("");
    setBudgetPlanNotes("");
    setExecutingProc(null);
    setNewEvolutionText("");
    setNewEvolutionTitle("Evolução em Consulta");
    setEvolutionProcName("");
    setEvolutionCatalogId("");
    setEvolutionMaterial("");
    setEvolutionAnesthetic("");
    setEvolutionCost("");
    setEvolutionSurfaces([]);
    setShowQuickAddPlanProc(false);
  }, [selectedPatient?.id]);

  // Sincronizar tabela de preços padrão com o convênio do paciente
  useEffect(() => {
    setBudgetInsuranceTable(selectedPatient?.insurance || "PARTICULAR");
  }, [selectedPatient?.id, selectedPatient?.insurance]);

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
      hasGuardian: false,
      guardianName: "",
      guardianRelationship: "Mãe",
      guardianCpf: "",
      guardianRg: "",
      guardianPhone: "",
      guardianEmail: "",
      guardianIsFinancialResponsible: true,
      hasSecondGuardian: false,
      secondGuardianName: "",
      secondGuardianRelationship: "Pai",
      secondGuardianCpf: "",
      secondGuardianPhone: "",
    });
    setPatientFormMode("create");
  }

  function openEditPatientModal(p: Patient) {
    const parsed = parsePatientNotes(p.notes, p.birth_date);
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
      notes: parsed.generalNotes,
      funnel_stage: p.funnel_stage || "tratamento",
      hasGuardian: parsed.hasGuardian,
      guardianName: parsed.guardianName,
      guardianRelationship: parsed.guardianRelationship,
      guardianCpf: parsed.guardianCpf,
      guardianRg: parsed.guardianRg,
      guardianPhone: parsed.guardianPhone,
      guardianEmail: parsed.guardianEmail,
      guardianIsFinancialResponsible: parsed.guardianIsFinancialResponsible,
      hasSecondGuardian: parsed.hasSecondGuardian,
      secondGuardianName: parsed.secondGuardianName,
      secondGuardianRelationship: parsed.secondGuardianRelationship,
      secondGuardianCpf: parsed.secondGuardianCpf,
      secondGuardianPhone: parsed.secondGuardianPhone,
    });
    setPatientFormMode("edit");
  }

  const savePatientMutation = useMutation({
    mutationFn: async () => {
      if (!patientForm.name.trim()) {
        throw new Error("O nome do paciente é obrigatório.");
      }
      const patientIsMinor = isMinorPatient(patientForm.birth_date);
      if (patientIsMinor && !patientForm.guardianName.trim()) {
        throw new Error("Para paciente menor de 18 anos, informe o nome do responsável legal.");
      }
      const serializedNotes = serializePatientNotes({
        hasGuardian: patientForm.hasGuardian || patientIsMinor,
        guardianName: patientForm.guardianName,
        guardianRelationship: patientForm.guardianRelationship,
        guardianCpf: patientForm.guardianCpf,
        guardianRg: patientForm.guardianRg,
        guardianPhone: patientForm.guardianPhone,
        guardianEmail: patientForm.guardianEmail,
        guardianIsFinancialResponsible: patientForm.guardianIsFinancialResponsible,
        hasSecondGuardian: patientForm.hasSecondGuardian,
        secondGuardianName: patientForm.secondGuardianName,
        secondGuardianRelationship: patientForm.secondGuardianRelationship,
        secondGuardianCpf: patientForm.secondGuardianCpf,
        secondGuardianPhone: patientForm.secondGuardianPhone,
        generalNotes: patientForm.notes,
      });
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
        notes: serializedNotes,
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
      queryClient.invalidateQueries({ queryKey: ["patients_quick_jump"] });
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
        .or(`name.ilike.%${term}%,cpf.ilike.%${term}%,phone.ilike.%${term}%,notes.ilike.%${term}%`)
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
            `name.ilike.%${term}%,cpf.ilike.%${term}%,phone.ilike.%${term}%,notes.ilike.%${term}%,record_number.eq.${num},legacy_patient_id.eq.${num}`,
          );
        } else {
          query = query.or(
            `name.ilike.%${term}%,cpf.ilike.%${term}%,phone.ilike.%${term}%,medical_warning.ilike.%${term}%,notes.ilike.%${term}%`,
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

  // Buscar odontograma compartilhado do paciente (sincroniza Orçamentos, Plano e Odontograma)
  const { data: patientOdontogram } = useQuery({
    queryKey: ["odontogram", selectedPatient?.id],
    enabled: !!selectedPatient?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("odontograms")
        .select("id, dentition_type, notes")
        .eq("patient_id", selectedPatient!.id)
        .maybeSingle();

      if (error && error.code !== "PGRST116") throw error;
      if (data) return data;

      const { data: created, error: createErr } = await supabase
        .from("odontograms")
        .insert({ patient_id: selectedPatient!.id, dentition_type: "permanent" })
        .select("id, dentition_type, notes")
        .single();
      if (createErr) throw createErr;
      return created;
    },
  });

  // Buscar procedimentos do plano de tratamento / odontograma
  const { data: patientProcedures = [] } = useQuery({
    queryKey: ["odontogram_procedures", patientOdontogram?.id],
    enabled: !!patientOdontogram?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("odontogram_procedures")
        .select("*")
        .eq("odontogram_id", patientOdontogram!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as ToothProcedureRecord[];
    },
  });

  async function ensurePatientOdontogramId(patientId: string): Promise<string> {
    if (patientOdontogram?.id) return patientOdontogram.id;
    const { data: existing, error: fetchErr } = await supabase
      .from("odontograms")
      .select("id")
      .eq("patient_id", patientId)
      .maybeSingle();
    if (fetchErr && fetchErr.code !== "PGRST116") throw fetchErr;
    if (existing?.id) return existing.id;

    const { data: created, error: createErr } = await supabase
      .from("odontograms")
      .insert({ patient_id: patientId, dentition_type: "permanent" })
      .select("id")
      .single();
    if (createErr) throw createErr;
    return created.id;
  }

  // Filtros do Catálogo para Orçamentos e Execução Clínica
  const budgetFilteredCatalog = useMemo(
    () =>
      filterProcedures(procedureCatalog, {
        query: budgetProcSearch,
        category: budgetCategoryFilter,
      }),
    [procedureCatalog, budgetProcSearch, budgetCategoryFilter],
  );

  const evolutionFilteredCatalog = useMemo(
    () =>
      filterProcedures(procedureCatalog, {
        query: evolutionProcSearch,
        category: evolutionCategoryFilter,
      }),
    [procedureCatalog, evolutionProcSearch, evolutionCategoryFilter],
  );

  const treatmentPlanSummary = useMemo(
    () => calculateTreatmentPlanTotals(patientProcedures),
    [patientProcedures],
  );

  const filteredPlanProcedures = useMemo(() => {
    if (planStatusFilter === "pending") {
      return patientProcedures.filter((p) => p.status !== "completed");
    }
    if (planStatusFilter === "completed") {
      return patientProcedures.filter((p) => p.status === "completed");
    }
    return patientProcedures;
  }, [patientProcedures, planStatusFilter]);

  const budgetTotals = useMemo(
    () => calculateTreatmentPlanTotals(budgetItems, parseMoneyInput(budgetDiscount)),
    [budgetItems, budgetDiscount],
  );

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
      metadata?: Json;
    }) => {
      if (!selectedPatient) return;
      const { error } = await supabase.from("clinical_records").insert({
        patient_id: selectedPatient.id,
        record_type: payload.record_type,
        record_date: new Date().toISOString(),
        title: payload.title,
        content: payload.content,
        ...(payload.metadata !== undefined ? { metadata: payload.metadata } : {}),
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
      queryClient.invalidateQueries({ queryKey: ["crc_orcamento_records"] });
      queryClient.invalidateQueries({ queryKey: ["clinic_financial_records"] });
    },
    onError: (err: Error) => {
      toast.error(`Erro ao salvar registro: ${err.message}`);
    },
  });

  // Salvar Planejamento / Orçamento Multi-Procedimentos + Sincronizar Odontograma
  const saveTreatmentBudgetMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPatient) return;

      const itemsToSave: TreatmentPlanItemInput[] =
        budgetItems.length > 0
          ? budgetItems
          : budgetDraftItem.description.trim()
            ? [
                {
                  id: `draft-${Date.now()}`,
                  procedureId: budgetSelectedCatalogId || undefined,
                  procedureCode: procedureCatalog.find((p) => p.id === budgetSelectedCatalogId)
                    ?.code,
                  procedureName: budgetDraftItem.description.trim(),
                  toothNumber: budgetDraftItem.toothNumber,
                  surfaces: isToothNumber(budgetDraftItem.toothNumber)
                    ? budgetDraftItem.surfaces
                    : [],
                  cost: parseMoneyInput(budgetDraftItem.amount),
                  notes: budgetDraftItem.notes.trim() || undefined,
                },
              ]
            : [];

      if (itemsToSave.length === 0) {
        throw new Error("Adicione ao menos um procedimento ao planejamento antes de salvar.");
      }

      const discountVal = parseMoneyInput(budgetDiscount);
      const totals = calculateTreatmentPlanTotals(itemsToSave, discountVal);
      const content = formatBudgetRecordContent({
        title: budgetPlanTitle,
        items: itemsToSave,
        discount: discountVal,
        paymentForm: budgetPaymentForm,
        status: budgetStatus,
        insuranceTable: budgetInsuranceTable,
        notes: budgetPlanNotes,
      });

      const recordTitle = `${budgetPlanTitle.trim() || "Planejamento"} [${budgetStatus}] — ${itemsToSave.length} ${itemsToSave.length === 1 ? "proc." : "procs."} — R$ ${formatBRLValue(totals.total)}`;

      const { error: recErr } = await supabase.from("clinical_records").insert({
        patient_id: selectedPatient.id,
        record_type: "orcamento",
        record_date: new Date().toISOString(),
        title: recordTitle,
        content,
        metadata: {
          kind: "treatment_plan_budget",
          insuranceTable: budgetInsuranceTable,
          paymentForm: budgetPaymentForm,
          status: budgetStatus,
          subtotal: totals.subtotal,
          discount: totals.discount,
          total: totals.total,
          items: itemsToSave,
        } as unknown as Json,
      });
      if (recErr) throw recErr;

      let syncedCount = 0;
      if (syncBudgetToOdontogram) {
        const itemsToInsert = itemsToSave.filter((item) => !item.odontogramProcedureId);
        if (itemsToInsert.length > 0) {
          const odontogramId = await ensurePatientOdontogramId(selectedPatient.id);
          const procStatus = budgetStatus === "Executado" ? "completed" : "planned";
          const rows = itemsToInsert.map((item) => ({
            odontogram_id: odontogramId,
            tooth_number: item.toothNumber,
            surfaces: isToothNumber(item.toothNumber) ? item.surfaces : [],
            procedure_name: item.procedureName,
            status: procStatus,
            cost: item.cost > 0 ? item.cost : null,
            notes: item.notes?.trim() || null,
          }));
          const { error: odoErr } = await supabase.from("odontogram_procedures").insert(rows);
          if (odoErr) throw odoErr;
          syncedCount = rows.length;
        }
      }

      const nextStage =
        budgetStatus === "Aprovado" || budgetStatus === "Executado"
          ? "tratamento"
          : selectedPatient.funnel_stage === "triagem" ||
              selectedPatient.funnel_stage === "anamnese"
            ? "orcamento"
            : null;

      if (nextStage && selectedPatient.funnel_stage !== "tratamento") {
        const { data: updated } = await supabase
          .from("patients")
          .update({ funnel_stage: nextStage })
          .eq("id", selectedPatient.id)
          .select("*")
          .single();
        if (updated) setSelectedPatient(updated as Patient);
      }

      return { count: itemsToSave.length, syncedCount };
    },
    onSuccess: (res) => {
      toast.success(
        res && res.syncedCount > 0
          ? `Planejamento salvo (${res.count} proc.) e sincronizado com Odontograma/Plano!`
          : "Planejamento / Orçamento salvo!",
      );
      setBudgetItems([]);
      setBudgetDiscount("");
      setBudgetPlanNotes("");
      queryClient.invalidateQueries({ queryKey: ["clinical_records", selectedPatient?.id] });
      queryClient.invalidateQueries({ queryKey: ["odontogram", selectedPatient?.id] });
      queryClient.invalidateQueries({ queryKey: ["odontogram_procedures"] });
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      queryClient.invalidateQueries({ queryKey: ["funnel_counts"] });
      queryClient.invalidateQueries({ queryKey: ["crc_orcamento_records"] });
      queryClient.invalidateQueries({ queryKey: ["clinic_financial_records"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Erro ao salvar planejamento.");
    },
  });

  // Aprovar orçamento salvo -> atualiza status do orçamento + lança no Financeiro + promove para Tratamento
  const approveBudgetMutation = useMutation({
    mutationFn: async (budget: ClinicalRecord) => {
      if (!selectedPatient) return;

      const updatedTitle = (budget.title || "Orçamento").includes("[Aberto]")
        ? (budget.title || "Orçamento").replace("[Aberto]", "[Aprovado]")
        : (budget.title || "Orçamento").toLowerCase().includes("aprovado")
          ? budget.title
          : `${budget.title || "Orçamento"} [Aprovado]`;

      const updatedContent = budget.content.includes("Status: Em Aberto")
        ? budget.content.replace("Status: Em Aberto", "Status: Aprovado pelo Paciente")
        : budget.content.includes("Status: Aberto")
          ? budget.content.replace("Status: Aberto", "Status: Aprovado pelo Paciente")
          : budget.content;

      await supabase
        .from("clinical_records")
        .update({ title: updatedTitle, content: updatedContent })
        .eq("id", budget.id);

      const { error: payErr } = await supabase.from("clinical_records").insert({
        patient_id: selectedPatient.id,
        record_type: "pagamento",
        record_date: new Date().toISOString(),
        title: `Recebimento de Orçamento — ${(budget.title || "").replace("Orçamento ", "")}`,
        content: `${updatedContent}\nStatus Financeiro: Pago / Aprovado`,
      });
      if (payErr) throw payErr;

      if (selectedPatient.funnel_stage !== "tratamento") {
        const { data: updated } = await supabase
          .from("patients")
          .update({ funnel_stage: "tratamento" })
          .eq("id", selectedPatient.id)
          .select("*")
          .single();
        if (updated) setSelectedPatient(updated as Patient);
      }
    },
    onSuccess: () => {
      toast.success("Orçamento aprovado e lançado na aba Financeiro e Tratamento!");
      queryClient.invalidateQueries({ queryKey: ["clinical_records", selectedPatient?.id] });
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      queryClient.invalidateQueries({ queryKey: ["funnel_counts"] });
      queryClient.invalidateQueries({ queryKey: ["crc_orcamento_records"] });
      queryClient.invalidateQueries({ queryKey: ["clinic_financial_records"] });
    },
    onError: (err: Error) => {
      toast.error(`Erro ao aprovar orçamento: ${err.message}`);
    },
  });

  // Adicionar procedimento diretamente ao Plano de Tratamento Ativo (status planned)
  const quickAddPlanProcedureMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPatient) return;
      const catalogItem = procedureCatalog.find((p) => p.id === quickPlanProcId);
      if (!catalogItem) throw new Error("Selecione um procedimento.");

      const odontogramId = await ensurePatientOdontogramId(selectedPatient.id);
      const costNum = quickPlanCost ? parseMoneyInput(quickPlanCost) : null;
      const { error } = await supabase.from("odontogram_procedures").insert({
        odontogram_id: odontogramId,
        tooth_number: quickPlanToothNumber,
        surfaces: isToothNumber(quickPlanToothNumber) ? quickPlanSurfaces : [],
        procedure_name: catalogItem.name,
        status: "planned",
        cost: costNum && costNum > 0 ? costNum : null,
        notes: quickPlanNotes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Procedimento adicionado ao Plano de Tratamento!");
      setShowQuickAddPlanProc(false);
      setQuickPlanSurfaces([]);
      setQuickPlanNotes("");
      queryClient.invalidateQueries({ queryKey: ["odontogram", selectedPatient?.id] });
      queryClient.invalidateQueries({ queryKey: ["odontogram_procedures"] });
    },
    onError: (err: Error) => {
      toast.error(`Erro ao adicionar ao plano: ${err.message}`);
    },
  });

  // Atualizar status de um procedimento do plano (Iniciar ou Concluir 1-Clique)
  const updatePlanProcedureStatusMutation = useMutation({
    mutationFn: async ({
      proc,
      newStatus,
      createEvolution = false,
    }: {
      proc: ToothProcedureRecord;
      newStatus: "planned" | "in_progress" | "completed";
      createEvolution?: boolean;
    }) => {
      if (!selectedPatient) return;
      const { error } = await supabase
        .from("odontogram_procedures")
        .update({ status: newStatus })
        .eq("id", proc.id);
      if (error) throw error;

      if (newStatus === "completed" && createEvolution) {
        const catalogMatch = procedureCatalog.find((c) => c.name === proc.procedure_name) || null;
        const targetLabel = formatProcedureTarget(proc.tooth_number, proc.surfaces);
        const evolutionContent = buildProcedureEvolutionText({
          procedureName: proc.procedure_name,
          catalogItem: catalogMatch,
          toothNumber: proc.tooth_number,
          surfaces: proc.surfaces || [],
          notes: proc.notes || undefined,
          cost: proc.cost ?? null,
        });
        const { error: recErr } = await supabase.from("clinical_records").insert({
          patient_id: selectedPatient.id,
          record_type: "evolucao",
          record_date: new Date().toISOString(),
          title: `${proc.procedure_name} · ${targetLabel}`,
          content: evolutionContent,
          metadata: {
            kind: "procedure_execution",
            procedureName: proc.procedure_name,
            toothNumber: proc.tooth_number,
            surfaces: proc.surfaces || [],
            odontogramProcedureId: proc.id,
          } as unknown as Json,
        });
        if (recErr) throw recErr;

        if (selectedPatient.funnel_stage !== "tratamento") {
          const { data: updated } = await supabase
            .from("patients")
            .update({ funnel_stage: "tratamento" })
            .eq("id", selectedPatient.id)
            .select("*")
            .single();
          if (updated) setSelectedPatient(updated as Patient);
        }
      }
    },
    onSuccess: (_data, vars) => {
      toast.success(
        vars.newStatus === "completed"
          ? "Procedimento concluído e evolução registrada no prontuário!"
          : "Status do procedimento atualizado!",
      );
      if (executingProc?.id === vars.proc.id && vars.newStatus === "completed") {
        setExecutingProc(null);
      }
      queryClient.invalidateQueries({ queryKey: ["odontogram_procedures"] });
      queryClient.invalidateQueries({ queryKey: ["clinical_records", selectedPatient?.id] });
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      queryClient.invalidateQueries({ queryKey: ["funnel_counts"] });
    },
    onError: (err: Error) => {
      toast.error(`Erro ao atualizar procedimento: ${err.message}`);
    },
  });

  const deletePlanProcedureMutation = useMutation({
    mutationFn: async (procId: string) => {
      const { error } = await supabase.from("odontogram_procedures").delete().eq("id", procId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Procedimento removido do plano.");
      queryClient.invalidateQueries({ queryKey: ["odontogram_procedures"] });
    },
    onError: (err: Error) => {
      toast.error(`Erro ao remover procedimento: ${err.message}`);
    },
  });

  // Lançar Procedimento Realizado / Evolução Estruturada na Ficha Clínica
  const launchClinicalProcedureMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPatient) return;
      if (!newEvolutionText.trim()) {
        throw new Error("Descreva o procedimento ou evolução clínica.");
      }

      const effectiveProcName =
        executingProc?.procedure_name ||
        evolutionProcName.trim() ||
        newEvolutionTitle.trim() ||
        "Evolução Clínica";
      const effectiveSurfaces = isToothNumber(evolutionToothNumber) ? evolutionSurfaces : [];
      const effectiveTitle = newEvolutionTitle.trim() || effectiveProcName;

      const { error: recErr } = await supabase.from("clinical_records").insert({
        patient_id: selectedPatient.id,
        record_type: "evolucao",
        record_date: new Date().toISOString(),
        title: effectiveTitle,
        content: newEvolutionText.trim(),
        metadata: {
          kind: "procedure_execution",
          procedureName: effectiveProcName,
          toothNumber: evolutionToothNumber,
          surfaces: effectiveSurfaces,
          materialOrShade: evolutionMaterial.trim() || null,
          anesthetic: evolutionAnesthetic.trim() || null,
          odontogramProcedureId: executingProc?.id || null,
        } as unknown as Json,
      });
      if (recErr) throw recErr;

      if (markOdontogramCompleted) {
        if (executingProc?.id) {
          const { error: updErr } = await supabase
            .from("odontogram_procedures")
            .update({ status: "completed" })
            .eq("id", executingProc.id);
          if (updErr) throw updErr;
        } else if (evolutionProcName.trim()) {
          const existingMatch = patientProcedures.find(
            (p) =>
              p.status !== "completed" &&
              p.tooth_number === evolutionToothNumber &&
              p.procedure_name.toLowerCase() === evolutionProcName.trim().toLowerCase(),
          );
          if (existingMatch) {
            const { error: updErr } = await supabase
              .from("odontogram_procedures")
              .update({ status: "completed" })
              .eq("id", existingMatch.id);
            if (updErr) throw updErr;
          } else {
            const odontogramId = await ensurePatientOdontogramId(selectedPatient.id);
            const costNum = evolutionCost ? parseMoneyInput(evolutionCost) : null;
            const { error: insErr } = await supabase.from("odontogram_procedures").insert({
              odontogram_id: odontogramId,
              tooth_number: evolutionToothNumber,
              surfaces: effectiveSurfaces,
              procedure_name: evolutionProcName.trim(),
              status: "completed",
              cost: costNum && costNum > 0 ? costNum : null,
              notes: evolutionMaterial.trim() || null,
            });
            if (insErr) throw insErr;
          }
        }
      }

      if (selectedPatient.funnel_stage !== "tratamento") {
        const { data: updated } = await supabase
          .from("patients")
          .update({ funnel_stage: "tratamento" })
          .eq("id", selectedPatient.id)
          .select("*")
          .single();
        if (updated) setSelectedPatient(updated as Patient);
      }
    },
    onSuccess: () => {
      toast.success("Procedimento realizado lançado na Ficha Clínica!");
      setExecutingProc(null);
      setNewEvolutionText("");
      setNewEvolutionTitle("Evolução em Consulta");
      setEvolutionProcName("");
      setEvolutionCatalogId("");
      setEvolutionMaterial("");
      setEvolutionAnesthetic("");
      setEvolutionCost("");
      setEvolutionSurfaces([]);
      queryClient.invalidateQueries({ queryKey: ["clinical_records", selectedPatient?.id] });
      queryClient.invalidateQueries({ queryKey: ["odontogram", selectedPatient?.id] });
      queryClient.invalidateQueries({ queryKey: ["odontogram_procedures"] });
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      queryClient.invalidateQueries({ queryKey: ["funnel_counts"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Erro ao lançar procedimento na ficha clínica.");
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

  const deletePatientMutation = useMutation({
    mutationFn: async (patientId: string) => {
      const { error } = await supabase.from("patients").delete().eq("id", patientId);
      if (error) throw error;
      return patientId;
    },
    onSuccess: (deletedId) => {
      toast.success("Paciente excluído com sucesso.");
      if (selectedPatient?.id === deletedId) {
        setSelectedPatient(null);
      }
      setPatientFormMode(null);
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      queryClient.invalidateQueries({ queryKey: ["funnel_counts"] });
      queryClient.invalidateQueries({ queryKey: ["patients_quick_jump"] });
    },
    onError: (err: Error) => {
      toast.error(`Erro ao excluir paciente: ${err.message}`);
    },
  });

  function handleConfirmDeletePatient(patient: Patient, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    const ok = window.confirm(
      `Tem certeza que deseja excluir o paciente "${patient.name}" (Prontuário #${patient.record_number})?\n\nEsta ação removerá o cadastro e o prontuário permanentemente.`,
    );
    if (ok) {
      deletePatientMutation.mutate(patient.id);
    }
  }

  function clearAllFilters() {
    setSearch("");
    setSelectedInsurance("all");
    setSelectedFunnelStage("all");
    setSelectedLetter("Todos");
    setOnlyWarnings(false);
    setSortBy("name_asc");
    setPage(1);
  }

  function selectCatalogItemForBudget(
    proc: ClinicalProcedureCatalogItem,
    insuranceOverride?: string,
  ) {
    const ins = insuranceOverride ?? budgetInsuranceTable;
    const price = getSuggestedProcedurePrice(proc, ins);
    const defaultTooth = targetTypeToDefaultToothNumber(
      proc.defaultTargetType,
      isToothNumber(budgetDraftItem.toothNumber) ? budgetDraftItem.toothNumber : 11,
    );
    setBudgetSelectedCatalogId(proc.id);
    setBudgetDraftItem((prev) => ({
      ...prev,
      description: proc.name,
      toothNumber: defaultTooth,
      surfaces: isToothNumber(defaultTooth) ? prev.surfaces : [],
      amount: formatBRLValue(price),
    }));
  }

  function selectCatalogItemForQuickPlan(proc: ClinicalProcedureCatalogItem) {
    const price = getSuggestedProcedurePrice(proc, selectedPatient?.insurance);
    const defaultTooth = targetTypeToDefaultToothNumber(
      proc.defaultTargetType,
      isToothNumber(quickPlanToothNumber) ? quickPlanToothNumber : 11,
    );
    setQuickPlanProcId(proc.id);
    setQuickPlanToothNumber(defaultTooth);
    if (!isToothNumber(defaultTooth)) setQuickPlanSurfaces([]);
    setQuickPlanCost(price > 0 ? price.toFixed(2) : "");
  }

  function selectCatalogItemForEvolution(
    proc: ClinicalProcedureCatalogItem,
    keepCurrentTarget: boolean = false,
  ) {
    const nextTooth = keepCurrentTarget
      ? evolutionToothNumber
      : targetTypeToDefaultToothNumber(
          proc.defaultTargetType,
          isToothNumber(evolutionToothNumber) ? evolutionToothNumber : 11,
        );
    const nextSurfaces = isToothNumber(nextTooth) ? evolutionSurfaces : [];
    const price = getSuggestedProcedurePrice(proc, selectedPatient?.insurance);

    setEvolutionCatalogId(proc.id);
    setEvolutionProcName(proc.name);
    setEvolutionToothNumber(nextTooth);
    if (!isToothNumber(nextTooth)) setEvolutionSurfaces([]);
    setEvolutionCost(price > 0 ? price.toFixed(2) : "");
    setNewEvolutionTitle(`${proc.name} · ${formatProcedureTarget(nextTooth, nextSurfaces)}`);
    setNewEvolutionText(
      buildProcedureEvolutionText({
        procedureName: proc.name,
        catalogItem: proc,
        toothNumber: nextTooth,
        surfaces: nextSurfaces,
        materialOrShade: evolutionMaterial,
        anesthetic: evolutionAnesthetic,
        cost: price > 0 ? price : null,
      }),
    );
  }

  function startExecutingPlanProcedure(proc: ToothProcedureRecord) {
    const match = procedureCatalog.find((c) => c.name === proc.procedure_name) || null;
    const surfaces = proc.surfaces || [];
    setExecutingProc(proc);
    setEvolutionCatalogId(match?.id || "");
    setEvolutionProcName(proc.procedure_name);
    setEvolutionToothNumber(proc.tooth_number);
    setEvolutionSurfaces(surfaces);
    setEvolutionMaterial("");
    setEvolutionAnesthetic("");
    setEvolutionCost(proc.cost != null && Number(proc.cost) > 0 ? String(proc.cost) : "");
    setMarkOdontogramCompleted(true);
    setNewEvolutionTitle(
      `${proc.procedure_name} · ${formatProcedureTarget(proc.tooth_number, surfaces)}`,
    );
    setNewEvolutionText(
      buildProcedureEvolutionText({
        procedureName: proc.procedure_name,
        catalogItem: match,
        toothNumber: proc.tooth_number,
        surfaces,
        notes: proc.notes || undefined,
        cost: proc.cost ?? null,
      }),
    );
    setTimeout(() => {
      document
        .getElementById("clinical-execution-form")
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 50);
  }

  function importPlannedToBudget() {
    const planned = patientProcedures.filter((p) => p.status !== "completed");
    if (planned.length === 0) {
      toast.info("Não há procedimentos planejados no Odontograma para importar.");
      return;
    }
    const existingIds = new Set(budgetItems.map((i) => i.odontogramProcedureId).filter(Boolean));
    const toImport = planned.filter((p) => !existingIds.has(p.id));
    if (toImport.length === 0) {
      toast.info("Todos os procedimentos planejados do Odontograma já estão neste orçamento.");
      return;
    }
    const imported: TreatmentPlanItemInput[] = toImport.map((p) => {
      const match = procedureCatalog.find((c) => c.name === p.procedure_name);
      const cost =
        p.cost != null && Number(p.cost) > 0
          ? Number(p.cost)
          : match
            ? getSuggestedProcedurePrice(match, budgetInsuranceTable)
            : 0;
      return {
        id: `odo-${p.id}`,
        procedureId: match?.id,
        procedureCode: match?.code,
        procedureName: p.procedure_name,
        category: match?.category,
        toothNumber: p.tooth_number,
        surfaces: p.surfaces || [],
        cost,
        notes: p.notes || undefined,
        odontogramProcedureId: p.id,
      };
    });
    setBudgetItems((prev) => [...prev, ...imported]);
    toast.success(`${imported.length} procedimento(s) importado(s) do Odontograma!`);
  }

  function renderToothRegionSelect(
    value: number,
    onChange: (toothNumber: number) => void,
    className?: string,
  ) {
    return (
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={cn(
          "w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground",
          className,
        )}
      >
        <optgroup label="Regiões Gerais">
          {REGION_OPTIONS.map((reg) => (
            <option key={reg.code} value={reg.code}>
              {reg.label}
            </option>
          ))}
        </optgroup>
        <optgroup label="Dentes Permanentes (11–48)">
          {PERMANENT_TOOTH_NUMBERS.map((num) => (
            <option key={num} value={num}>
              Dente {num}
            </option>
          ))}
        </optgroup>
        <optgroup label="Dentes Decíduos (51–85)">
          {DECIDUOUS_TOOTH_NUMBERS.map((num) => (
            <option key={num} value={num}>
              Dente {num} (Decíduo)
            </option>
          ))}
        </optgroup>
      </select>
    );
  }

  function renderSurfaceToggleRow(
    toothNumber: number,
    surfaces: string[],
    onChange: (next: string[]) => void,
  ) {
    if (!isToothNumber(toothNumber)) return null;
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-semibold text-muted-foreground mr-1">Faces:</span>
        {(["O", "M", "D", "V", "L"] as const).map((code) => {
          const active = surfaces.includes(code);
          return (
            <button
              key={code}
              type="button"
              onClick={() =>
                onChange(active ? surfaces.filter((s) => s !== code) : [...surfaces, code])
              }
              className={cn(
                "px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer",
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-foreground border-border hover:bg-muted",
              )}
            >
              {code}
            </button>
          );
        })}
      </div>
    );
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
    const parsedSelectedGuardians = parsePatientNotes(
      selectedPatient.notes,
      selectedPatient.birth_date,
    );
    const selectedPatientAge = getPatientAge(selectedPatient.birth_date);
    const selectedPatientIsMinor = isMinorPatient(selectedPatient.birth_date);
    const selectedAgeLabel = formatPatientAgeLabel(selectedPatient.birth_date);

    return (
      <div className="space-y-4">
        {!hideTopBar && (
          <div className="rounded-2xl apple-glass-header text-white px-5 py-3.5 shadow-md flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
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
                className="rounded-lg bg-primary hover:bg-primary-deep text-white px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Novo Agendamento</span>
              </button>
            </div>
          </div>
        )}

        {/* IDENTIFICAÇÃO DO PACIENTE ATIVO */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 rounded-2xl bg-card border border-border shadow-petal">
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => setSelectedPatient(null)}
              className="min-h-10 px-3 rounded-full border border-border bg-background hover:bg-accent/60 inline-flex items-center gap-1.5 text-xs font-semibold text-foreground transition-colors cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5 text-primary" />
              <span>Voltar para Pacientes</span>
            </button>
            <span className="text-border hidden sm:inline">|</span>
            <span className="text-xs font-mono font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-full">
              Prontuário #{selectedPatient.record_number}
            </span>
            <h2 className="font-display text-xl sm:text-2xl font-normal text-foreground">
              {selectedPatient.name}
            </h2>
            {selectedPatientIsMinor && selectedPatientAge !== null && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30 text-[11px] font-bold uppercase">
                <Baby className="h-3 w-3" />
                Menor · {selectedPatientAge} {selectedPatientAge === 1 ? "ano" : "anos"}
              </span>
            )}
            {parsedSelectedGuardians.guardianName && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-500/12 text-indigo-800 dark:text-indigo-300 border border-indigo-500/25 text-[11px] font-semibold">
                <Users className="h-3 w-3" />
                Resp.: {parsedSelectedGuardians.guardianName} (
                {parsedSelectedGuardians.guardianRelationship})
              </span>
            )}
            {selectedPatient.insurance && (
              <span className="px-2.5 py-0.5 rounded-full bg-muted text-[11px] font-semibold uppercase text-foreground border border-border/60">
                {selectedPatient.insurance}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => openEditPatientModal(selectedPatient)}
              className="min-h-10 px-4 py-2 rounded-full border border-border bg-background hover:bg-accent/60 text-xs font-semibold text-foreground flex items-center gap-1.5 cursor-pointer"
            >
              <Edit className="h-3.5 w-3.5 text-primary" />
              <span>Editar Cadastro</span>
            </button>
            <button
              onClick={(e) => handleConfirmDeletePatient(selectedPatient, e)}
              disabled={deletePatientMutation.isPending}
              className="min-h-10 px-4 py-2 rounded-full border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-xs font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Excluir Paciente"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Excluir Paciente</span>
            </button>
            <button
              onClick={() => setShowAppointmentModal(true)}
              className="min-h-10 px-4 py-2 rounded-full bg-primary hover:bg-primary-deep text-primary-foreground text-xs font-semibold flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Agendar Consulta</span>
            </button>
          </div>
        </div>

        {/* ALERTA CLÍNICO (SE EXISTIR) */}
        {selectedPatient.medical_warning && (
          <div className="flex items-center justify-between gap-3 px-5 py-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-xs font-semibold text-rose-700 dark:text-rose-300">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
              <span>Alerta Médico / Anamnese: {selectedPatient.medical_warning}</span>
            </div>
            <button
              onClick={() => openEditPatientModal(selectedPatient)}
              className="min-h-9 px-3 rounded-full bg-rose-500/15 hover:bg-rose-500/25 text-rose-800 dark:text-rose-200 font-semibold cursor-pointer shrink-0"
            >
              Editar Alerta
            </button>
          </div>
        )}

        {/* BARRA DE 13 ABAS DO PRONTUÁRIO — APPLE HIG SEGMENTED NAVIGATION */}
        <div className="rounded-2xl bg-card border border-border p-1.5 shadow-petal overflow-x-auto">
          <div className="flex items-center gap-1 min-w-max" role="tablist">
            {CLINICORP_TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "min-h-10 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
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
                  className="text-xs font-semibold text-primary hover:underline flex items-center gap-1 cursor-pointer"
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
                        ? `${new Date(selectedPatient.birth_date + "T12:00:00").toLocaleDateString("pt-BR")}${selectedAgeLabel ? ` · ${selectedAgeLabel}` : ""}`
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
                    { label: "Observações", value: parsedSelectedGuardians.generalNotes || "-" },
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
                        href={`https://web.whatsapp.com/send?phone=55${selectedPatient.phone.replace(/\D/g, "")}`}
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
                    {
                      label: "Notas do Cadastro",
                      value: parsedSelectedGuardians.generalNotes || "-",
                    },
                  ].map((row) => (
                    <div key={row.label} className="py-2.5 flex items-center justify-between gap-3">
                      <span className="font-semibold text-foreground shrink-0">{row.label}</span>
                      <span className="text-muted-foreground text-right">{row.value}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Card Destacado: Responsável Legal / Financeiro */}
              {(selectedPatientIsMinor ||
                parsedSelectedGuardians.guardianName ||
                parsedSelectedGuardians.secondGuardianName) && (
                <div className="p-4 rounded-xl border border-indigo-500/25 bg-indigo-500/[0.05] space-y-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-foreground flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-primary" />
                      <span>Responsável Legal / Financeiro</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => openEditPatientModal(selectedPatient)}
                      className="text-[11px] font-semibold text-primary hover:underline cursor-pointer"
                    >
                      Editar
                    </button>
                  </div>

                  {parsedSelectedGuardians.guardianName ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-foreground">
                          {parsedSelectedGuardians.guardianName}
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                          {parsedSelectedGuardians.guardianRelationship}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground space-y-0.5">
                        {parsedSelectedGuardians.guardianCpf && (
                          <div>CPF: {parsedSelectedGuardians.guardianCpf}</div>
                        )}
                        {parsedSelectedGuardians.guardianRg && (
                          <div>RG: {parsedSelectedGuardians.guardianRg}</div>
                        )}
                        {parsedSelectedGuardians.guardianPhone && (
                          <div>Tel: {parsedSelectedGuardians.guardianPhone}</div>
                        )}
                        {parsedSelectedGuardians.guardianEmail && (
                          <div>E-mail: {parsedSelectedGuardians.guardianEmail}</div>
                        )}
                        <div>
                          Resp. Financeiro:{" "}
                          <strong className="text-foreground">
                            {parsedSelectedGuardians.guardianIsFinancialResponsible ? "Sim" : "Não"}
                          </strong>
                        </div>
                      </div>
                      {parsedSelectedGuardians.guardianPhone && (
                        <a
                          href={buildWhatsAppUniversalUrl(parsedSelectedGuardians.guardianPhone)}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1.5 w-full py-1.5 rounded-lg border border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold flex items-center justify-center gap-1.5 hover:bg-emerald-500/20 transition-colors text-[11px]"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                          <span>WhatsApp do Responsável</span>
                        </a>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-[11px] text-amber-800 dark:text-amber-300">
                        Paciente menor de 18 anos sem dados do responsável cadastrados.
                      </p>
                      <button
                        type="button"
                        onClick={() => openEditPatientModal(selectedPatient)}
                        className="w-full py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-900 dark:text-amber-200 font-semibold cursor-pointer text-[11px]"
                      >
                        + Cadastrar Responsável Legal
                      </button>
                    </div>
                  )}

                  {parsedSelectedGuardians.secondGuardianName && (
                    <div className="pt-2.5 border-t border-border/60 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-foreground">
                          2º Resp.: {parsedSelectedGuardians.secondGuardianName}
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-semibold">
                          {parsedSelectedGuardians.secondGuardianRelationship}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {parsedSelectedGuardians.secondGuardianCpf &&
                          `CPF: ${parsedSelectedGuardians.secondGuardianCpf}`}
                        {parsedSelectedGuardians.secondGuardianCpf &&
                          parsedSelectedGuardians.secondGuardianPhone &&
                          " · "}
                        {parsedSelectedGuardians.secondGuardianPhone &&
                          `Tel: ${parsedSelectedGuardians.secondGuardianPhone}`}
                      </div>
                    </div>
                  )}
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
                      <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
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
                      <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
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
                      <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
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
                      <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
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

                {categorizedRecords.generalNotes.length === 0 &&
                !parsedSelectedGuardians.generalNotes ? (
                  <div className="py-4 flex items-center gap-3.5">
                    <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
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
                    {parsedSelectedGuardians.generalNotes && (
                      <div className="p-3.5 rounded-xl bg-muted/40 border border-border text-xs">
                        <span className="font-semibold text-foreground block mb-0.5">
                          Observação do Cadastro:
                        </span>
                        <span className="text-muted-foreground whitespace-pre-line">
                          {parsedSelectedGuardians.generalNotes}
                        </span>
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
            ABA 2: ORÇAMENTOS (MONTADOR DE PLANEJAMENTO CLINICORP)
           ==================================================================== */}
        {activeTab === "orcamentos" && (
          <div className="space-y-4">
            {/* Barra de ações rápidas do Planejamento */}
            <div className="rounded-2xl bg-card border border-border px-5 py-3.5 shadow-sm flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-primary" />
                  <span>Planejamento Clínico & Orçamentos</span>
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  Monte orçamentos com múltiplos procedimentos da tabela clínica, selecione dentes e
                  faces e sincronize direto com o Odontograma e Plano de Tratamento.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={importPlannedToBudget}
                  className="px-3.5 py-2 rounded-xl border border-primary/30 bg-primary/8 hover:bg-primary/15 text-xs font-semibold text-primary flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>
                    Importar Planejados do Odontograma (
                    {patientProcedures.filter((p) => p.status !== "completed").length})
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCatalogSelectTarget("orcamento");
                    setShowProcedureCatalogModal(true);
                  }}
                  className="px-3.5 py-2 rounded-xl border border-border bg-background hover:bg-muted text-xs font-semibold text-foreground flex items-center gap-1.5 cursor-pointer"
                >
                  <Settings2 className="h-3.5 w-3.5 text-primary" />
                  <span>Tabela de Procedimentos e Preços</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* COLUNA ESQUERDA: MONTADOR MULTI-PROCEDIMENTOS */}
              <div className="lg:col-span-6 rounded-2xl bg-card border border-border p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <Plus className="h-4 w-4 text-primary" />
                    <span>Montar Novo Planejamento / Orçamento</span>
                  </h4>
                  <select
                    value={budgetInsuranceTable}
                    onChange={(e) => {
                      const nextIns = e.target.value;
                      setBudgetInsuranceTable(nextIns);
                      const currentCatItem = procedureCatalog.find(
                        (p) => p.id === budgetSelectedCatalogId,
                      );
                      if (currentCatItem) {
                        selectCatalogItemForBudget(currentCatItem, nextIns);
                      }
                    }}
                    className="rounded-lg border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-foreground"
                    title="Tabela de Preços Aplicada"
                  >
                    <option value="PARTICULAR">Tabela: Particular</option>
                    {selectedPatient.insurance && selectedPatient.insurance !== "PARTICULAR" && (
                      <option value={selectedPatient.insurance}>
                        Tabela: {selectedPatient.insurance} (Convênio)
                      </option>
                    )}
                    <option value="CONVÊNIO">Tabela: Convênio / Reduzida</option>
                  </select>
                </div>

                {/* Construtor de Item do Planejamento */}
                <div className="p-4 rounded-2xl bg-muted/25 border border-border/80 space-y-3 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="font-semibold text-muted-foreground block mb-1">
                        Especialidade
                      </label>
                      <select
                        value={budgetCategoryFilter}
                        onChange={(e) => setBudgetCategoryFilter(e.target.value)}
                        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                      >
                        <option value="Todas">Todas as Especialidades</option>
                        {PROCEDURE_CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="font-semibold text-muted-foreground block mb-1">
                        Buscar na Tabela
                      </label>
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <input
                          type="text"
                          value={budgetProcSearch}
                          onChange={(e) => setBudgetProcSearch(e.target.value)}
                          placeholder="Resina, canal, clareamento..."
                          className="w-full rounded-xl border border-border bg-background pl-8 pr-3 py-2 text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="font-semibold text-foreground block mb-1">
                      Selecionar Procedimento do Catálogo ({budgetFilteredCatalog.length})
                    </label>
                    <select
                      value={budgetSelectedCatalogId}
                      onChange={(e) => {
                        const chosen = procedureCatalog.find((p) => p.id === e.target.value);
                        if (chosen) selectCatalogItemForBudget(chosen);
                      }}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                    >
                      {budgetFilteredCatalog.length === 0 ? (
                        <option value="">Nenhum procedimento encontrado</option>
                      ) : (
                        budgetFilteredCatalog.map((proc) => (
                          <option key={proc.id} value={proc.id}>
                            [{proc.code}] {proc.name} — R${" "}
                            {formatBRLValue(getSuggestedProcedurePrice(proc, budgetInsuranceTable))}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="font-semibold text-foreground block mb-1">
                      Descrição do Item *
                    </label>
                    <input
                      type="text"
                      value={budgetDraftItem.description}
                      onChange={(e) =>
                        setBudgetDraftItem({ ...budgetDraftItem, description: e.target.value })
                      }
                      placeholder="Nome do procedimento no orçamento"
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-semibold text-foreground block mb-1">
                        Dente / Região
                      </label>
                      {renderToothRegionSelect(budgetDraftItem.toothNumber, (toothNumber) =>
                        setBudgetDraftItem((prev) => ({
                          ...prev,
                          toothNumber,
                          surfaces: isToothNumber(toothNumber) ? prev.surfaces : [],
                        })),
                      )}
                    </div>
                    <div>
                      <label className="font-semibold text-foreground block mb-1">
                        Valor (R$) *
                      </label>
                      <input
                        type="text"
                        value={budgetDraftItem.amount}
                        onChange={(e) =>
                          setBudgetDraftItem({ ...budgetDraftItem, amount: e.target.value })
                        }
                        placeholder="Ex: 290,00"
                        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold"
                      />
                    </div>
                  </div>

                  {renderSurfaceToggleRow(
                    budgetDraftItem.toothNumber,
                    budgetDraftItem.surfaces,
                    (surfaces) => setBudgetDraftItem((prev) => ({ ...prev, surfaces })),
                  )}

                  <div>
                    <input
                      type="text"
                      value={budgetDraftItem.notes}
                      onChange={(e) =>
                        setBudgetDraftItem({ ...budgetDraftItem, notes: e.target.value })
                      }
                      placeholder="Observação técnica do item (opcional: cor A2, siso incluso...)"
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (!budgetDraftItem.description.trim()) {
                        toast.error("Informe ou selecione o procedimento.");
                        return;
                      }
                      const catProc = procedureCatalog.find(
                        (p) => p.id === budgetSelectedCatalogId,
                      );
                      const newItem: TreatmentPlanItemInput = {
                        id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                        procedureId: catProc?.id,
                        procedureCode: catProc?.code,
                        procedureName: budgetDraftItem.description.trim(),
                        category: catProc?.category,
                        toothNumber: budgetDraftItem.toothNumber,
                        surfaces: isToothNumber(budgetDraftItem.toothNumber)
                          ? budgetDraftItem.surfaces
                          : [],
                        cost: parseMoneyInput(budgetDraftItem.amount),
                        notes: budgetDraftItem.notes.trim() || undefined,
                      };
                      setBudgetItems((prev) => [...prev, newItem]);
                      setBudgetDraftItem((prev) => ({ ...prev, notes: "", surfaces: [] }));
                      toast.success("Item adicionado ao planejamento!");
                    }}
                    className="w-full py-2 rounded-xl border border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Adicionar Item ao Planejamento</span>
                  </button>
                </div>

                {/* Lista de Itens do Planejamento em Montagem */}
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-foreground">
                      Itens do Planejamento ({budgetItems.length})
                    </span>
                    {budgetItems.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setBudgetItems([])}
                        className="text-[11px] text-rose-600 hover:underline cursor-pointer"
                      >
                        Limpar lista
                      </button>
                    )}
                  </div>

                  {budgetItems.length === 0 ? (
                    <div className="p-4 rounded-xl border border-dashed border-border text-center text-[11px] text-muted-foreground">
                      Adicione procedimentos acima ou importe do Odontograma. (Se salvar direto,
                      usaremos o procedimento preenchido no formulário acima.)
                    </div>
                  ) : (
                    <div className="divide-y divide-border rounded-xl border border-border overflow-hidden bg-background">
                      {budgetItems.map((item) => (
                        <div key={item.id} className="p-3 flex items-center justify-between gap-2">
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="px-2 py-0.5 rounded bg-primary/10 text-primary font-mono font-bold text-[11px]">
                                {formatProcedureTarget(item.toothNumber, item.surfaces)}
                              </span>
                              <span className="font-semibold text-foreground">
                                {item.procedureName}
                              </span>
                            </div>
                            {item.notes && (
                              <p className="text-[11px] text-muted-foreground">{item.notes}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2.5 shrink-0">
                            <span className="font-bold text-foreground">
                              R$ {formatBRLValue(item.cost)}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setBudgetItems((prev) => prev.filter((i) => i.id !== item.id))
                              }
                              className="text-muted-foreground hover:text-rose-600 cursor-pointer p-1"
                              title="Remover item"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Fechamento do Orçamento */}
                <div className="space-y-3 pt-2 border-t border-border text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-semibold text-foreground block mb-1">
                        Título do Planejamento
                      </label>
                      <input
                        type="text"
                        value={budgetPlanTitle}
                        onChange={(e) => setBudgetPlanTitle(e.target.value)}
                        placeholder="Ex: Reabilitação Estética"
                        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-foreground block mb-1">
                        Desconto (R$ opcional)
                      </label>
                      <input
                        type="text"
                        value={budgetDiscount}
                        onChange={(e) => setBudgetDiscount(e.target.value)}
                        placeholder="Ex: 100,00"
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
                        value={budgetPaymentForm}
                        onChange={(e) => setBudgetPaymentForm(e.target.value)}
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
                        value={budgetStatus}
                        onChange={(e) =>
                          setBudgetStatus(e.target.value as "Aberto" | "Aprovado" | "Executado")
                        }
                        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                      >
                        <option value="Aberto">Em Aberto</option>
                        <option value="Aprovado">Aprovado pelo Paciente</option>
                        <option value="Executado">Executado</option>
                      </select>
                    </div>
                  </div>

                  <input
                    type="text"
                    value={budgetPlanNotes}
                    onChange={(e) => setBudgetPlanNotes(e.target.value)}
                    placeholder="Condições / observações do orçamento (ex: 50% entrada + 3x no cartão)"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                  />

                  <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={syncBudgetToOdontogram}
                      onChange={(e) => setSyncBudgetToOdontogram(e.target.checked)}
                      className="rounded border-border text-primary"
                    />
                    <span>Sincronizar procedimentos no Odontograma e no Plano de Tratamento</span>
                  </label>

                  {budgetItems.length > 0 && (
                    <div className="p-3.5 rounded-xl bg-primary/8 border border-primary/20 flex items-center justify-between">
                      <div className="space-y-0.5">
                        <div className="text-[11px] text-muted-foreground">
                          Subtotal: R$ {formatBRLValue(budgetTotals.subtotal)}
                          {budgetTotals.discount > 0 &&
                            ` · Desconto: - R$ ${formatBRLValue(budgetTotals.discount)}`}
                        </div>
                        <div className="text-sm font-bold text-primary">
                          Total Final: R$ {formatBRLValue(budgetTotals.total)}
                        </div>
                      </div>
                      <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-card border border-border">
                        {budgetItems.length} {budgetItems.length === 1 ? "item" : "itens"}
                      </span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => saveTreatmentBudgetMutation.mutate()}
                    disabled={saveTreatmentBudgetMutation.isPending}
                    className="w-full py-2.5 rounded-xl bg-primary hover:bg-primary-deep text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {saveTreatmentBudgetMutation.isPending
                      ? "Salvando Planejamento..."
                      : "Salvar Planejamento / Orçamento"}
                  </button>
                </div>
              </div>

              {/* COLUNA DIREITA: ORÇAMENTOS SALVOS */}
              <div className="lg:col-span-6 rounded-2xl bg-card border border-border p-5 shadow-sm space-y-4">
                <h4 className="text-sm font-bold text-foreground">
                  Orçamentos e Planejamentos Salvos ({categorizedRecords.budgets.length})
                </h4>
                {categorizedRecords.budgets.length === 0 ? (
                  <div className="py-12 text-center text-xs text-muted-foreground">
                    Nenhum orçamento cadastrado ainda para este paciente.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {categorizedRecords.budgets.map((b) => {
                      const isApproved =
                        (b.title || "").toLowerCase().includes("aprovado") ||
                        b.content.toLowerCase().includes("aprovado pelo paciente");
                      return (
                        <div
                          key={b.id}
                          className="p-4 rounded-xl border border-border bg-background flex flex-col gap-3 text-xs"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-foreground">{b.title}</span>
                                <span
                                  className={cn(
                                    "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                                    isApproved
                                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                      : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
                                  )}
                                >
                                  {isApproved ? "Aprovado" : "Em Aberto"}
                                </span>
                              </div>
                              <p className="text-muted-foreground whitespace-pre-line leading-relaxed">
                                {b.content}
                              </p>
                              <div className="text-[11px] text-muted-foreground font-mono pt-1">
                                Criado em {new Date(b.record_date).toLocaleDateString("pt-BR")}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
                            <button
                              type="button"
                              onClick={() => approveBudgetMutation.mutate(b)}
                              disabled={approveBudgetMutation.isPending}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 cursor-pointer disabled:opacity-50"
                            >
                              {isApproved
                                ? "Lançar Novo Recebimento"
                                : "Aprovar & Lançar Financeiro"}
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteClinicalRecordMutation.mutate(b.id)}
                              className="p-1.5 text-muted-foreground hover:text-rose-600 cursor-pointer"
                              title="Excluir orçamento"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
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
                <Camera className="h-4 w-4 text-primary" />
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
                  className="w-full py-2.5 rounded-xl bg-primary text-white text-xs font-semibold cursor-pointer"
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
            ABA 5: PLANO E FICHA CLÍNICA (PLANO ATIVO + EXECUÇÃO CLINICORP)
           ==================================================================== */}
        {activeTab === "plano_ficha" && (
          <div className="space-y-5">
            {/* PAINEL 1: PLANO DE TRATAMENTO ATIVO */}
            <div className="rounded-2xl bg-card border border-border p-5 shadow-sm space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <ListChecks className="h-4 w-4 text-primary" />
                    <span>Plano de Tratamento Ativo</span>
                    <span className="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-bold">
                      {treatmentPlanSummary.completedCount} de {treatmentPlanSummary.totalCount}{" "}
                      concluídos · {treatmentPlanSummary.completionPercent}%
                    </span>
                  </h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    A realizar:{" "}
                    <strong className="text-foreground">
                      R$ {formatBRLValue(treatmentPlanSummary.plannedValue)}
                    </strong>{" "}
                    · Já realizado:{" "}
                    <strong className="text-emerald-700 dark:text-emerald-400">
                      R$ {formatBRLValue(treatmentPlanSummary.completedValue)}
                    </strong>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowQuickAddPlanProc((prev) => !prev);
                      if (!showQuickAddPlanProc && !quickPlanCost && procedureCatalog[0]) {
                        selectCatalogItemForQuickPlan(procedureCatalog[0]);
                      }
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary-deep text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Adicionar Procedimento ao Plano</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCatalogSelectTarget("evolucao");
                      setShowProcedureCatalogModal(true);
                    }}
                    className="px-3.5 py-1.5 rounded-xl border border-border bg-background hover:bg-muted text-xs font-semibold text-foreground flex items-center gap-1.5 cursor-pointer"
                  >
                    <Settings2 className="h-3.5 w-3.5 text-primary" />
                    <span>Tabela de Procedimentos</span>
                  </button>
                </div>
              </div>

              {/* Barra de Progresso */}
              {treatmentPlanSummary.totalCount > 0 && (
                <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-300"
                    style={{ width: `${treatmentPlanSummary.completionPercent}%` }}
                  />
                </div>
              )}

              {/* Formulário Rápido: Adicionar Procedimento ao Plano */}
              {showQuickAddPlanProc && (
                <div className="p-4 rounded-2xl border border-primary/30 bg-primary/[0.03] space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-foreground">
                      Novo Procedimento Planejado (sincroniza com Odontograma)
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowQuickAddPlanProc(false)}
                      className="text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="sm:col-span-2">
                      <label className="font-semibold text-muted-foreground block mb-1">
                        Procedimento
                      </label>
                      <select
                        value={quickPlanProcId}
                        onChange={(e) => {
                          const p = procedureCatalog.find((c) => c.id === e.target.value);
                          if (p) selectCatalogItemForQuickPlan(p);
                        }}
                        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                      >
                        {procedureCatalog.map((p) => (
                          <option key={p.id} value={p.id}>
                            [{p.code}] {p.name} — R${" "}
                            {formatBRLValue(
                              getSuggestedProcedurePrice(p, selectedPatient.insurance),
                            )}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="font-semibold text-muted-foreground block mb-1">
                        Dente / Região
                      </label>
                      {renderToothRegionSelect(quickPlanToothNumber, (num) => {
                        setQuickPlanToothNumber(num);
                        if (!isToothNumber(num)) setQuickPlanSurfaces([]);
                      })}
                    </div>
                    <div>
                      <label className="font-semibold text-muted-foreground block mb-1">
                        Valor (R$)
                      </label>
                      <input
                        type="text"
                        value={quickPlanCost}
                        onChange={(e) => setQuickPlanCost(e.target.value)}
                        placeholder="Ex: 250,00"
                        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                      />
                    </div>
                  </div>
                  {renderSurfaceToggleRow(
                    quickPlanToothNumber,
                    quickPlanSurfaces,
                    setQuickPlanSurfaces,
                  )}
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={quickPlanNotes}
                      onChange={(e) => setQuickPlanNotes(e.target.value)}
                      placeholder="Observação opcional do planejamento..."
                      className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => quickAddPlanProcedureMutation.mutate()}
                      disabled={quickAddPlanProcedureMutation.isPending}
                      className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary-deep cursor-pointer shrink-0"
                    >
                      Incluir no Plano
                    </button>
                  </div>
                </div>
              )}

              {/* Abas de Filtro do Plano */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                {[
                  {
                    id: "pending" as const,
                    label: `A Realizar (${treatmentPlanSummary.plannedCount + treatmentPlanSummary.inProgressCount})`,
                  },
                  {
                    id: "completed" as const,
                    label: `Concluídos (${treatmentPlanSummary.completedCount})`,
                  },
                  {
                    id: "all" as const,
                    label: `Todos (${treatmentPlanSummary.totalCount})`,
                  },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setPlanStatusFilter(tab.id)}
                    className={cn(
                      "px-3 py-1.5 rounded-full font-semibold border transition-colors cursor-pointer",
                      planStatusFilter === tab.id
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border hover:text-foreground",
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Checklist de Procedimentos */}
              {filteredPlanProcedures.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground rounded-xl border border-dashed border-border">
                  {patientProcedures.length === 0
                    ? "Nenhum procedimento no Plano de Tratamento ainda. Adicione acima, no Odontograma ou crie um Orçamento."
                    : "Nenhum procedimento nesta categoria de filtro."}
                </div>
              ) : (
                <div className="divide-y divide-border rounded-2xl border border-border overflow-hidden bg-background">
                  {filteredPlanProcedures.map((proc) => {
                    const isCurrentlyExecuting = executingProc?.id === proc.id;
                    return (
                      <div
                        key={proc.id}
                        className={cn(
                          "p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs transition-colors",
                          isCurrentlyExecuting ? "bg-primary/8" : "hover:bg-muted/30",
                        )}
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary font-mono font-bold">
                              {formatProcedureTarget(proc.tooth_number, proc.surfaces)}
                            </span>
                            <span className="font-bold text-foreground">{proc.procedure_name}</span>
                            {proc.cost != null && Number(proc.cost) > 0 && (
                              <span className="font-bold text-primary">
                                R$ {formatBRLValue(Number(proc.cost))}
                              </span>
                            )}
                            <span
                              className={cn(
                                "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                                proc.status === "completed"
                                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                  : proc.status === "in_progress"
                                    ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                                    : "bg-rose-500/15 text-rose-700 dark:text-rose-300",
                              )}
                            >
                              {proc.status === "completed"
                                ? "Concluído"
                                : proc.status === "in_progress"
                                  ? "Em Andamento"
                                  : "Planejado"}
                            </span>
                          </div>
                          {proc.notes && (
                            <p className="text-[11px] text-muted-foreground">{proc.notes}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                          {proc.status === "planned" && (
                            <button
                              type="button"
                              onClick={() =>
                                updatePlanProcedureStatusMutation.mutate({
                                  proc,
                                  newStatus: "in_progress",
                                })
                              }
                              className="px-2.5 py-1.5 rounded-lg border border-amber-500/35 bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 dark:text-amber-300 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                            >
                              <Play className="h-3 w-3" />
                              <span>Iniciar</span>
                            </button>
                          )}
                          {proc.status !== "completed" && (
                            <>
                              <button
                                type="button"
                                onClick={() => startExecutingPlanProcedure(proc)}
                                className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary-deep text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                                title="Abrir no formulário abaixo com template clínico para detalhar e lançar no prontuário"
                              >
                                <Stethoscope className="h-3 w-3" />
                                <span>Executar / Lançar Evolução</span>
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  updatePlanProcedureStatusMutation.mutate({
                                    proc,
                                    newStatus: "completed",
                                    createEvolution: true,
                                  })
                                }
                                disabled={updatePlanProcedureStatusMutation.isPending}
                                className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                                title="Concluir direto com evolução padrão"
                              >
                                <Check className="h-3 w-3" />
                                <span>Concluir 1-Clique</span>
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => deletePlanProcedureMutation.mutate(proc.id)}
                            className="p-1.5 text-muted-foreground hover:text-rose-600 cursor-pointer"
                            title="Remover do plano"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* PAINEL 2: LANÇAR PROCEDIMENTO REALIZADO / EVOLUÇÃO CLÍNICA */}
            <div
              id="clinical-execution-form"
              className="rounded-2xl bg-card border border-border p-5 shadow-sm space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Stethoscope className="h-4 w-4 text-primary" />
                  Lançar Procedimento Realizado / Evolução na Ficha Clínica
                </h3>
                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    {
                      label: "+ Evolução Livre",
                      title: "Evolução Clínica",
                      text: "Procedimento executado:\nDente / Região:\nAnestésico / Material utilizado:\nOrientações e conduta para próxima sessão:",
                    },
                    {
                      label: "+ Profilaxia / Limpeza",
                      title: "Profilaxia + ATF + OHB · Boca Toda / Geral",
                      text: buildProcedureEvolutionText({
                        procedureName: "Profilaxia + ATF + OHB",
                        catalogItem: procedureCatalog.find((p) => p.id === "proc-profilaxia-atf"),
                        toothNumber: 0,
                      }),
                    },
                    {
                      label: "+ Restauração em Resina",
                      title: "Restauração em Resina Composta",
                      text: buildProcedureEvolutionText({
                        procedureName: "Restauração em Resina Composta (1 Face)",
                        catalogItem: procedureCatalog.find(
                          (p) => p.id === "proc-restauracao-resina-1f",
                        ),
                        toothNumber: 11,
                      }),
                    },
                  ].map((tpl) => (
                    <button
                      key={tpl.label}
                      type="button"
                      onClick={() => {
                        setExecutingProc(null);
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

              {executingProc && (
                <div className="px-4 py-3 rounded-xl bg-primary/10 border border-primary/30 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="font-semibold text-primary">
                    Executando procedimento do plano:{" "}
                    <span className="font-bold text-foreground">
                      {executingProc.procedure_name}
                    </span>{" "}
                    — {formatProcedureTarget(executingProc.tooth_number, executingProc.surfaces)}
                  </div>
                  <button
                    type="button"
                    onClick={() => setExecutingProc(null)}
                    className="text-xs font-semibold text-muted-foreground hover:text-foreground underline cursor-pointer"
                  >
                    Desvincular (lançar avulso)
                  </button>
                </div>
              )}

              {/* Seletor Estruturado de Procedimento do Catálogo */}
              <div className="p-4 rounded-2xl bg-muted/25 border border-border/80 space-y-3 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="font-semibold text-muted-foreground block mb-1">
                      Especialidade
                    </label>
                    <select
                      value={evolutionCategoryFilter}
                      onChange={(e) => setEvolutionCategoryFilter(e.target.value)}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                    >
                      <option value="Todas">Todas as Especialidades</option>
                      {PROCEDURE_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="font-semibold text-muted-foreground block mb-1">
                      Buscar Procedimento
                    </label>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <input
                        type="text"
                        value={evolutionProcSearch}
                        onChange={(e) => setEvolutionProcSearch(e.target.value)}
                        placeholder="Ex: resina, canal, endo, exo..."
                        className="w-full rounded-xl border border-border bg-background pl-8 pr-3 py-2 text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="font-semibold text-foreground block mb-1">
                      Procedimento Realizado (Catálogo)
                    </label>
                    <select
                      value={evolutionCatalogId}
                      onChange={(e) => {
                        const proc = procedureCatalog.find((p) => p.id === e.target.value);
                        if (proc) {
                          selectCatalogItemForEvolution(proc, !!executingProc);
                        } else {
                          setEvolutionCatalogId("");
                        }
                      }}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                    >
                      <option value="">-- Selecionar procedimento do catálogo --</option>
                      {evolutionFilteredCatalog.map((p) => (
                        <option key={p.id} value={p.id}>
                          [{p.code}] {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="font-semibold text-foreground block mb-1">
                      Dente / Região
                    </label>
                    {renderToothRegionSelect(evolutionToothNumber, (num) => {
                      setEvolutionToothNumber(num);
                      if (!isToothNumber(num)) setEvolutionSurfaces([]);
                    })}
                  </div>
                  <div>
                    <label className="font-semibold text-foreground block mb-1">
                      Material / Cor / Lote
                    </label>
                    <input
                      type="text"
                      value={evolutionMaterial}
                      onChange={(e) => setEvolutionMaterial(e.target.value)}
                      placeholder="Ex: Resina Z350 A2 + Single Bond"
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-foreground block mb-1">
                      Anestésico / Técnica
                    </label>
                    <input
                      type="text"
                      value={evolutionAnesthetic}
                      onChange={(e) => setEvolutionAnesthetic(e.target.value)}
                      placeholder="Ex: Mepivacaína 2% c/ vaso (1 tubete)"
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  {renderSurfaceToggleRow(
                    evolutionToothNumber,
                    evolutionSurfaces,
                    setEvolutionSurfaces,
                  ) || <span />}

                  {(evolutionProcName || executingProc) && (
                    <button
                      type="button"
                      onClick={() => {
                        const procNameToUse = executingProc?.procedure_name || evolutionProcName;
                        const catItem =
                          procedureCatalog.find((c) => c.id === evolutionCatalogId) ||
                          procedureCatalog.find((c) => c.name === procNameToUse) ||
                          null;
                        const costVal = evolutionCost ? parseMoneyInput(evolutionCost) : null;
                        setNewEvolutionTitle(
                          `${procNameToUse} · ${formatProcedureTarget(evolutionToothNumber, evolutionSurfaces)}`,
                        );
                        setNewEvolutionText(
                          buildProcedureEvolutionText({
                            procedureName: procNameToUse,
                            catalogItem: catItem,
                            toothNumber: evolutionToothNumber,
                            surfaces: evolutionSurfaces,
                            materialOrShade: evolutionMaterial,
                            anesthetic: evolutionAnesthetic,
                            notes: executingProc?.notes || undefined,
                            cost: costVal,
                          }),
                        );
                        toast.success("Texto clínico atualizado com os campos acima!");
                      }}
                      className="px-3 py-1.5 rounded-lg border border-primary/30 bg-primary/10 hover:bg-primary/20 text-primary font-semibold flex items-center gap-1.5 cursor-pointer text-[11px]"
                    >
                      <RefreshCw className="h-3 w-3" />
                      <span>Atualizar Texto com Dados Acima</span>
                    </button>
                  )}
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
                rows={5}
                value={newEvolutionText}
                onChange={(e) => setNewEvolutionText(e.target.value)}
                placeholder="Descreva o procedimento executado na sessão, dente, materiais, intercorrências e próximo passo do plano..."
                className="w-full rounded-xl border border-border bg-background p-3 text-xs leading-relaxed"
              />
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={markOdontogramCompleted}
                    onChange={(e) => setMarkOdontogramCompleted(e.target.checked)}
                    className="rounded border-border text-primary"
                  />
                  <span>Marcar como Concluído no Odontograma / Plano de Tratamento</span>
                </label>

                <button
                  type="button"
                  onClick={() => launchClinicalProcedureMutation.mutate()}
                  disabled={launchClinicalProcedureMutation.isPending}
                  className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-deep text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  {launchClinicalProcedureMutation.isPending
                    ? "Lançando..."
                    : "Lançar Procedimento Realizado na Ficha Clínica"}
                </button>
              </div>
            </div>

            {/* PAINEL 3: HISTÓRICO DA FICHA CLÍNICA */}
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
                        ? "bg-primary text-white border-primary"
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
                className="w-full py-2.5 rounded-xl bg-primary hover:bg-primary-deep text-white text-xs font-semibold cursor-pointer"
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
          <OdontogramView
            patientId={selectedPatient.id}
            patientName={selectedPatient.name}
            patientInsurance={selectedPatient.insurance}
            catalog={procedureCatalog}
            onOpenCatalog={() => {
              setCatalogSelectTarget(null);
              setShowProcedureCatalogModal(true);
            }}
          />
        )}

        {/* ====================================================================
            ABA 8: ANAMNESE (QUESTIONÁRIO OFICIAL CLINICORP)
           ==================================================================== */}
        {activeTab === "anamnese" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-7 rounded-2xl bg-card border border-border p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-primary" />
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
                className="w-full py-2.5 rounded-xl bg-primary hover:bg-primary-deep text-white text-xs font-semibold cursor-pointer"
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
              <ShieldCheck className="h-4 w-4 text-primary" />
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
              className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-semibold cursor-pointer"
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
              onRequestSignature={(pdf) =>
                setSignaturePrefill({
                  pdf,
                  documentType: "orcamento",
                  label: "Orçamento gerado agora",
                })
              }
            />
            <PatientSignatures
              patientId={selectedPatient.id}
              hasGuardian={Boolean(parsedSelectedGuardians.guardianName.trim())}
              prefill={signaturePrefill}
              onPrefillConsumed={() => setSignaturePrefill(null)}
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
                <FileCheck className="h-4 w-4 text-primary" />
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
                  className="w-full py-2.5 rounded-xl bg-primary text-white text-xs font-semibold cursor-pointer"
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
                <Receipt className="h-4 w-4 text-primary" />
                Recibos de Pagamento do Paciente ({categorizedRecords.payments.length})
              </h3>
              <button
                onClick={() => setActiveTab("financeiro")}
                className="px-3.5 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold cursor-pointer"
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
                <Calendar className="h-4 w-4 text-primary" />
                Histórico de Agendamentos do Paciente ({patientAppointments.length})
              </h3>
              <button
                onClick={() => setShowAppointmentModal(true)}
                className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-deep text-white text-xs font-semibold cursor-pointer flex items-center gap-1.5"
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
                          "px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase border",
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
                  className="px-5 py-2 rounded-lg bg-primary text-white text-xs font-semibold cursor-pointer"
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
                  className="px-5 py-2 rounded-lg bg-primary text-white text-xs font-semibold cursor-pointer"
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

        <ProcedureCatalogModal
          open={showProcedureCatalogModal}
          onClose={() => {
            setShowProcedureCatalogModal(false);
            setCatalogSelectTarget(null);
          }}
          catalog={procedureCatalog}
          onCatalogChange={setProcedureCatalog}
          onSelectProcedure={
            catalogSelectTarget
              ? (proc) => {
                  if (catalogSelectTarget === "orcamento") {
                    selectCatalogItemForBudget(proc);
                  } else if (catalogSelectTarget === "plano_add") {
                    selectCatalogItemForQuickPlan(proc);
                  } else {
                    selectCatalogItemForEvolution(proc, !!executingProc);
                  }
                }
              : undefined
          }
        />
      </div>
    );
  }

  // ============================================================================
  // FUNÇÃO AUXILIAR PARA RENDERIZAR O MODAL DE CRIAR / EDITAR PACIENTE (CLINICORP)
  // ============================================================================
  function renderPatientModal() {
    const modalIsMinor = isMinorPatient(patientForm.birth_date);
    const modalAgeLabel = formatPatientAgeLabel(patientForm.birth_date);
    const showGuardianFields = patientForm.hasGuardian || modalIsMinor;

    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
        onClick={() => setPatientFormMode(null)}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-3xl rounded-3xl bg-card border border-border p-6 sm:p-7 shadow-bloom space-y-5 max-h-[92vh] overflow-y-auto"
        >
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <h3 className="font-display text-2xl text-foreground">
                {patientFormMode === "edit" ? "Editar Cadastro do Paciente" : "Novo Paciente"}
              </h3>
              <p className="text-xs text-muted-foreground">
                Ficha Cadastral Padrão Clinicorp — Dados Pessoais, Responsáveis, Contato e Alertas.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPatientFormMode(null)}
              className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* BLOCO 1: DADOS CADASTRAIS DO PACIENTE */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" />
              <span>1. Dados Cadastrais do Paciente</span>
            </h4>
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
                <div className="flex items-center justify-between gap-2">
                  <label className="font-semibold text-foreground">Data de Nascimento</label>
                  {modalAgeLabel && (
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded-full text-[10px] font-bold",
                        modalIsMinor
                          ? "bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {modalAgeLabel}
                    </span>
                  )}
                </div>
                <input
                  type="date"
                  value={patientForm.birth_date}
                  onChange={(e) => {
                    const nextDate = e.target.value;
                    const minor = isMinorPatient(nextDate);
                    setPatientForm((prev) => ({
                      ...prev,
                      birth_date: nextDate,
                      hasGuardian: minor ? true : prev.hasGuardian,
                    }));
                  }}
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
                <label className="font-semibold text-foreground">
                  CPF {modalIsMinor ? "(opcional p/ menor)" : ""}
                </label>
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
                <label className="font-semibold text-foreground">Estado civil</label>
                <select
                  value={patientForm.marital_status}
                  onChange={(e) =>
                    setPatientForm({ ...patientForm, marital_status: e.target.value })
                  }
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
                <label className="font-semibold text-foreground">Profissão / Ocupação</label>
                <input
                  type="text"
                  value={patientForm.profession}
                  onChange={(e) => setPatientForm({ ...patientForm, profession: e.target.value })}
                  placeholder={modalIsMinor ? "Ex: Estudante" : "Profissão"}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                />
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
            </div>
          </div>

          {/* BLOCO 2: RESPONSÁVEIS LEGAL & FINANCEIRO (PADRÃO CLINICORP) */}
          <div className="rounded-2xl border border-indigo-500/25 bg-indigo-500/[0.04] p-4 space-y-3.5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 font-bold text-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showGuardianFields}
                  disabled={modalIsMinor}
                  onChange={(e) =>
                    setPatientForm((prev) => ({ ...prev, hasGuardian: e.target.checked }))
                  }
                  className="rounded border-border text-primary"
                />
                <Users className="h-4 w-4 text-primary" />
                <span>2. Paciente menor de idade / Possui responsável legal ou financeiro</span>
              </label>

              {modalIsMinor && (
                <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30 text-[11px] font-bold">
                  Menor de 18 anos — Obrigatório
                </span>
              )}
            </div>

            {showGuardianFields && (
              <div className="space-y-4 pt-2 border-t border-border/60">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2 space-y-1">
                    <label className="font-semibold text-foreground">
                      Nome Completo do Responsável Legal {modalIsMinor ? "*" : ""}
                    </label>
                    <input
                      type="text"
                      value={patientForm.guardianName}
                      onChange={(e) =>
                        setPatientForm({ ...patientForm, guardianName: e.target.value })
                      }
                      placeholder="Nome completo da mãe, pai ou tutor legal"
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-semibold text-foreground">Grau de Parentesco</label>
                    <select
                      value={patientForm.guardianRelationship}
                      onChange={(e) =>
                        setPatientForm({ ...patientForm, guardianRelationship: e.target.value })
                      }
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                    >
                      {GUARDIAN_RELATIONSHIPS.map((rel) => (
                        <option key={rel} value={rel}>
                          {rel}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-foreground">CPF do Responsável</label>
                    <input
                      type="text"
                      value={patientForm.guardianCpf}
                      onChange={(e) =>
                        setPatientForm({ ...patientForm, guardianCpf: e.target.value })
                      }
                      placeholder="000.000.000-00"
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-semibold text-foreground">RG do Responsável</label>
                    <input
                      type="text"
                      value={patientForm.guardianRg}
                      onChange={(e) =>
                        setPatientForm({ ...patientForm, guardianRg: e.target.value })
                      }
                      placeholder="RG"
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-semibold text-foreground">
                      Telefone / WhatsApp do Resp.
                    </label>
                    <input
                      type="text"
                      value={patientForm.guardianPhone}
                      onChange={(e) =>
                        setPatientForm({ ...patientForm, guardianPhone: e.target.value })
                      }
                      placeholder="(96) 99100-0000"
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                    />
                  </div>

                  <div className="sm:col-span-2 space-y-1">
                    <label className="font-semibold text-foreground">E-mail do Responsável</label>
                    <input
                      type="email"
                      value={patientForm.guardianEmail}
                      onChange={(e) =>
                        setPatientForm({ ...patientForm, guardianEmail: e.target.value })
                      }
                      placeholder="responsavel@exemplo.com"
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                    />
                  </div>
                  <div className="flex items-end pb-1.5">
                    <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={patientForm.guardianIsFinancialResponsible}
                        onChange={(e) =>
                          setPatientForm({
                            ...patientForm,
                            guardianIsFinancialResponsible: e.target.checked,
                          })
                        }
                        className="rounded border-border text-primary"
                      />
                      <span>É o Responsável Financeiro</span>
                    </label>
                  </div>
                </div>

                {/* Toggle para 2º Responsável */}
                <div className="pt-2 border-t border-border/50 space-y-3">
                  <button
                    type="button"
                    onClick={() =>
                      setPatientForm((prev) => ({
                        ...prev,
                        hasSecondGuardian: !prev.hasSecondGuardian,
                      }))
                    }
                    className="text-xs font-semibold text-primary hover:underline flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>
                      {patientForm.hasSecondGuardian
                        ? "Ocultar 2º Responsável / Filiação"
                        : "Informar 2º Responsável / Filiação (Pai, Mãe ou Resp. Financeiro)"}
                    </span>
                  </button>

                  {patientForm.hasSecondGuardian && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <div className="sm:col-span-2 space-y-1">
                        <label className="font-semibold text-foreground">
                          Nome do 2º Responsável
                        </label>
                        <input
                          type="text"
                          value={patientForm.secondGuardianName}
                          onChange={(e) =>
                            setPatientForm({ ...patientForm, secondGuardianName: e.target.value })
                          }
                          placeholder="Nome completo do 2º responsável"
                          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="font-semibold text-foreground">Parentesco</label>
                        <select
                          value={patientForm.secondGuardianRelationship}
                          onChange={(e) =>
                            setPatientForm({
                              ...patientForm,
                              secondGuardianRelationship: e.target.value,
                            })
                          }
                          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                        >
                          {GUARDIAN_RELATIONSHIPS.map((rel) => (
                            <option key={rel} value={rel}>
                              {rel}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="font-semibold text-foreground">CPF (2º Resp.)</label>
                        <input
                          type="text"
                          value={patientForm.secondGuardianCpf}
                          onChange={(e) =>
                            setPatientForm({ ...patientForm, secondGuardianCpf: e.target.value })
                          }
                          placeholder="000.000.000-00"
                          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                        />
                      </div>
                      <div className="sm:col-span-2 space-y-1">
                        <label className="font-semibold text-foreground">
                          Telefone / WhatsApp (2º Resp.)
                        </label>
                        <input
                          type="text"
                          value={patientForm.secondGuardianPhone}
                          onChange={(e) =>
                            setPatientForm({
                              ...patientForm,
                              secondGuardianPhone: e.target.value,
                            })
                          }
                          placeholder="(96) 99100-0000"
                          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* BLOCO 3: CONTATO & ENDEREÇO COMPLETO */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5" />
              <span>3. Contato & Endereço</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-xs">
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
                <label className="font-semibold text-foreground">
                  Telefone Secundário / Recado
                </label>
                <input
                  type="text"
                  value={patientForm.phone2}
                  onChange={(e) => setPatientForm({ ...patientForm, phone2: e.target.value })}
                  placeholder="(96) 99100-0000"
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
                <label className="font-semibold text-foreground">CEP</label>
                <input
                  type="text"
                  value={patientForm.postal_code}
                  onChange={(e) => setPatientForm({ ...patientForm, postal_code: e.target.value })}
                  placeholder="68900-000"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                />
              </div>
              <div className="sm:col-span-2 space-y-1">
                <label className="font-semibold text-foreground">Endereço (Rua / Av.)</label>
                <input
                  type="text"
                  value={patientForm.address}
                  onChange={(e) => setPatientForm({ ...patientForm, address: e.target.value })}
                  placeholder="Rua / Av."
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">Número</label>
                <input
                  type="text"
                  value={patientForm.address_number}
                  onChange={(e) =>
                    setPatientForm({ ...patientForm, address_number: e.target.value })
                  }
                  placeholder="Nº"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-foreground">Complemento</label>
                <input
                  type="text"
                  value={patientForm.address_extra}
                  onChange={(e) =>
                    setPatientForm({ ...patientForm, address_extra: e.target.value })
                  }
                  placeholder="Apto / Bloco / Casa"
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

              <div className="sm:col-span-2 space-y-1">
                <label className="font-semibold text-foreground">Cidade</label>
                <input
                  type="text"
                  value={patientForm.city}
                  onChange={(e) => setPatientForm({ ...patientForm, city: e.target.value })}
                  placeholder="Macapá"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-foreground">UF</label>
                <input
                  type="text"
                  value={patientForm.state}
                  onChange={(e) => setPatientForm({ ...patientForm, state: e.target.value })}
                  placeholder="AP"
                  maxLength={2}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs uppercase"
                />
              </div>
            </div>
          </div>

          {/* BLOCO 4: ALERTAS DE SAÚDE & OBSERVAÇÕES */}
          <div className="space-y-3 text-xs pt-1">
            <h4 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>4. Alertas Clínicos & Observações Gerais</span>
            </h4>
            <div className="space-y-1">
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

            <div className="space-y-1">
              <label className="font-semibold text-foreground">
                Observações Gerais do Cadastro
              </label>
              <textarea
                rows={2}
                value={patientForm.notes}
                onChange={(e) => setPatientForm({ ...patientForm, notes: e.target.value })}
                placeholder="Observações administrativas ou preferências de atendimento do paciente..."
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-2.5 pt-3 border-t border-border">
            <div>
              {patientFormMode === "edit" && selectedPatient && (
                <button
                  type="button"
                  onClick={(e) => handleConfirmDeletePatient(selectedPatient, e)}
                  disabled={deletePatientMutation.isPending}
                  className="px-4 py-2.5 rounded-full border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-xs font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Excluir Paciente</span>
                </button>
              )}
            </div>
            <div className="flex items-center gap-2.5">
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
                className="px-6 py-2.5 rounded-full bg-primary text-white text-xs font-semibold shadow-sm hover:bg-primary-deep transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {savePatientMutation.isPending ? "Salvando..." : "Salvar Cadastro"}
              </button>
            </div>
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
                  ? "bg-card border-primary ring-2 ring-primary/25 shadow-md"
                  : "bg-card/80 border-border hover:border-foreground/30",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    "text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border",
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
              placeholder="Encontre pacientes por nome, CPF, telefone, responsável, alerta médico ou nº prontuário..."
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
              className="min-h-11 px-5 py-2.5 rounded-full bg-primary hover:bg-primary-deep text-primary-foreground text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>Cadastrar Paciente</span>
            </button>
          </div>
        </div>

        {/* Barra Alfabética A–Z */}
        <div className="pt-2 border-t border-border/50">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mr-1 shrink-0">
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
                    "min-w-[36px] h-9 px-2.5 rounded-full text-xs font-semibold transition-all shrink-0 cursor-pointer flex items-center justify-center",
                    isSelected
                      ? "bg-primary text-primary-foreground shadow-sm scale-105"
                      : "bg-background/80 text-muted-foreground hover:bg-accent/60 hover:text-foreground border border-border/60",
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
            const rowGuardians = parsePatientNotes(patient.notes, patient.birth_date);
            const rowAge = getPatientAge(patient.birth_date);
            const rowIsMinor = isMinorPatient(patient.birth_date);
            return (
              <div
                key={patient.id}
                onClick={() => {
                  setSelectedPatient(patient);
                  setActiveTab("visao_geral");
                }}
                className="px-6 py-4 hover:bg-accent/35 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="text-xs font-mono font-bold text-primary">
                      #{patient.record_number}
                    </span>
                    <span className="text-sm font-bold text-foreground">{patient.name}</span>
                    <span
                      className={cn(
                        "text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border",
                        stageObj.tone,
                      )}
                    >
                      {stageObj.label.replace(/^\d+\.\s*/, "")}
                    </span>
                    {rowIsMinor && rowAge !== null && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30 text-[11px] font-bold">
                        <Baby className="h-3 w-3" />
                        Menor · {rowAge} {rowAge === 1 ? "ano" : "anos"}
                      </span>
                    )}
                    {rowGuardians.guardianName && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-500/12 text-indigo-800 dark:text-indigo-300 border border-indigo-500/25 text-[11px] font-semibold">
                        <Users className="h-3 w-3" />
                        Resp.: {rowGuardians.guardianName} ({rowGuardians.guardianRelationship})
                      </span>
                    )}
                    {patient.insurance && (
                      <span className="px-2.5 py-0.5 rounded-full bg-muted text-[11px] font-semibold uppercase text-foreground">
                        {patient.insurance}
                      </span>
                    )}
                    {patient.medical_warning && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 bg-rose-500/10 px-2.5 py-0.5 rounded-full border border-rose-500/20">
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
                      href={`https://web.whatsapp.com/send?phone=55${patient.phone.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="min-h-10 px-3.5 py-2 rounded-full border border-emerald-600/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center gap-1.5"
                      title="Conversar no WhatsApp"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      <span className="hidden md:inline">Conversar</span>
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={(e) => handleConfirmDeletePatient(patient, e)}
                    disabled={deletePatientMutation.isPending}
                    aria-label={`Excluir paciente ${patient.name}`}
                    className="h-10 w-10 flex items-center justify-center rounded-full border border-rose-500/25 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 transition-colors cursor-pointer disabled:opacity-50"
                    title="Excluir Paciente"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <span className="min-h-10 px-3.5 py-2 rounded-full bg-primary/10 hover:bg-primary/15 inline-flex items-center gap-1 text-xs font-semibold text-primary">
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
                className="min-h-10 px-4 py-2 rounded-full border border-border text-xs font-semibold text-foreground bg-background hover:bg-accent/60 disabled:opacity-40 cursor-pointer flex items-center gap-1"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Anterior
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="min-h-10 px-4 py-2 rounded-full border border-border text-xs font-semibold text-foreground bg-background hover:bg-accent/60 disabled:opacity-40 cursor-pointer flex items-center gap-1"
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
