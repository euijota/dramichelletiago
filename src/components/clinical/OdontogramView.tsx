import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, Baby, Smile, Layers, Check, Search, Settings2, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PROCEDURE_CATEGORIES,
  REGION_OPTIONS,
  type ClinicalProcedureCatalogItem,
  loadProcedureCatalog,
  filterProcedures,
  getSuggestedProcedurePrice,
  isToothNumber,
  formatProcedureTarget,
  buildProcedureEvolutionText,
  formatBRLValue,
} from "@/lib/procedures";
import { ProcedureCatalogModal } from "./ProcedureCatalogModal";

interface ToothProcedure {
  id?: string;
  tooth_number: number;
  surfaces: string[];
  procedure_name: string;
  status: "planned" | "in_progress" | "completed";
  cost?: number | null;
  notes?: string | null;
  created_at?: string;
}

interface OdontogramViewProps {
  patientId: string;
  patientName?: string;
  patientInsurance?: string | null;
  catalog?: ClinicalProcedureCatalogItem[];
  onOpenCatalog?: () => void;
}

const PERMANENT_UPPER: [number[], number[]] = [
  [18, 17, 16, 15, 14, 13, 12, 11],
  [21, 22, 23, 24, 25, 26, 27, 28],
];

const PERMANENT_LOWER: [number[], number[]] = [
  [48, 47, 46, 45, 44, 43, 42, 41],
  [31, 32, 33, 34, 35, 36, 37, 38],
];

const DECIDUOUS_UPPER: [number[], number[]] = [
  [55, 54, 53, 52, 51],
  [61, 62, 63, 64, 65],
];

const DECIDUOUS_LOWER: [number[], number[]] = [
  [85, 84, 83, 82, 81],
  [71, 72, 73, 74, 75],
];

const SURFACE_LABELS: Record<string, string> = {
  V: "Vestibular (V)",
  L: "Lingual / Palatina (L/P)",
  M: "Mesial (M)",
  D: "Distal (D)",
  O: "Oclusal / Incisal (O/I)",
};

function normalizeSurfaceCode(s: string): string {
  const u = s.trim().toUpperCase();
  if (u === "VESTIBULAR" || u === "V") return "V";
  if (u === "LINGUAL" || u === "PALATINA" || u === "L" || u === "P") return "L";
  if (u === "MESIAL" || u === "M") return "M";
  if (u === "DISTAL" || u === "D") return "D";
  if (u === "OCLUSAL" || u === "INCISAL" || u === "O" || u === "I") return "O";
  return u;
}

export function OdontogramView({
  patientId,
  patientName,
  patientInsurance,
  catalog: externalCatalog,
  onOpenCatalog,
}: OdontogramViewProps) {
  const queryClient = useQueryClient();
  const [internalCatalog, setInternalCatalog] = useState<ClinicalProcedureCatalogItem[]>(() =>
    loadProcedureCatalog(),
  );
  const [showInternalCatalogModal, setShowInternalCatalogModal] = useState(false);

  const activeCatalog = externalCatalog ?? internalCatalog;

  const [dentition, setDentition] = useState<"permanent" | "deciduous" | "mixed">("permanent");
  const [selectedTooth, setSelectedTooth] = useState<number | null>(null);
  const [selectedSurfaces, setSelectedSurfaces] = useState<string[]>([]);

  const [procCategory, setProcCategory] = useState<string>("Todas");
  const [procSearch, setProcSearch] = useState<string>("");
  const [selectedCatalogId, setSelectedCatalogId] = useState<string>(
    () => activeCatalog[0]?.id || "",
  );
  const [procName, setProcName] = useState<string>(
    () => activeCatalog[0]?.name || "Restauração em Resina Composta (1 Face)",
  );
  const [procStatus, setProcStatus] = useState<"planned" | "in_progress" | "completed">(
    () => activeCatalog[0]?.defaultStatus || "planned",
  );
  const [procCost, setProcCost] = useState<string>(() => {
    const first = activeCatalog[0];
    if (!first) return "";
    const suggested = getSuggestedProcedurePrice(first, patientInsurance);
    return suggested > 0 ? suggested.toFixed(2) : "";
  });
  const [procNotes, setProcNotes] = useState("");

  const filteredCatalog = useMemo(
    () => filterProcedures(activeCatalog, { query: procSearch, category: procCategory }),
    [activeCatalog, procSearch, procCategory],
  );

  // Sincroniza quando o catálogo externo muda ou a busca filtra o item atual
  useEffect(() => {
    if (filteredCatalog.length > 0 && !filteredCatalog.some((p) => p.id === selectedCatalogId)) {
      const first = filteredCatalog[0];
      setSelectedCatalogId(first.id);
      setProcName(first.name);
      setProcStatus(first.defaultStatus);
      const suggested = getSuggestedProcedurePrice(first, patientInsurance);
      setProcCost(suggested > 0 ? suggested.toFixed(2) : "");
    }
  }, [filteredCatalog, selectedCatalogId, patientInsurance]);

  const selectedCatalogItem = useMemo(
    () =>
      activeCatalog.find((p) => p.id === selectedCatalogId) ||
      activeCatalog.find((p) => p.name === procName) ||
      null,
    [activeCatalog, selectedCatalogId, procName],
  );

  function handleSelectCatalogProc(procId: string) {
    const proc = activeCatalog.find((p) => p.id === procId);
    setSelectedCatalogId(procId);
    if (!proc) return;
    setProcName(proc.name);
    setProcStatus(proc.defaultStatus);
    const suggested = getSuggestedProcedurePrice(proc, patientInsurance);
    setProcCost(suggested > 0 ? suggested.toFixed(2) : "");
  }

  // Buscar odontograma do paciente
  const { data: odontogram } = useQuery({
    queryKey: ["odontogram", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("odontograms")
        .select("id, dentition_type, notes")
        .eq("patient_id", patientId)
        .maybeSingle();

      if (error && error.code !== "PGRST116") throw error;
      if (data) return data;

      const { data: created, error: createErr } = await supabase
        .from("odontograms")
        .insert({ patient_id: patientId, dentition_type: "permanent" })
        .select()
        .single();
      if (createErr) throw createErr;
      return created;
    },
  });

  // Buscar procedimentos cadastrados no odontograma
  const { data: procedures = [] } = useQuery({
    queryKey: ["odontogram_procedures", odontogram?.id],
    enabled: !!odontogram?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("odontogram_procedures")
        .select("*")
        .eq("odontogram_id", odontogram!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as ToothProcedure[];
    },
  });

  // Auto-detectar se paciente tem procedimentos em dentes decíduos para sugerir visualização
  const hasDeciduousProcs = useMemo(
    () => procedures.some((p) => p.tooth_number >= 51 && p.tooth_number <= 85),
    [procedures],
  );
  const hasPermanentProcs = useMemo(
    () => procedures.some((p) => p.tooth_number >= 11 && p.tooth_number <= 48),
    [procedures],
  );

  // Mapa de dentes/regiões com procedimentos
  const toothMap = useMemo(() => {
    const map = new Map<number, ToothProcedure[]>();
    for (const p of procedures) {
      const list = map.get(p.tooth_number) || [];
      list.push(p);
      map.set(p.tooth_number, list);
    }
    return map;
  }, [procedures]);

  // Salvar novo procedimento
  const saveProcedureMutation = useMutation({
    mutationFn: async () => {
      if (!odontogram?.id || selectedTooth === null) return;
      const surfacesToSave = isToothNumber(selectedTooth) ? selectedSurfaces : [];
      const costNum = procCost ? parseFloat(procCost.replace(",", ".")) : null;
      const { error } = await supabase.from("odontogram_procedures").insert({
        odontogram_id: odontogram.id,
        tooth_number: selectedTooth,
        surfaces: surfacesToSave,
        procedure_name: procName,
        status: procStatus,
        cost: costNum,
        notes: procNotes.trim() || null,
      });
      if (error) throw error;

      // Se já foi marcado como concluído, registrar também na linha do tempo do prontuário
      if (procStatus === "completed") {
        const targetLabel = formatProcedureTarget(selectedTooth, surfacesToSave);
        const evolutionContent = buildProcedureEvolutionText({
          procedureName: procName,
          catalogItem: selectedCatalogItem,
          toothNumber: selectedTooth,
          surfaces: surfacesToSave,
          notes: procNotes.trim() || undefined,
          cost: costNum,
        });
        await supabase.from("clinical_records").insert({
          patient_id: patientId,
          record_type: "evolucao",
          record_date: new Date().toISOString(),
          title: `${procName} · ${targetLabel}`,
          content: evolutionContent,
        });
      }
    },
    onSuccess: () => {
      const label = selectedTooth !== null ? formatProcedureTarget(selectedTooth) : "";
      toast.success(`Procedimento registrado (${label})!`);
      queryClient.invalidateQueries({ queryKey: ["odontogram_procedures", odontogram?.id] });
      queryClient.invalidateQueries({ queryKey: ["clinical_records", patientId] });
      setSelectedSurfaces([]);
      setProcNotes("");
    },
    onError: (err: any) => {
      toast.error(`Erro ao salvar: ${err.message}`);
    },
  });

  // Alternar status do procedimento (Planejado -> Concluído)
  const updateStatusMutation = useMutation({
    mutationFn: async ({
      proc,
      newStatus,
    }: {
      proc: ToothProcedure;
      newStatus: ToothProcedure["status"];
    }) => {
      if (!proc.id) return;
      const { error } = await supabase
        .from("odontogram_procedures")
        .update({ status: newStatus })
        .eq("id", proc.id);
      if (error) throw error;

      if (newStatus === "completed") {
        const catalogMatch = activeCatalog.find((c) => c.name === proc.procedure_name) || null;
        const targetLabel = formatProcedureTarget(proc.tooth_number, proc.surfaces);
        const evolutionContent = buildProcedureEvolutionText({
          procedureName: proc.procedure_name,
          catalogItem: catalogMatch,
          toothNumber: proc.tooth_number,
          surfaces: proc.surfaces || [],
          notes: proc.notes || undefined,
          cost: proc.cost ?? null,
        });
        await supabase.from("clinical_records").insert({
          patient_id: patientId,
          record_type: "evolucao",
          record_date: new Date().toISOString(),
          title: `${proc.procedure_name} · ${targetLabel}`,
          content: evolutionContent,
        });
      }
    },
    onSuccess: () => {
      toast.success("Status do procedimento atualizado!");
      queryClient.invalidateQueries({ queryKey: ["odontogram_procedures", odontogram?.id] });
      queryClient.invalidateQueries({ queryKey: ["clinical_records", patientId] });
    },
  });

  // Excluir procedimento
  const deleteProcedureMutation = useMutation({
    mutationFn: async (procId: string) => {
      const { error } = await supabase.from("odontogram_procedures").delete().eq("id", procId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Procedimento removido.");
      queryClient.invalidateQueries({ queryKey: ["odontogram_procedures", odontogram?.id] });
    },
  });

  const toggleSurface = (surf: string) => {
    setSelectedSurfaces((prev) =>
      prev.includes(surf) ? prev.filter((s) => s !== surf) : [...prev, surf],
    );
  };

  // Cor de cada face anatômica (V, L, M, D, O) de acordo com os procedimentos do dente
  function getSurfaceFillClass(
    num: number,
    surfaceCode: "V" | "L" | "M" | "D" | "O",
    isSelected: boolean,
  ): string {
    if (isSelected && selectedSurfaces.includes(surfaceCode)) {
      return "fill-primary";
    }
    const procs = toothMap.get(num) || [];
    if (procs.length === 0) {
      return surfaceCode === "O"
        ? "fill-muted/70 hover:fill-primary/30"
        : "fill-muted hover:fill-primary/30";
    }

    const matching = procs.filter((p) => {
      const norm = (p.surfaces || []).map(normalizeSurfaceCode);
      return norm.length === 0 || norm.includes(surfaceCode);
    });

    if (matching.some((p) => p.status === "planned")) {
      return "fill-rose-500/85 hover:fill-rose-600";
    }
    if (matching.some((p) => p.status === "in_progress")) {
      return "fill-amber-500/85 hover:fill-amber-600";
    }
    if (matching.some((p) => p.status === "completed")) {
      return "fill-emerald-500/85 hover:fill-emerald-600";
    }
    return surfaceCode === "O"
      ? "fill-muted/70 hover:fill-primary/30"
      : "fill-muted hover:fill-primary/30";
  }

  const renderTooth = (num: number, isUpper: boolean, isRightSide: boolean) => {
    const procs = toothMap.get(num) || [];
    const isSelected = selectedTooth === num;
    const hasMissing = procs.some(
      (p) =>
        (p.procedure_name.includes("Ausente") ||
          p.procedure_name.includes("Extraído") ||
          p.procedure_name.includes("Exodontia")) &&
        p.status === "completed",
    );
    const hasExtractionPlanned = procs.some(
      (p) =>
        (p.procedure_name.includes("Extração") || p.procedure_name.includes("Exodontia")) &&
        p.status === "planned",
    );

    const topFace: "V" | "L" = isUpper ? "V" : "L";
    const bottomFace: "V" | "L" = isUpper ? "L" : "V";
    const leftFace: "M" | "D" = isRightSide ? "D" : "M";
    const rightFace: "M" | "D" = isRightSide ? "M" : "D";

    return (
      <div
        key={num}
        onClick={() => {
          setSelectedTooth(num);
          setSelectedSurfaces([]);
        }}
        className={cn(
          "flex flex-col items-center py-1.5 px-0.5 rounded-xl border transition-all cursor-pointer relative group select-none min-w-0",
          isSelected
            ? "border-primary bg-primary/10 shadow-md ring-2 ring-primary/35 -translate-y-0.5"
            : procs.length > 0
              ? "border-primary/35 bg-card shadow-xs hover:border-primary"
              : "border-border/60 bg-card/60 hover:border-primary/40 hover:bg-card",
        )}
      >
        <span
          className={cn(
            "text-[11px] sm:text-[11px] font-mono font-bold leading-none",
            isSelected
              ? "text-primary"
              : procs.length > 0
                ? "text-foreground"
                : "text-muted-foreground group-hover:text-foreground",
          )}
        >
          {num}
        </span>

        {/* Representação visual da coroa dental e 5 faces */}
        <div className="relative w-6 h-6 sm:w-7 sm:h-7 my-1">
          {hasMissing ? (
            <div
              className="w-full h-full flex items-center justify-center text-slate-400 dark:text-slate-500 font-bold text-base"
              title="Dente Ausente / Extraído"
            >
              ✕
            </div>
          ) : (
            <svg viewBox="0 0 40 40" className="w-full h-full drop-shadow-xs">
              <polygon
                points="0,0 40,0 30,10 10,10"
                className={cn(
                  "cursor-pointer transition-colors stroke-border/60 stroke-1",
                  getSurfaceFillClass(num, topFace, isSelected),
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedTooth(num);
                  toggleSurface(topFace);
                }}
              />
              <polygon
                points="10,30 30,30 40,40 0,40"
                className={cn(
                  "cursor-pointer transition-colors stroke-border/60 stroke-1",
                  getSurfaceFillClass(num, bottomFace, isSelected),
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedTooth(num);
                  toggleSurface(bottomFace);
                }}
              />
              <polygon
                points="0,0 10,10 10,30 0,40"
                className={cn(
                  "cursor-pointer transition-colors stroke-border/60 stroke-1",
                  getSurfaceFillClass(num, leftFace, isSelected),
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedTooth(num);
                  toggleSurface(leftFace);
                }}
              />
              <polygon
                points="40,0 40,40 30,30 30,10"
                className={cn(
                  "cursor-pointer transition-colors stroke-border/60 stroke-1",
                  getSurfaceFillClass(num, rightFace, isSelected),
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedTooth(num);
                  toggleSurface(rightFace);
                }}
              />
              <rect
                x="10"
                y="10"
                width="20"
                height="20"
                className={cn(
                  "cursor-pointer transition-colors stroke-border/60 stroke-1",
                  getSurfaceFillClass(num, "O", isSelected),
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedTooth(num);
                  toggleSurface("O");
                }}
              />
              {hasExtractionPlanned && (
                <g className="pointer-events-none stroke-rose-600 stroke-[3]">
                  <line x1="4" y1="4" x2="36" y2="36" />
                  <line x1="36" y1="4" x2="4" y2="36" />
                </g>
              )}
            </svg>
          )}
        </div>

        {/* Indicador de quantidade de procedimentos */}
        <div className="h-1.5 flex items-center justify-center gap-0.5">
          {procs.slice(0, 3).map((p, idx) => (
            <span
              key={idx}
              className={cn(
                "w-1.5 h-1.5 rounded-full",
                p.status === "planned"
                  ? "bg-rose-500"
                  : p.status === "in_progress"
                    ? "bg-amber-500"
                    : "bg-emerald-500",
              )}
            />
          ))}
        </div>
      </div>
    );
  };

  const renderArchPair = (
    upper: [number[], number[]],
    lower: [number[], number[]],
    colsClass: string,
    upperLabel: string,
    lowerLabel: string,
  ) => (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5 sm:gap-2">
          <div className={cn("grid gap-1", colsClass)}>
            {upper[0].map((num) => renderTooth(num, true, true))}
          </div>
          <div className="w-0.5 h-12 bg-primary/30 rounded-full mx-0.5" />
          <div className={cn("grid gap-1", colsClass)}>
            {upper[1].map((num) => renderTooth(num, true, false))}
          </div>
        </div>
        <div className="text-center">
          <span className="text-[11px] uppercase font-bold tracking-widest text-muted-foreground/70">
            {upperLabel}
          </span>
        </div>
      </div>

      <div className="border-t border-dashed border-border/80" />

      <div className="space-y-1.5">
        <div className="text-center">
          <span className="text-[11px] uppercase font-bold tracking-widest text-muted-foreground/70">
            {lowerLabel}
          </span>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5 sm:gap-2">
          <div className={cn("grid gap-1", colsClass)}>
            {lower[0].map((num) => renderTooth(num, false, true))}
          </div>
          <div className="w-0.5 h-12 bg-primary/30 rounded-full mx-0.5" />
          <div className={cn("grid gap-1", colsClass)}>
            {lower[1].map((num) => renderTooth(num, false, false))}
          </div>
        </div>
      </div>
    </div>
  );

  const totalBudget = useMemo(
    () => procedures.reduce((acc, p) => acc + (Number(p.cost) || 0), 0),
    [procedures],
  );

  const handleOpenCatalogClick = () => {
    if (onOpenCatalog) {
      onOpenCatalog();
    } else {
      setShowInternalCatalogModal(true);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header com controles de dentição */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 rounded-2xl bg-card border border-border">
        <div>
          <h3 className="font-display text-xl text-foreground flex items-center gap-2">
            <Smile className="h-5 w-5 text-primary" />
            Odontograma Clínico {patientName ? `— ${patientName}` : ""}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Clique em um dente, nas faces (V, L/P, M, D, O) ou em uma região geral (Arcadas, Boca
            Toda, HOF) para registrar procedimentos.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleOpenCatalogClick}
            className="px-3 py-1.5 rounded-xl border border-border bg-background hover:bg-muted text-xs font-semibold text-foreground flex items-center gap-1.5 cursor-pointer"
          >
            <Settings2 className="h-3.5 w-3.5 text-primary" />
            <span>Tabela de Preços</span>
          </button>

          <div className="flex flex-wrap items-center gap-1 bg-muted/60 p-1 rounded-xl border border-border text-xs">
            <button
              type="button"
              onClick={() => setDentition("permanent")}
              className={cn(
                "px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer",
                dentition === "permanent"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Permanente (32)
              {hasPermanentProcs && " •"}
            </button>
            <button
              type="button"
              onClick={() => setDentition("deciduous")}
              className={cn(
                "px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1",
                dentition === "deciduous"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Baby className="h-3.5 w-3.5" />
              Decíduo (20)
              {hasDeciduousProcs && " •"}
            </button>
            <button
              type="button"
              onClick={() => setDentition("mixed")}
              className={cn(
                "px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1",
                dentition === "mixed"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Layers className="h-3.5 w-3.5" />
              Mista (52)
            </button>
          </div>
        </div>
      </div>

      {/* Grade Responsiva da Arcada Dentária + Regiões Gerais */}
      <div className="p-4 sm:p-6 rounded-3xl bg-card border border-border shadow-petal space-y-5">
        {/* Botões rápidos de Região Geral (Clinicorp style: Boca toda, Arcadas, HOF, Sextantes) */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-border/70">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-primary" />
            Regiões Gerais (Profilaxia, Clareamento, Alinhadores, HOF):
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {REGION_OPTIONS.map((reg) => {
              const count = (toothMap.get(reg.code) || []).length;
              const active = selectedTooth === reg.code;
              return (
                <button
                  key={reg.code}
                  type="button"
                  onClick={() => {
                    setSelectedTooth(reg.code);
                    setSelectedSurfaces([]);
                  }}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5",
                    active
                      ? "bg-primary text-primary-foreground border-primary shadow-xs"
                      : count > 0
                        ? "bg-primary/8 text-foreground border-primary/35 hover:border-primary"
                        : "bg-background text-muted-foreground border-border hover:text-foreground hover:bg-muted/50",
                  )}
                >
                  <span>{reg.label}</span>
                  {count > 0 && (
                    <span
                      className={cn(
                        "px-1.5 py-0.2 rounded-full text-[10px] font-bold",
                        active ? "bg-white/20 text-white" : "bg-primary/15 text-primary",
                      )}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Legenda de Orientação */}
        <div className="flex items-center justify-between text-[11px] sm:text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-1">
          <span>Quadrante Direito (Q1 / Q4)</span>
          <span className="text-primary font-bold">Linha Mediana</span>
          <span>Quadrante Esquerdo (Q2 / Q3)</span>
        </div>

        {dentition === "permanent" &&
          renderArchPair(
            PERMANENT_UPPER,
            PERMANENT_LOWER,
            "grid-cols-8",
            "ARCADA SUPERIOR PERMANENTE (18 – 28)",
            "ARCADA INFERIOR PERMANENTE (48 – 38)",
          )}

        {dentition === "deciduous" && (
          <div className="max-w-xl mx-auto">
            {renderArchPair(
              DECIDUOUS_UPPER,
              DECIDUOUS_LOWER,
              "grid-cols-5",
              "ARCADA SUPERIOR DECÍDUA / INFANTIL (55 – 65)",
              "ARCADA INFERIOR DECÍDUA / INFANTIL (85 – 75)",
            )}
          </div>
        )}

        {dentition === "mixed" && (
          <div className="space-y-6">
            {renderArchPair(
              PERMANENT_UPPER,
              PERMANENT_LOWER,
              "grid-cols-8",
              "ARCADA SUPERIOR PERMANENTE (18 – 28)",
              "ARCADA INFERIOR PERMANENTE (48 – 38)",
            )}
            <div className="pt-4 border-t border-border max-w-xl mx-auto">
              {renderArchPair(
                DECIDUOUS_UPPER,
                DECIDUOUS_LOWER,
                "grid-cols-5",
                "ARCADA SUPERIOR DECÍDUA / INFANTIL (55 – 65)",
                "ARCADA INFERIOR DECÍDUA / INFANTIL (85 – 75)",
              )}
            </div>
          </div>
        )}

        {/* Legenda de Cores */}
        <div className="flex flex-wrap items-center justify-center gap-4 pt-3 border-t border-border text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Planejado / A Fazer
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Em Andamento
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Concluído / Tratado
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-primary" /> Face Selecionada
          </span>
        </div>
      </div>

      {/* Painel de Ações do Dente ou Região Selecionada */}
      {selectedTooth !== null && (
        <div className="p-6 rounded-3xl bg-card border border-primary/30 shadow-petal space-y-5">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 pb-4 border-b border-border">
            <div>
              <h4 className="font-display text-xl text-foreground flex items-center gap-2 flex-wrap">
                {isToothNumber(selectedTooth) ? (
                  <>
                    Dente{" "}
                    <span className="text-primary font-mono font-bold text-2xl">
                      {selectedTooth}
                    </span>
                    {selectedSurfaces.length > 0 && (
                      <span className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary font-sans font-semibold">
                        Faces: {selectedSurfaces.join(", ")}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-primary font-bold">
                    {formatProcedureTarget(selectedTooth)}
                  </span>
                )}
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isToothNumber(selectedTooth)
                  ? "Selecione as faces do dente e escolha o procedimento na tabela da clínica."
                  : "Região geral selecionada — escolha o procedimento e registre como planejado ou concluído."}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleOpenCatalogClick}
                className="text-xs font-semibold text-primary hover:underline cursor-pointer flex items-center gap-1"
              >
                <Settings2 className="h-3.5 w-3.5" />
                <span>Gerenciar Tabela de Preços</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedTooth(null)}
                className="text-xs text-muted-foreground hover:text-foreground cursor-pointer underline"
              >
                Fechar seleção
              </button>
            </div>
          </div>

          {/* Seletor rápido de faces por botões (apenas para dentes 11..85) */}
          {isToothNumber(selectedTooth) && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground mr-1">Faces:</span>
              {(["O", "M", "D", "V", "L"] as const).map((code) => {
                const active = selectedSurfaces.includes(code);
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => toggleSurface(code)}
                    className={cn(
                      "px-3 py-1 rounded-xl text-xs font-semibold border transition-all cursor-pointer",
                      active
                        ? "bg-primary text-primary-foreground border-primary shadow-xs"
                        : "bg-background text-foreground border-border hover:bg-muted",
                    )}
                  >
                    {SURFACE_LABELS[code]}
                  </button>
                );
              })}
            </div>
          )}

          {/* Filtros do Catálogo (Especialidade + Busca rápida) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">
                Filtrar por Especialidade
              </label>
              <select
                value={procCategory}
                onChange={(e) => setProcCategory(e.target.value)}
                className="w-full text-xs p-2.5 rounded-xl border border-border bg-background text-foreground"
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
              <label className="block text-xs font-semibold text-muted-foreground mb-1">
                Busca Rápida de Procedimento
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  value={procSearch}
                  onChange={(e) => setProcSearch(e.target.value)}
                  placeholder="Digite resina, canal, limpeza, siso, clareamento..."
                  className="w-full text-xs pl-8 pr-3 py-2.5 rounded-xl border border-border bg-background text-foreground"
                />
              </div>
            </div>
          </div>

          {/* Formulário de Adicionar Procedimento */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">
                Procedimento ({filteredCatalog.length})
              </label>
              <select
                value={selectedCatalogId}
                onChange={(e) => handleSelectCatalogProc(e.target.value)}
                className="w-full text-xs p-2.5 rounded-xl border border-border bg-background text-foreground"
              >
                {filteredCatalog.length === 0 ? (
                  <option value="">Nenhum procedimento encontrado</option>
                ) : (
                  filteredCatalog.map((p) => (
                    <option key={p.id} value={p.id}>
                      [{p.code}] {p.name} — R${" "}
                      {formatBRLValue(getSuggestedProcedurePrice(p, patientInsurance))}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">
                Status
              </label>
              <select
                value={procStatus}
                onChange={(e) => setProcStatus(e.target.value as any)}
                className="w-full text-xs p-2.5 rounded-xl border border-border bg-background text-foreground"
              >
                <option value="planned">Planejado (A realizar)</option>
                <option value="in_progress">Em Andamento</option>
                <option value="completed">Concluído / Realizado</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">
                Valor (R${" "}
                {patientInsurance && patientInsurance !== "PARTICULAR"
                  ? patientInsurance
                  : "Particular"}
                )
              </label>
              <input
                type="number"
                step="0.01"
                placeholder="Ex: 230.00"
                value={procCost}
                onChange={(e) => setProcCost(e.target.value)}
                className="w-full text-xs p-2.5 rounded-xl border border-border bg-background text-foreground"
              />
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={() => saveProcedureMutation.mutate()}
                disabled={saveProcedureMutation.isPending || !procName}
                className="w-full text-xs font-semibold px-4 py-2.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                Salvar ({formatProcedureTarget(selectedTooth)})
              </button>
            </div>
          </div>

          <div>
            <input
              type="text"
              placeholder="Observação opcional (ex: Forramento com Dycal + CIV, Resina A2, Anestesia...)"
              value={procNotes}
              onChange={(e) => setProcNotes(e.target.value)}
              className="w-full text-xs p-2.5 rounded-xl border border-border bg-background text-foreground"
            />
          </div>
        </div>
      )}

      {/* Plano de Tratamento e Histórico Completo do Odontograma */}
      <div className="p-6 rounded-3xl bg-card border border-border shadow-petal space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
              Procedimentos Registrados no Odontograma ({procedures.length})
            </h4>
            <p className="text-[11px] text-muted-foreground">
              Visão consolidada de todos os dentes e regiões tratados ou planejados para este
              paciente.
            </p>
          </div>
          {totalBudget > 0 && (
            <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold">
              Total Orçado/Realizado: R$ {formatBRLValue(totalBudget)}
            </span>
          )}
        </div>

        {procedures.length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-4 text-center">
            Nenhum procedimento odontológico registrado no odontograma deste paciente. Clique em um
            dente ou região acima para adicionar.
          </p>
        ) : (
          <div className="divide-y divide-border rounded-2xl border border-border overflow-hidden">
            {procedures.map((item) => (
              <div
                key={item.id}
                onClick={() => setSelectedTooth(item.tooth_number)}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3.5 text-xs bg-card hover:bg-muted/40 transition-colors cursor-pointer"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary font-mono font-bold">
                      {formatProcedureTarget(item.tooth_number, item.surfaces)}
                    </span>
                    <span className="font-semibold text-foreground">{item.procedure_name}</span>
                    {item.cost != null && Number(item.cost) > 0 && (
                      <span className="text-primary font-bold">
                        R$ {formatBRLValue(Number(item.cost))}
                      </span>
                    )}
                  </div>
                  {item.notes && (
                    <p className="text-[11px] text-muted-foreground pl-1">{item.notes}</p>
                  )}
                </div>

                <div
                  className="flex items-center gap-2 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  {item.status !== "completed" && item.id && (
                    <button
                      type="button"
                      onClick={() =>
                        updateStatusMutation.mutate({ proc: item, newStatus: "completed" })
                      }
                      className="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25 text-[11px] font-semibold uppercase flex items-center gap-1 cursor-pointer transition-colors"
                      title="Marcar como concluído e registrar evolução no prontuário"
                    >
                      <Check className="h-3 w-3" />
                      Concluir
                    </button>
                  )}

                  <span
                    className={cn(
                      "px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase",
                      item.status === "completed"
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                        : item.status === "in_progress"
                          ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                          : "bg-rose-500/15 text-rose-700 dark:text-rose-300",
                    )}
                  >
                    {item.status === "completed"
                      ? "Concluído"
                      : item.status === "in_progress"
                        ? "Em Andamento"
                        : "Planejado"}
                  </span>

                  {item.id && (
                    <button
                      type="button"
                      onClick={() => deleteProcedureMutation.mutate(item.id!)}
                      className="p-1 text-muted-foreground hover:text-rose-600 transition-colors cursor-pointer"
                      title="Remover procedimento"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {!onOpenCatalog && (
        <ProcedureCatalogModal
          open={showInternalCatalogModal}
          onClose={() => setShowInternalCatalogModal(false)}
          catalog={activeCatalog}
          onCatalogChange={setInternalCatalog}
          onSelectProcedure={(proc) => handleSelectCatalogProc(proc.id)}
        />
      )}
    </div>
  );
}
