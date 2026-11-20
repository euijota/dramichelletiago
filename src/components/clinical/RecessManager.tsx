import { useEffect, useState } from "react";
import { CalendarOff, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatRecessRange, recessDayCount, type RecessPeriod } from "@/lib/recess";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface RecessManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chamado após criar/excluir, para o painel atualizar a agenda. */
  onChanged?: () => void;
}

function todayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

export function RecessManager({ open, onOpenChange, onChanged }: RecessManagerProps) {
  const [recesses, setRecesses] = useState<RecessPeriod[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState(todayISO());

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("clinic_recesses")
      .select("id, name, start_date, end_date")
      .order("start_date", { ascending: true });
    setLoading(false);
    if (error) {
      console.error(error);
      toast.error("Não foi possível carregar os recessos.");
      return;
    }
    setRecesses(data ?? []);
  }

  useEffect(() => {
    if (open) {
      void load();
    } else {
      setEditingId(null);
      setName("");
    }
  }, [open]);

  function startEdit(recess: RecessPeriod) {
    if (!recess.id) return;
    setEditingId(recess.id);
    setName(recess.name);
    setStartDate(recess.start_date);
    setEndDate(recess.end_date);
  }

  function cancelEdit() {
    setEditingId(null);
    setName("");
    const today = todayISO();
    setStartDate(today);
    setEndDate(today);
  }

  async function handleSave() {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      toast.error("Dê um nome ao recesso (ex.: Férias, Congresso).");
      return;
    }
    if (!startDate || !endDate) {
      toast.error("Informe o início e o fim do recesso.");
      return;
    }
    if (endDate < startDate) {
      toast.error("A data final precisa ser igual ou depois do início.");
      return;
    }

    setSaving(true);
    if (editingId) {
      const { error } = await supabase
        .from("clinic_recesses")
        .update({
          name: trimmed,
          start_date: startDate,
          end_date: endDate,
        })
        .eq("id", editingId);
      setSaving(false);

      if (error) {
        console.error(error);
        toast.error("Não foi possível atualizar o recesso.");
        return;
      }

      toast.success("Recesso atualizado com sucesso.");
      setEditingId(null);
      setName("");
      onChanged?.();
      void load();
      return;
    }

    const { error } = await supabase.from("clinic_recesses").insert({
      name: trimmed,
      start_date: startDate,
      end_date: endDate,
    });
    setSaving(false);

    if (error) {
      console.error(error);
      toast.error("Não foi possível salvar o recesso.");
      return;
    }

    toast.success(`Recesso "${trimmed}" criado — agenda bloqueada no período.`);
    setName("");
    onChanged?.();
    void load();
  }

  async function handleDelete(recess: RecessPeriod) {
    if (!recess.id) return;
    if (
      !window.confirm(
        `Excluir o recesso "${recess.name}" (${formatRecessRange(recess)})? A agenda volta a aceitar agendamentos nesse período.`,
      )
    ) {
      return;
    }

    const { error } = await supabase.from("clinic_recesses").delete().eq("id", recess.id);
    if (error) {
      console.error(error);
      toast.error("Não foi possível excluir o recesso.");
      return;
    }
    if (editingId === recess.id) {
      cancelEdit();
    }
    toast.success("Recesso excluído.");
    onChanged?.();
    void load();
  }

  const sorted = [...recesses].sort((a, b) => a.start_date.localeCompare(b.start_date));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarOff className="h-5 w-5 text-primary" /> Recessos e férias
          </DialogTitle>
          <DialogDescription>
            Bloqueia a agenda por inteiro no período escolhido (férias, congresso, viagem). Os
            pacientes não conseguem agendar e o painel avisa em cada dia.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/30 p-4">
            <div className="space-y-1.5">
              <Label htmlFor="recess-name" className="text-xs font-semibold">
                Nome *
              </Label>
              <Input
                id="recess-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Férias de fim de ano, Congresso de Odontologia"
                className="rounded-xl bg-background"
                maxLength={80}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="recess-start" className="text-xs font-semibold">
                  Início *
                </Label>
                <Input
                  id="recess-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    if (e.target.value > endDate) setEndDate(e.target.value);
                  }}
                  className="rounded-xl bg-background"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="recess-end" className="text-xs font-semibold">
                  Fim *
                </Label>
                <Input
                  id="recess-end"
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="rounded-xl bg-background"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="flex-1 rounded-full gap-2"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {editingId ? "Salvar alterações" : "Adicionar recesso"}
              </Button>
              {editingId && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={cancelEdit}
                  disabled={saving}
                  className="rounded-full"
                >
                  Cancelar
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-kicker text-muted-foreground">Recessos cadastrados</p>
            {loading ? (
              <div className="flex items-center justify-center py-6 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : sorted.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                Nenhum recesso cadastrado.
              </p>
            ) : (
              <ul className="max-h-56 space-y-2 overflow-y-auto pr-1">
                {sorted.map((recess) => (
                  <li
                    key={recess.id ?? `${recess.name}-${recess.start_date}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {recess.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatRecessRange(recess)} · {recessDayCount(recess)} dia
                        {recessDayCount(recess) === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(recess)}
                        title="Editar recesso"
                        className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(recess)}
                        title="Excluir recesso"
                        className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-rose-50 hover:text-rose-600 cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
