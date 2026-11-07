import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, CheckCircle2, Clock, Baby, Smile, Layers, Check } from "lucide-react";
import { cn } from "@/lib/utils";

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

const COMMON_PROCEDURES = [
  { name: "Restauração em Resina", defaultStatus: "planned" },
  { name: "Profilaxia + ATF + OHB", defaultStatus: "completed" },
  { name: "Raspagem Supragengival", defaultStatus: "completed" },
  { name: "Selante Dental Preventivo", defaultStatus: "planned" },
  { name: "Tratamento de Canal (Endo)", defaultStatus: "planned" },
  { name: "Exodontia / Extração Indicada", defaultStatus: "planned" },
  { name: "Dente Ausente / Extraído", defaultStatus: "completed" },
  { name: "Coroa / Prótese", defaultStatus: "planned" },
  { name: "Curativo / Forramento (CIV/Dycal)", defaultStatus: "completed" },
  { name: "Clareamento Dental", defaultStatus: "planned" },
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

export function OdontogramView({ patientId, patientName }: OdontogramViewProps) {
  const queryClient = useQueryClient();
  const [dentition, setDentition] = useState<"permanent" | "deciduous" | "mixed">("permanent");
  const [selectedTooth, setSelectedTooth] = useState<number | null>(null);
  const [selectedSurfaces, setSelectedSurfaces] = useState<string[]>([]);
  const [procName, setProcName] = useState(COMMON_PROCEDURES[0].name);
  const [procStatus, setProcStatus] = useState<"planned" | "in_progress" | "completed">("planned");
  const [procCost, setProcCost] = useState<string>("");
  const [procNotes, setProcNotes] = useState("");

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

  // Mapa de dentes com procedimentos
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
      if (!odontogram?.id || !selectedTooth) return;
      const costNum = procCost ? parseFloat(procCost) : null;
      const { error } = await supabase.from("odontogram_procedures").insert({
        odontogram_id: odontogram.id,
        tooth_number: selectedTooth,
        surfaces: selectedSurfaces,
        procedure_name: procName,
        status: procStatus,
        cost: costNum,
        notes: procNotes.trim() || null,
      });
      if (error) throw error;

      // Se já foi marcado como concluído, registrar também na linha do tempo do prontuário
      if (procStatus === "completed") {
        const surfText = selectedSurfaces.length > 0 ? ` (${selectedSurfaces.join(", ")})` : "";
        const costText = costNum ? ` · R$ ${costNum.toFixed(2)}` : "";
        const noteText = procNotes.trim() ? ` — ${procNotes.trim()}` : "";
        await supabase.from("clinical_records").insert({
          patient_id: patientId,
          record_type: "evolucao",
          record_date: new Date().toISOString(),
          title: `Odontograma · Dente ${selectedTooth}`,
          content: `${procName} no dente ${selectedTooth}${surfText}${costText}${noteText} [Concluído]`,
        });
      }
    },
    onSuccess: () => {
      toast.success(`Procedimento registrado no dente ${selectedTooth}!`);
      queryClient.invalidateQueries({ queryKey: ["odontogram_procedures", odontogram?.id] });
      queryClient.invalidateQueries({ queryKey: ["clinical_records", patientId] });
      setSelectedSurfaces([]);
      setProcCost("");
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
        const surfText = proc.surfaces?.length ? ` (${proc.surfaces.join(", ")})` : "";
        await supabase.from("clinical_records").insert({
          patient_id: patientId,
          record_type: "evolucao",
          record_date: new Date().toISOString(),
          title: `Procedimento Concluído · Dente ${proc.tooth_number}`,
          content: `${proc.procedure_name} realizado no dente ${proc.tooth_number}${surfText}.`,
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

    // Verificar procedimentos que afetam esta face específica (ou o dente inteiro se surfaces estiver vazio)
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

    // Mapeamento anatômico fiel aos quadrantes odontológicos:
    // No arco superior: Topo = Vestibular (V), Base = Palatina/Lingual (L)
    // No arco inferior: Topo = Lingual (L), Base = Vestibular (V)
    const topFace: "V" | "L" = isUpper ? "V" : "L";
    const bottomFace: "V" | "L" = isUpper ? "L" : "V";
    // No lado direito (Q1/Q4/Q5/Q8): Esquerda = Distal (D), Direita = Mesial (M, perto da linha mediana)
    // No lado esquerdo (Q2/Q3/Q6/Q7): Esquerda = Mesial (M, perto da linha mediana), Direita = Distal (D)
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
              {/* Face Topo */}
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
              {/* Face Base */}
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
              {/* Face Esquerda */}
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
              {/* Face Direita */}
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
              {/* Centro: Face Oclusal / Incisal (O) */}
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
      {/* Arcada Superior */}
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

      {/* Arcada Inferior */}
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
            Clique no dente ou diretamente nas faces (V, L/P, M, D, O) para registrar procedimentos.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 bg-muted/60 p-1 rounded-xl border border-border text-xs">
          <button
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

      {/* Grade Responsiva da Arcada Dentária (Sem cortar os dentes 18/28/48/38) */}
      <div className="p-4 sm:p-6 rounded-3xl bg-card border border-border shadow-petal space-y-5">
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

      {/* Painel de Ações do Dente Selecionado */}
      {selectedTooth && (
        <div className="p-6 rounded-3xl bg-card border border-primary/30 shadow-petal space-y-5">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 pb-4 border-b border-border">
            <div>
              <h4 className="font-display text-xl text-foreground flex items-center gap-2">
                Dente{" "}
                <span className="text-primary font-mono font-bold text-2xl">{selectedTooth}</span>
                {selectedSurfaces.length > 0 && (
                  <span className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary font-sans font-semibold">
                    Faces: {selectedSurfaces.join(", ")}
                  </span>
                )}
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Selecione as faces do dente e adicione o procedimento realizado ou planejado.
              </p>
            </div>

            <button
              onClick={() => setSelectedTooth(null)}
              className="text-xs text-muted-foreground hover:text-foreground cursor-pointer underline"
            >
              Fechar dente {selectedTooth}
            </button>
          </div>

          {/* Seletor rápido de faces por botões */}
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

          {/* Formulário de Adicionar Procedimento */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">
                Procedimento
              </label>
              <select
                value={procName}
                onChange={(e) => setProcName(e.target.value)}
                className="w-full text-xs p-2.5 rounded-xl border border-border bg-background text-foreground"
              >
                {COMMON_PROCEDURES.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
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
                Valor (R$ opcional)
              </label>
              <input
                type="number"
                placeholder="Ex: 200.00"
                value={procCost}
                onChange={(e) => setProcCost(e.target.value)}
                className="w-full text-xs p-2.5 rounded-xl border border-border bg-background text-foreground"
              />
            </div>

            <div className="flex items-end">
              <button
                onClick={() => saveProcedureMutation.mutate()}
                disabled={saveProcedureMutation.isPending}
                className="w-full text-xs font-semibold px-4 py-2.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
              >
                <Plus className="h-4 w-4" />
                Salvar no Dente {selectedTooth}
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
              Visão consolidada de todos os dentes tratados ou planejados para este paciente.
            </p>
          </div>
          {totalBudget > 0 && (
            <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold">
              Total Orçado/Realizado: R$ {totalBudget.toFixed(2)}
            </span>
          )}
        </div>

        {procedures.length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-4 text-center">
            Nenhum procedimento odontológico registrado no odontograma deste paciente. Clique em um
            dente acima para adicionar.
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
                      Dente {item.tooth_number}
                    </span>
                    <span className="font-semibold text-foreground">{item.procedure_name}</span>
                    {item.surfaces?.length > 0 && (
                      <span className="text-muted-foreground font-mono">
                        [{item.surfaces.join(", ")}]
                      </span>
                    )}
                    {item.cost != null && Number(item.cost) > 0 && (
                      <span className="text-primary font-bold">
                        R$ {Number(item.cost).toFixed(2)}
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
    </div>
  );
}
