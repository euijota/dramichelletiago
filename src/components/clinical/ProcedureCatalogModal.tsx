import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Search, Plus, Edit, Trash2, RotateCcw, X, Check, Tag, Stethoscope } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PROCEDURE_CATEGORIES,
  type ClinicalProcedureCatalogItem,
  type ProcedureCategory,
  type ProcedureTargetType,
  filterProcedures,
  formatBRLValue,
  upsertCatalogProcedure,
  deleteCatalogProcedure,
  resetProcedureCatalogToDefaults,
} from "@/lib/procedures";

interface ProcedureCatalogModalProps {
  open: boolean;
  onClose: () => void;
  catalog: ClinicalProcedureCatalogItem[];
  onCatalogChange: (updated: ClinicalProcedureCatalogItem[]) => void;
  onSelectProcedure?: (proc: ClinicalProcedureCatalogItem) => void;
}

const TARGET_TYPE_LABELS: Record<ProcedureTargetType, string> = {
  tooth: "Dente Específico",
  mouth: "Boca Toda / Geral",
  arch_upper: "Arcada Superior",
  arch_lower: "Arcada Inferior",
  face: "Face / HOF",
  sextant: "Sextantes / Perio",
};

interface ProcedureFormState {
  id?: string;
  code: string;
  name: string;
  category: ProcedureCategory;
  defaultTargetType: ProcedureTargetType;
  requiresSurfaces: boolean;
  defaultPriceParticular: string;
  defaultPriceConvenio: string;
  defaultStatus: "planned" | "completed";
  evolutionTemplate: string;
}

const EMPTY_FORM: ProcedureFormState = {
  code: "",
  name: "",
  category: PROCEDURE_CATEGORIES[0],
  defaultTargetType: "tooth",
  requiresSurfaces: false,
  defaultPriceParticular: "",
  defaultPriceConvenio: "",
  defaultStatus: "planned",
  evolutionTemplate: "",
};

export function ProcedureCatalogModal({
  open,
  onClose,
  catalog,
  onCatalogChange,
  onSelectProcedure,
}: ProcedureCatalogModalProps) {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("Todas");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ProcedureFormState>(EMPTY_FORM);

  const filtered = useMemo(
    () => filterProcedures(catalog, { query: search, category: selectedCategory }),
    [catalog, search, selectedCategory],
  );

  if (!open) return null;

  function openNewForm() {
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEditForm(proc: ClinicalProcedureCatalogItem) {
    setForm({
      id: proc.id,
      code: proc.code,
      name: proc.name,
      category: proc.category,
      defaultTargetType: proc.defaultTargetType,
      requiresSurfaces: proc.requiresSurfaces,
      defaultPriceParticular: String(proc.defaultPriceParticular ?? 0),
      defaultPriceConvenio: String(proc.defaultPriceConvenio ?? 0),
      defaultStatus: proc.defaultStatus,
      evolutionTemplate: proc.evolutionTemplate,
    });
    setShowForm(true);
  }

  function handleSave() {
    if (!form.name.trim()) {
      toast.error("Informe o nome do procedimento.");
      return;
    }
    const particular = parseFloat(form.defaultPriceParticular.replace(",", ".")) || 0;
    const convenio = parseFloat(form.defaultPriceConvenio.replace(",", ".")) || 0;

    const updated = upsertCatalogProcedure({
      id: form.id,
      code: form.code.trim() || "CLIN-00",
      name: form.name.trim(),
      category: form.category,
      defaultTargetType: form.defaultTargetType,
      requiresSurfaces: form.requiresSurfaces,
      defaultPriceParticular: particular,
      defaultPriceConvenio: convenio,
      defaultStatus: form.defaultStatus,
      evolutionTemplate: form.evolutionTemplate.trim(),
    });
    onCatalogChange(updated);
    toast.success(
      form.id ? "Procedimento atualizado na tabela!" : "Novo procedimento adicionado à tabela!",
    );
    setShowForm(false);
    setForm(EMPTY_FORM);
  }

  function handleDelete(proc: ClinicalProcedureCatalogItem) {
    const ok = window.confirm(`Remover "${proc.name}" da tabela de procedimentos da clínica?`);
    if (!ok) return;
    const updated = deleteCatalogProcedure(proc.id);
    onCatalogChange(updated);
    toast.success("Procedimento removido da tabela.");
  }

  function handleReset() {
    const ok = window.confirm(
      "Deseja restaurar a tabela padrão de procedimentos e preços? Itens personalizados serão substituídos pelos padrões iniciais.",
    );
    if (!ok) return;
    const updated = resetProcedureCatalogToDefaults();
    onCatalogChange(updated);
    toast.success("Tabela padrão restaurada!");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 sm:p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-5xl rounded-3xl bg-card border border-border shadow-bloom flex flex-col max-h-[92vh] overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex flex-wrap items-center justify-between gap-3 bg-card">
          <div>
            <h3 className="font-display text-xl sm:text-2xl text-foreground flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-primary" />
              <span>Tabela de Procedimentos e Preços</span>
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Catálogo clínico estilo Clinicorp ({catalog.length} procedimentos) com valores
              Particular/Convênio e textos técnicos de evolução.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleReset}
              className="px-3 py-2 rounded-xl border border-border bg-background hover:bg-muted text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1.5 cursor-pointer"
              title="Restaurar lista padrão"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Restaurar Padrão</span>
            </button>
            <button
              type="button"
              onClick={openNewForm}
              className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-deep text-primary-foreground text-xs font-semibold flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Novo Procedimento</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
              aria-label="Fechar tabela de procedimentos"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {/* Formulário Criar / Editar */}
          {showForm && (
            <div className="rounded-2xl border border-primary/35 bg-primary/[0.03] p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
                <h4 className="text-sm font-bold text-foreground">
                  {form.id ? "Editar Procedimento" : "Cadastrar Novo Procedimento"}
                </h4>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  Fechar formulário
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div className="sm:col-span-2">
                  <label className="font-semibold text-foreground block mb-1">
                    Nome do Procedimento *
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Ex: Restauração em Resina Composta (2 Faces)"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2"
                  />
                </div>
                <div>
                  <label className="font-semibold text-foreground block mb-1">
                    Código (TUSS / Interno)
                  </label>
                  <input
                    type="text"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                    placeholder="Ex: 85100200"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 font-mono"
                  />
                </div>
                <div>
                  <label className="font-semibold text-foreground block mb-1">Especialidade</label>
                  <select
                    value={form.category}
                    onChange={(e) =>
                      setForm({ ...form, category: e.target.value as ProcedureCategory })
                    }
                    className="w-full rounded-xl border border-border bg-background px-3 py-2"
                  >
                    {PROCEDURE_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-foreground block mb-1">
                    Região / Alvo Padrão
                  </label>
                  <select
                    value={form.defaultTargetType}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        defaultTargetType: e.target.value as ProcedureTargetType,
                      })
                    }
                    className="w-full rounded-xl border border-border bg-background px-3 py-2"
                  >
                    {Object.entries(TARGET_TYPE_LABELS).map(([val, label]) => (
                      <option key={val} value={val}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-foreground block mb-1">
                    Valor Particular (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.defaultPriceParticular}
                    onChange={(e) => setForm({ ...form, defaultPriceParticular: e.target.value })}
                    placeholder="250.00"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2"
                  />
                </div>

                <div>
                  <label className="font-semibold text-foreground block mb-1">
                    Valor Convênio / Repasse (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.defaultPriceConvenio}
                    onChange={(e) => setForm({ ...form, defaultPriceConvenio: e.target.value })}
                    placeholder="130.00"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2"
                  />
                </div>

                <div>
                  <label className="font-semibold text-foreground block mb-1">
                    Status Padrão ao Lançar
                  </label>
                  <select
                    value={form.defaultStatus}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        defaultStatus: e.target.value as "planned" | "completed",
                      })
                    }
                    className="w-full rounded-xl border border-border bg-background px-3 py-2"
                  >
                    <option value="planned">Planejado (Orçamento)</option>
                    <option value="completed">Concluído (Executado na hora)</option>
                  </select>
                </div>

                <div className="sm:col-span-2 lg:col-span-4 flex items-center gap-2 pt-1">
                  <input
                    id="catalog-requires-surfaces"
                    type="checkbox"
                    checked={form.requiresSurfaces}
                    onChange={(e) => setForm({ ...form, requiresSurfaces: e.target.checked })}
                    className="rounded border-border text-primary"
                  />
                  <label
                    htmlFor="catalog-requires-surfaces"
                    className="font-medium text-foreground cursor-pointer"
                  >
                    Sugerir seleção de faces dentárias (V, L/P, M, D, O/I) ao planejar/executar
                  </label>
                </div>

                <div className="sm:col-span-2 lg:col-span-4">
                  <label className="font-semibold text-foreground block mb-1">
                    Template de Evolução Clínica (usado automaticamente no prontuário ao concluir)
                  </label>
                  <textarea
                    rows={3}
                    value={form.evolutionTemplate}
                    onChange={(e) => setForm({ ...form, evolutionTemplate: e.target.value })}
                    placeholder="Descreva o passo a passo técnico padrão (anestesia, isolamento, material, orientações...)"
                    className="w-full rounded-xl border border-border bg-background p-3 text-xs"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 rounded-xl border border-border text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="px-5 py-2 rounded-xl bg-primary hover:bg-primary-deep text-primary-foreground text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>{form.id ? "Salvar Alterações" : "Adicionar à Tabela"}</span>
                </button>
              </div>
            </div>
          )}

          {/* Busca e Filtros */}
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar procedimento por nome, código TUSS ou especialidade..."
                className="w-full rounded-2xl border border-border bg-background pl-10 pr-9 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {["Todas", ...PROCEDURE_CATEGORIES].map((cat) => {
                const active = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-colors cursor-pointer",
                      active
                        ? "bg-primary text-primary-foreground border-primary shadow-xs"
                        : "bg-background text-muted-foreground border-border hover:text-foreground hover:bg-muted/50",
                    )}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Lista de Procedimentos */}
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground rounded-2xl border border-dashed border-border">
              Nenhum procedimento encontrado para os filtros atuais.
            </div>
          ) : (
            <div className="divide-y divide-border rounded-2xl border border-border overflow-hidden bg-background">
              {filtered.map((proc) => (
                <div
                  key={proc.id}
                  className="p-3.5 sm:p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-muted/30 transition-colors"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded-md bg-muted text-muted-foreground font-mono text-[11px] font-semibold">
                        {proc.code}
                      </span>
                      <span className="font-bold text-xs sm:text-sm text-foreground">
                        {proc.name}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-semibold">
                        <Tag className="h-2.5 w-2.5" />
                        {proc.category}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-muted/80 text-muted-foreground text-[11px]">
                        {TARGET_TYPE_LABELS[proc.defaultTargetType]}
                      </span>
                    </div>
                    {proc.evolutionTemplate && (
                      <p className="text-[11px] text-muted-foreground line-clamp-2">
                        {proc.evolutionTemplate}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-3 shrink-0 flex-wrap justify-between md:justify-end">
                    <div className="flex items-center gap-3 text-xs">
                      <div className="text-right">
                        <div className="text-[10px] uppercase text-muted-foreground font-semibold">
                          Particular
                        </div>
                        <div className="font-bold text-foreground">
                          R$ {formatBRLValue(proc.defaultPriceParticular)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] uppercase text-muted-foreground font-semibold">
                          Convênio
                        </div>
                        <div className="font-semibold text-emerald-700 dark:text-emerald-400">
                          R$ {formatBRLValue(proc.defaultPriceConvenio)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {onSelectProcedure && (
                        <button
                          type="button"
                          onClick={() => {
                            onSelectProcedure(proc);
                            onClose();
                          }}
                          className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary-deep cursor-pointer"
                        >
                          Selecionar
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openEditForm(proc)}
                        className="p-2 rounded-lg border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                        title="Editar procedimento e valores"
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(proc)}
                        className="p-2 rounded-lg border border-border bg-card hover:bg-rose-500/10 text-muted-foreground hover:text-rose-600 cursor-pointer"
                        title="Excluir procedimento"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
