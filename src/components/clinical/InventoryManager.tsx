import { useState, useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  evaluateStockStatus,
  getDaysUntilExpiration,
  classifyExpirationStatus,
  calculateTotalStockValuation,
} from "@/lib/inventory";
import {
  Boxes,
  Package,
  Plus,
  Minus,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Search,
  Filter,
  DollarSign,
  Download,
  Edit,
  Trash2,
  RotateCcw,
  Building2,
  Calendar,
  Layers,
  ArrowUpRight,
  ArrowDownLeft,
  X,
  History,
  FileSpreadsheet,
  MapPin,
  Sparkles,
  User,
  Info,
} from "lucide-react";

export interface InventoryProduct {
  id: string;
  code: string | null;
  name: string;
  category: string;
  unit: string;
  current_quantity: number;
  min_quantity: number;
  ideal_quantity: number;
  unit_cost: number | null;
  supplier: string | null;
  batch_number: string | null;
  expiration_date: string | null;
  location: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface InventoryTransaction {
  id: string;
  product_id: string;
  transaction_type: "entrada" | "saida" | "ajuste";
  quantity: number;
  previous_quantity: number | null;
  new_quantity: number | null;
  unit_cost: number | null;
  reason: string;
  patient_id: string | null;
  responsible: string | null;
  notes: string | null;
  created_at: string;
  product?: {
    name: string;
    code: string | null;
    category: string;
    unit: string;
  };
  patient?: {
    name: string;
    record_number: number;
  };
}

const CATEGORIES = [
  "Todas",
  "Dentística / Estética",
  "Anestésicos & Agulhas",
  "Biossegurança & Descartáveis",
  "Moldagem & Prótese",
  "Cirurgia & Periodontia",
  "Endodontia",
  "Ortodontia",
  "Implantodontia",
  "Geral / Clínico",
] as const;

const UNITS = [
  { value: "un", label: "Unidade (un)" },
  { value: "cx", label: "Caixa (cx)" },
  { value: "frasco", label: "Frasco" },
  { value: "tubo", label: "Tubo / Bisnaga" },
  { value: "pct", label: "Pacote (pct)" },
  { value: "kit", label: "Kit" },
  { value: "rolo", label: "Rolo" },
  { value: "par", label: "Par" },
];

function formatBRL(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatDateBR(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const [year, month, day] = dateStr.split("T")[0].split("-");
  if (!year || !month || !day) return dateStr;
  return `${day}/${month}/${year}`;
}

export function InventoryManager() {
  const queryClient = useQueryClient();

  // Navigation & Filter state
  const [subTab, setSubTab] = useState<"estoque" | "historico">("estoque");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("Todas");
  const [statusFilter, setStatusFilter] = useState<"todos" | "abaixo_minimo" | "vencendo">("todos");

  // Modals state
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<InventoryProduct | null>(null);

  const [showEntryModal, setShowEntryModal] = useState(false);
  const [entrySelectedProduct, setEntrySelectedProduct] = useState<InventoryProduct | null>(null);

  const [showExitModal, setShowExitModal] = useState(false);
  const [exitSelectedProduct, setExitSelectedProduct] = useState<InventoryProduct | null>(null);

  // Form states for Product Modal
  const [productForm, setProductForm] = useState({
    code: "",
    name: "",
    category: "Dentística / Estética",
    unit: "un",
    current_quantity: 0,
    min_quantity: 2,
    ideal_quantity: 5,
    unit_cost: 0,
    supplier: "",
    batch_number: "",
    expiration_date: "",
    location: "",
    notes: "",
  });

  // Form states for Entry Modal
  const [entryForm, setEntryForm] = useState({
    quantity: 1,
    unit_cost: 0,
    supplier: "",
    batch_number: "",
    expiration_date: "",
    reason: "Compra / Reposição de Fornecedor",
    responsible: "Dra. Michelle Tiago",
    notes: "",
  });

  // Form states for Exit Modal
  const [exitForm, setExitForm] = useState({
    quantity: 1,
    reason: "Consumo Clínico / Atendimento",
    patient_id: "",
    responsible: "Dra. Michelle Tiago",
    notes: "",
  });

  // Fetch Inventory Products
  const { data: products = [], isLoading: isLoadingProducts } = useQuery({
    queryKey: ["inventory_products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_products")
        .select("*")
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (error) {
        console.error("Erro ao carregar materiais de estoque:", error);
        throw error;
      }
      return (data || []) as InventoryProduct[];
    },
  });

  // Fetch Inventory Transactions History
  const { data: transactions = [], isLoading: isLoadingTransactions } = useQuery({
    queryKey: ["inventory_transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_transactions")
        .select(
          `
          id,
          product_id,
          transaction_type,
          quantity,
          previous_quantity,
          new_quantity,
          unit_cost,
          reason,
          patient_id,
          responsible,
          notes,
          created_at,
          product:inventory_products (
            name,
            code,
            category,
            unit
          ),
          patient:patients (
            name,
            record_number
          )
        `,
        )
        .order("created_at", { ascending: false })
        .limit(150);

      if (error) {
        console.error("Erro ao carregar movimentações:", error);
        throw error;
      }
      return (data || []) as unknown as InventoryTransaction[];
    },
  });

  // Fetch Patients for optional exit linkage
  const { data: patients = [] } = useQuery({
    queryKey: ["patients_simple_list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients")
        .select("id, name, phone, record_number")
        .order("name", { ascending: true })
        .limit(200);

      if (error) return [];
      return data || [];
    },
  });

  // KPI Calculations
  const stats = useMemo(() => {
    const totalItems = products.length;
    let lowStockCount = 0;
    let criticalExpiryCount = 0;
    let totalStockValue = 0;

    for (const p of products) {
      if (Number(p.current_quantity) <= Number(p.min_quantity)) {
        lowStockCount++;
      }
      const days = getDaysUntilExpiration(p.expiration_date);
      if (days !== null && days <= 45) {
        criticalExpiryCount++;
      }
      const cost = Number(p.unit_cost) || 0;
      const qty = Number(p.current_quantity) || 0;
      totalStockValue += cost * qty;
    }

    return {
      totalItems,
      lowStockCount,
      criticalExpiryCount,
      totalStockValue,
    };
  }, [products]);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      // Category filter
      if (selectedCategory !== "Todas" && p.category !== selectedCategory) {
        return false;
      }

      // Status filter
      if (statusFilter === "abaixo_minimo") {
        if (Number(p.current_quantity) > Number(p.min_quantity)) return false;
      } else if (statusFilter === "vencendo") {
        const days = getDaysUntilExpiration(p.expiration_date);
        if (days === null || days > 45) return false;
      }

      // Search term
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchName = p.name.toLowerCase().includes(term);
        const matchCode = (p.code || "").toLowerCase().includes(term);
        const matchSupplier = (p.supplier || "").toLowerCase().includes(term);
        const matchLocation = (p.location || "").toLowerCase().includes(term);
        const matchBatch = (p.batch_number || "").toLowerCase().includes(term);
        const matchCategory = p.category.toLowerCase().includes(term);
        return (
          matchName || matchCode || matchSupplier || matchLocation || matchBatch || matchCategory
        );
      }

      return true;
    });
  }, [products, selectedCategory, statusFilter, searchTerm]);

  // Mutation: Save Product (Create or Update)
  const saveProductMutation = useMutation({
    mutationFn: async (payload: {
      id?: string;
      code: string | null;
      name: string;
      category: string;
      unit: string;
      current_quantity: number;
      min_quantity: number;
      ideal_quantity: number;
      unit_cost: number | null;
      supplier: string | null;
      batch_number: string | null;
      expiration_date: string | null;
      location: string | null;
      notes: string | null;
    }) => {
      if (payload.id) {
        // Update existing product
        const { error } = await supabase
          .from("inventory_products")
          .update({
            code: payload.code,
            name: payload.name,
            category: payload.category,
            unit: payload.unit,
            current_quantity: payload.current_quantity,
            min_quantity: payload.min_quantity,
            ideal_quantity: payload.ideal_quantity,
            unit_cost: payload.unit_cost,
            supplier: payload.supplier,
            batch_number: payload.batch_number,
            expiration_date: payload.expiration_date || null,
            location: payload.location,
            notes: payload.notes,
            updated_at: new Date().toISOString(),
          })
          .eq("id", payload.id);

        if (error) throw error;
        return { isNew: false, id: payload.id };
      } else {
        // Create new product
        const { data, error } = await supabase
          .from("inventory_products")
          .insert({
            code: payload.code,
            name: payload.name,
            category: payload.category,
            unit: payload.unit,
            current_quantity: payload.current_quantity,
            min_quantity: payload.min_quantity,
            ideal_quantity: payload.ideal_quantity,
            unit_cost: payload.unit_cost,
            supplier: payload.supplier,
            batch_number: payload.batch_number,
            expiration_date: payload.expiration_date || null,
            location: payload.location,
            notes: payload.notes,
            is_active: true,
          })
          .select("id")
          .single();

        if (error) throw error;

        // If initial quantity > 0, create an entrance transaction
        if (payload.current_quantity > 0 && data?.id) {
          await supabase.from("inventory_transactions").insert({
            product_id: data.id,
            transaction_type: "entrada",
            quantity: payload.current_quantity,
            previous_quantity: 0,
            new_quantity: payload.current_quantity,
            unit_cost: payload.unit_cost,
            reason: "Cadastro Inicial de Estoque",
            responsible: "Dra. Michelle Tiago",
            notes: "Saldo inicial registrado no cadastro do produto",
          });
        }

        return { isNew: true, id: data?.id };
      }
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["inventory_products"] });
      queryClient.invalidateQueries({ queryKey: ["inventory_transactions"] });
      setShowProductModal(false);
      setEditingProduct(null);
      toast.success(
        res.isNew ? "Material cadastrado com sucesso!" : "Material atualizado com sucesso!",
      );
    },
    onError: (err: any) => {
      console.error(err);
      toast.error(`Falha ao salvar material: ${err.message || "Erro desconhecido"}`);
    },
  });

  // Mutation: Register Entry (Entrada de Estoque)
  const registerEntryMutation = useMutation({
    mutationFn: async () => {
      if (!entrySelectedProduct) throw new Error("Selecione um produto");
      if (entryForm.quantity <= 0) throw new Error("A quantidade deve ser maior que 0");

      const prevQty = Number(entrySelectedProduct.current_quantity) || 0;
      const addQty = Number(entryForm.quantity);
      const newQty = prevQty + addQty;

      // 1. Insert transaction
      const { error: txError } = await supabase.from("inventory_transactions").insert({
        product_id: entrySelectedProduct.id,
        transaction_type: "entrada",
        quantity: addQty,
        previous_quantity: prevQty,
        new_quantity: newQty,
        unit_cost: entryForm.unit_cost || entrySelectedProduct.unit_cost,
        reason: entryForm.reason,
        responsible: entryForm.responsible,
        notes: entryForm.notes || null,
      });

      if (txError) throw txError;

      // 2. Update product stock and optionally batch / expiration / supplier
      const updateData: any = {
        current_quantity: newQty,
        updated_at: new Date().toISOString(),
      };

      if (entryForm.unit_cost > 0) updateData.unit_cost = entryForm.unit_cost;
      if (entryForm.supplier.trim()) updateData.supplier = entryForm.supplier.trim();
      if (entryForm.batch_number.trim()) updateData.batch_number = entryForm.batch_number.trim();
      if (entryForm.expiration_date) updateData.expiration_date = entryForm.expiration_date;

      const { error: prodError } = await supabase
        .from("inventory_products")
        .update(updateData)
        .eq("id", entrySelectedProduct.id);

      if (prodError) throw prodError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory_products"] });
      queryClient.invalidateQueries({ queryKey: ["inventory_transactions"] });
      setShowEntryModal(false);
      setEntrySelectedProduct(null);
      toast.success("Entrada de estoque registrada com sucesso!");
    },
    onError: (err: any) => {
      console.error(err);
      toast.error(`Falha ao registrar entrada: ${err.message || "Erro desconhecido"}`);
    },
  });

  // Mutation: Register Exit (Baixa de Estoque)
  const registerExitMutation = useMutation({
    mutationFn: async () => {
      if (!exitSelectedProduct) throw new Error("Selecione um produto");
      if (exitForm.quantity <= 0) throw new Error("A quantidade deve ser maior que 0");

      const prevQty = Number(exitSelectedProduct.current_quantity) || 0;
      const subQty = Number(exitForm.quantity);
      const newQty = Math.max(0, prevQty - subQty);

      // 1. Insert transaction
      const { error: txError } = await supabase.from("inventory_transactions").insert({
        product_id: exitSelectedProduct.id,
        transaction_type: "saida",
        quantity: subQty,
        previous_quantity: prevQty,
        new_quantity: newQty,
        unit_cost: exitSelectedProduct.unit_cost,
        reason: exitForm.reason,
        patient_id: exitForm.patient_id || null,
        responsible: exitForm.responsible,
        notes: exitForm.notes || null,
      });

      if (txError) throw txError;

      // 2. Update product stock
      const { error: prodError } = await supabase
        .from("inventory_products")
        .update({
          current_quantity: newQty,
          updated_at: new Date().toISOString(),
        })
        .eq("id", exitSelectedProduct.id);

      if (prodError) throw prodError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory_products"] });
      queryClient.invalidateQueries({ queryKey: ["inventory_transactions"] });
      setShowExitModal(false);
      setExitSelectedProduct(null);
      toast.success("Baixa de estoque registrada com sucesso!");
    },
    onError: (err: any) => {
      console.error(err);
      toast.error(`Falha ao registrar baixa: ${err.message || "Erro desconhecido"}`);
    },
  });

  // Mutation: Soft Delete Product
  const deleteProductMutation = useMutation({
    mutationFn: async (productId: string) => {
      const { error } = await supabase
        .from("inventory_products")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", productId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory_products"] });
      toast.success("Material arquivado do estoque com sucesso!");
    },
    onError: (err: any) => {
      toast.error(`Falha ao remover produto: ${err.message}`);
    },
  });

  // Handler: Open Product Modal for Edit
  const handleEditProduct = (prod: InventoryProduct) => {
    setEditingProduct(prod);
    setProductForm({
      code: prod.code || "",
      name: prod.name,
      category: prod.category,
      unit: prod.unit || "un",
      current_quantity: Number(prod.current_quantity) || 0,
      min_quantity: Number(prod.min_quantity) || 2,
      ideal_quantity: Number(prod.ideal_quantity) || 5,
      unit_cost: Number(prod.unit_cost) || 0,
      supplier: prod.supplier || "",
      batch_number: prod.batch_number || "",
      expiration_date: prod.expiration_date || "",
      location: prod.location || "",
      notes: prod.notes || "",
    });
    setShowProductModal(true);
  };

  // Handler: Open Product Modal for Create
  const handleCreateProduct = () => {
    setEditingProduct(null);
    setProductForm({
      code: `MAT-${Math.floor(100 + Math.random() * 900)}`,
      name: "",
      category: "Dentística / Estética",
      unit: "un",
      current_quantity: 1,
      min_quantity: 2,
      ideal_quantity: 6,
      unit_cost: 0,
      supplier: "Dental Cremer",
      batch_number: "",
      expiration_date: "",
      location: "Gaveteiro 1",
      notes: "",
    });
    setShowProductModal(true);
  };

  // Handler: Open Quick Entry Modal for a Product
  const handleOpenEntry = (prod: InventoryProduct) => {
    setEntrySelectedProduct(prod);
    setEntryForm({
      quantity: 1,
      unit_cost: Number(prod.unit_cost) || 0,
      supplier: prod.supplier || "",
      batch_number: prod.batch_number || "",
      expiration_date: prod.expiration_date || "",
      reason: "Compra / Reposição de Fornecedor",
      responsible: "Dra. Michelle Tiago",
      notes: "",
    });
    setShowEntryModal(true);
  };

  // Handler: Open Quick Exit Modal for a Product
  const handleOpenExit = (prod: InventoryProduct) => {
    setExitSelectedProduct(prod);
    setExitForm({
      quantity: 1,
      reason: "Consumo Clínico / Atendimento",
      patient_id: "",
      responsible: "Dra. Michelle Tiago",
      notes: "",
    });
    setShowExitModal(true);
  };

  // Export to Excel / CSV
  const handleExportSpreadsheet = async () => {
    try {
      const XLSX = await import("xlsx");
      const rows = products.map((p) => {
        const days = getDaysUntilExpiration(p.expiration_date);
        let statusValidade = "Ok";
        if (days !== null) {
          if (days < 0) statusValidade = `Vencido (${Math.abs(days)}d)`;
          else if (days <= 30) statusValidade = `Vence em ${days}d`;
        }

        return {
          Código: p.code || "—",
          Material: p.name,
          Categoria: p.category,
          Unidade: p.unit,
          "Estoque Atual": p.current_quantity,
          "Estoque Mínimo": p.min_quantity,
          "Estoque Ideal": p.ideal_quantity,
          "Custo Unitário (R$)": p.unit_cost || 0,
          "Valor Total (R$)": (Number(p.unit_cost) || 0) * Number(p.current_quantity),
          Fornecedor: p.supplier || "—",
          Lote: p.batch_number || "—",
          Validade: formatDateBR(p.expiration_date),
          "Status Validade": statusValidade,
          Localização: p.location || "—",
          Observações: p.notes || "",
        };
      });

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, "Estoque");

      const todayStr = new Date().toISOString().split("T")[0];
      XLSX.writeFile(wb, `estoque_clinica_dra_michelle_${todayStr}.xlsx`);
      toast.success("Planilha de estoque exportada com sucesso!");
    } catch (err: any) {
      console.error("Falha ao exportar planilha:", err);
      toast.error("Não foi possível gerar a planilha.");
    }
  };

  return (
    <div className="space-y-6">
      {/* ====================================================================
          1. HEADER & ACTIONS BAR (Apple HIG Style)
          ==================================================================== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card border border-border rounded-3xl p-6 shadow-petal">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-2">
            <Boxes className="h-3.5 w-3.5" />
            <span>Gestão Odontológica Clinicorp</span>
          </div>
          <h1 className="font-display text-2xl font-normal text-foreground flex items-center gap-2.5">
            <Package className="h-6 w-6 text-primary" />
            <span>Controle de Estoque e Materiais</span>
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1 max-w-2xl">
            Rastreamento de insumos clínicos, alertas de lote e validade, controle de consumo por
            paciente e reposição inteligente.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleExportSpreadsheet}
            title="Exportar dados para Excel (.xlsx)"
            className="min-h-11 px-4 rounded-full border border-border bg-card hover:bg-accent text-xs font-semibold text-foreground inline-flex items-center gap-2 transition-all cursor-pointer active:scale-95 shadow-sm"
          >
            <Download className="h-4 w-4 text-muted-foreground" />
            <span className="hidden sm:inline">Exportar Planilha</span>
          </button>

          <button
            onClick={() => {
              if (products.length > 0) {
                handleOpenEntry(products[0]);
              } else {
                handleCreateProduct();
              }
            }}
            className="min-h-11 px-4 rounded-full border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-xs font-semibold text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 shadow-sm"
          >
            <ArrowDownLeft className="h-4 w-4" />
            <span>Dar Entrada</span>
          </button>

          <button
            onClick={() => {
              if (products.length > 0) {
                handleOpenExit(products[0]);
              } else {
                toast.info("Cadastre um produto antes de dar baixa.");
              }
            }}
            className="min-h-11 px-4 rounded-full border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-xs font-semibold text-rose-700 dark:text-rose-400 inline-flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 shadow-sm"
          >
            <ArrowUpRight className="h-4 w-4" />
            <span>Dar Baixa</span>
          </button>

          <button
            onClick={handleCreateProduct}
            className="min-h-11 px-5 rounded-full bg-primary hover:bg-primary-deep text-xs font-semibold uppercase tracking-wider text-primary-foreground inline-flex items-center gap-2 shadow-sm transition-all cursor-pointer active:scale-95"
          >
            <Plus className="h-4 w-4" />
            <span>Novo Material</span>
          </button>
        </div>
      </div>

      {/* ====================================================================
          2. METRIC KPI CARDS (Apple Glassmorphism)
          ==================================================================== */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Total de Itens */}
        <div
          onClick={() => {
            setStatusFilter("todos");
            setSelectedCategory("Todas");
          }}
          className={cn(
            "group relative overflow-hidden rounded-3xl border p-5 shadow-soft transition-all duration-300 cursor-pointer hover:-translate-y-0.5",
            statusFilter === "todos"
              ? "border-primary/50 bg-primary/[0.04]"
              : "border-border/80 bg-card hover:border-primary/30",
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Materiais no Estoque
            </span>
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Boxes className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="font-display text-3xl font-light text-foreground">
              {stats.totalItems}
            </span>
            <span className="text-xs text-muted-foreground">itens cadastrados</span>
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground">
            Clique para ver catálogo completo
          </div>
        </div>

        {/* Card 2: Reposição Necessária */}
        <div
          onClick={() => {
            setStatusFilter(statusFilter === "abaixo_minimo" ? "todos" : "abaixo_minimo");
          }}
          className={cn(
            "group relative overflow-hidden rounded-3xl border p-5 shadow-soft transition-all duration-300 cursor-pointer hover:-translate-y-0.5",
            statusFilter === "abaixo_minimo"
              ? "border-amber-500 bg-amber-500/10"
              : "border-border/80 bg-card hover:border-amber-500/40",
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              Repor Estoque
            </span>
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-2xl",
                stats.lowStockCount > 0
                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 animate-pulse"
                  : "bg-muted text-muted-foreground",
              )}
            >
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span
              className={cn(
                "font-display text-3xl font-light",
                stats.lowStockCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-foreground",
              )}
            >
              {stats.lowStockCount}
            </span>
            <span className="text-xs text-amber-700/80 dark:text-amber-400/80">
              abaixo do mínimo
            </span>
          </div>
          <div className="mt-2 text-[11px] text-amber-700/70 dark:text-amber-400/70">
            {statusFilter === "abaixo_minimo"
              ? "Filtro ativo (clique para limpar)"
              : "Clique para filtrar materiais críticos"}
          </div>
        </div>

        {/* Card 3: Validade Próxima ou Vencida */}
        <div
          onClick={() => {
            setStatusFilter(statusFilter === "vencendo" ? "todos" : "vencendo");
          }}
          className={cn(
            "group relative overflow-hidden rounded-3xl border p-5 shadow-soft transition-all duration-300 cursor-pointer hover:-translate-y-0.5",
            statusFilter === "vencendo"
              ? "border-rose-500 bg-rose-500/10"
              : "border-border/80 bg-card hover:border-rose-500/40",
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-rose-700 dark:text-rose-400">
              Validade Crítica
            </span>
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-2xl",
                stats.criticalExpiryCount > 0
                  ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                  : "bg-muted text-muted-foreground",
              )}
            >
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span
              className={cn(
                "font-display text-3xl font-light",
                stats.criticalExpiryCount > 0
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-foreground",
              )}
            >
              {stats.criticalExpiryCount}
            </span>
            <span className="text-xs text-rose-700/80 dark:text-rose-400/80">
              &lt; 45 dias / vencidos
            </span>
          </div>
          <div className="mt-2 text-[11px] text-rose-700/70 dark:text-rose-400/70">
            {statusFilter === "vencendo"
              ? "Filtro ativo (clique para limpar)"
              : "Clique para auditar lotes vencendo"}
          </div>
        </div>

        {/* Card 4: Valor Patrimonial */}
        <div className="group relative overflow-hidden rounded-3xl border border-border/80 bg-card p-5 shadow-soft transition-all duration-300">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Patrimônio em Estoque
            </span>
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="font-display text-2xl sm:text-3xl font-light text-foreground">
              {formatBRL(stats.totalStockValue)}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground">
            Capital alocado em suprimentos clínicos
          </div>
        </div>
      </div>

      {/* ====================================================================
          3. NAVIGATION SUB-TABS (Estoque vs Histórico)
          ==================================================================== */}
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSubTab("estoque")}
            className={cn(
              "min-h-10 px-5 rounded-full text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer",
              subTab === "estoque"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Package className="h-3.5 w-3.5" />
            <span>Materiais em Estoque ({products.length})</span>
          </button>

          <button
            onClick={() => setSubTab("historico")}
            className={cn(
              "min-h-10 px-5 rounded-full text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer",
              subTab === "historico"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <History className="h-3.5 w-3.5" />
            <span>Histórico de Movimentações ({transactions.length})</span>
          </button>
        </div>

        {subTab === "estoque" && (
          <div className="text-xs text-muted-foreground hidden sm:block">
            Mostrando <strong className="text-foreground">{filteredProducts.length}</strong> de{" "}
            <strong>{products.length}</strong> materiais
          </div>
        )}
      </div>

      {/* ====================================================================
          4. SUB-TAB: MATERIAIS EM ESTOQUE
          ==================================================================== */}
      {subTab === "estoque" && (
        <div className="space-y-4">
          {/* Controls: Search and Categories */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por nome, SKU, lote, armário ou fornecedor..."
                className="w-full min-h-11 rounded-2xl bg-card border border-border pl-10 pr-9 py-2 text-xs sm:text-sm placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/40 shadow-sm"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Category Dropdown & Quick Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
                {CATEGORIES.slice(0, 6).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={cn(
                      "min-h-9 px-3.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all cursor-pointer",
                      selectedCategory === cat
                        ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                        : "bg-card border border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    {cat}
                  </button>
                ))}
                {selectedCategory !== "Todas" &&
                  !CATEGORIES.slice(0, 6).includes(selectedCategory as any) && (
                    <span className="min-h-9 px-3.5 py-1 rounded-full text-xs font-semibold bg-primary text-primary-foreground">
                      {selectedCategory}
                    </span>
                  )}
              </div>
            </div>
          </div>

          {/* Active Filter Pill indicator if filtered */}
          {(statusFilter !== "todos" || selectedCategory !== "Todas" || searchTerm) && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 p-2.5 rounded-2xl border border-border/60">
              <span className="font-semibold text-foreground">Filtros ativos:</span>
              {selectedCategory !== "Todas" && (
                <span className="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-semibold flex items-center gap-1">
                  Categoria: {selectedCategory}
                  <button
                    onClick={() => setSelectedCategory("Todas")}
                    className="hover:text-primary-deep"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {statusFilter === "abaixo_minimo" && (
                <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 text-[11px] font-semibold flex items-center gap-1">
                  Abaixo do Mínimo
                  <button onClick={() => setStatusFilter("todos")} className="hover:opacity-75">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {statusFilter === "vencendo" && (
                <span className="px-2.5 py-0.5 rounded-full bg-rose-500/15 text-rose-700 dark:text-rose-400 text-[11px] font-semibold flex items-center gap-1">
                  Validade Crítica
                  <button onClick={() => setStatusFilter("todos")} className="hover:opacity-75">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {searchTerm && (
                <span className="px-2.5 py-0.5 rounded-full bg-card border border-border text-foreground text-[11px] font-medium flex items-center gap-1">
                  Termo: "{searchTerm}"
                  <button onClick={() => setSearchTerm("")} className="hover:opacity-75">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              <button
                onClick={() => {
                  setSelectedCategory("Todas");
                  setStatusFilter("todos");
                  setSearchTerm("");
                }}
                className="ml-auto text-primary hover:underline text-[11px] font-semibold cursor-pointer"
              >
                Limpar todos
              </button>
            </div>
          )}

          {/* Table / Cards List */}
          {isLoadingProducts ? (
            <div className="bg-card border border-border rounded-3xl p-12 text-center text-muted-foreground">
              Carregando inventário de materiais...
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="bg-card border border-border rounded-3xl p-12 text-center space-y-3">
              <Package className="h-10 w-10 text-muted-foreground/60 mx-auto" />
              <h3 className="font-semibold text-foreground text-sm">
                Nenhum material encontrado com os filtros atuais
              </h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Tente ajustar a busca ou limpar os filtros de categoria e status para exibir os
                itens.
              </p>
              <button
                onClick={() => {
                  setSelectedCategory("Todas");
                  setStatusFilter("todos");
                  setSearchTerm("");
                }}
                className="min-h-9 px-4 rounded-full bg-primary/10 text-primary hover:bg-primary/20 text-xs font-semibold cursor-pointer"
              >
                Resetar Filtros
              </button>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-3xl shadow-soft overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                      <th className="py-3 px-4">Código / SKU</th>
                      <th className="py-3 px-4">Material / Insumo</th>
                      <th className="py-3 px-4">Nível de Estoque</th>
                      <th className="py-3 px-4">Custo / Valor Total</th>
                      <th className="py-3 px-4">Lote & Validade</th>
                      <th className="py-3 px-4">Armário / Gaveteiro</th>
                      <th className="py-3 px-4 text-right">Ações Rápidas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border text-xs">
                    {filteredProducts.map((p) => {
                      const cur = Number(p.current_quantity) || 0;
                      const min = Number(p.min_quantity) || 0;
                      const ideal = Number(p.ideal_quantity) || (min > 0 ? min * 2 : 5);
                      const isLow = cur <= min;
                      const progressPct = Math.min(100, Math.round((cur / ideal) * 100));

                      const daysRemaining = getDaysUntilExpiration(p.expiration_date);
                      const isExpired = daysRemaining !== null && daysRemaining < 0;
                      const isExpiringSoon =
                        daysRemaining !== null && daysRemaining >= 0 && daysRemaining <= 45;

                      const unitCost = Number(p.unit_cost) || 0;
                      const totalVal = cur * unitCost;

                      return (
                        <tr key={p.id} className="hover:bg-accent/40 transition-colors group">
                          {/* 1. Código */}
                          <td className="py-3.5 px-4 font-mono font-bold text-primary whitespace-nowrap">
                            {p.code || "—"}
                          </td>

                          {/* 2. Nome e Categoria */}
                          <td className="py-3.5 px-4 min-w-[220px]">
                            <div className="font-semibold text-foreground text-sm leading-snug">
                              {p.name}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[11px] text-muted-foreground">
                                {p.category}
                              </span>
                              {p.supplier && (
                                <span className="text-[10px] text-muted-foreground/75 px-1.5 py-0.2 rounded bg-muted">
                                  {p.supplier}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 3. Nível de Estoque com Barra de Progresso */}
                          <td className="py-3.5 px-4 min-w-[170px]">
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="font-bold text-foreground">
                                {cur} {p.unit}
                              </span>
                              <span className="text-[11px] text-muted-foreground">
                                Min: {min} / Ideal: {ideal}
                              </span>
                            </div>

                            {/* Progress bar */}
                            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                              <div
                                style={{ width: `${progressPct}%` }}
                                className={cn(
                                  "h-full rounded-full transition-all duration-500",
                                  isLow
                                    ? "bg-rose-500"
                                    : cur < ideal
                                      ? "bg-amber-500"
                                      : "bg-emerald-500",
                                )}
                              />
                            </div>

                            {isLow && (
                              <div className="mt-1 text-[10px] font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                <span>
                                  Abaixo do mínimo ({min} {p.unit})
                                </span>
                              </div>
                            )}
                          </td>

                          {/* 4. Custo e Total */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="font-medium text-foreground">
                              {formatBRL(unitCost)}{" "}
                              <span className="text-[10px] text-muted-foreground">/{p.unit}</span>
                            </div>
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                              Total:{" "}
                              <strong className="text-foreground">{formatBRL(totalVal)}</strong>
                            </div>
                          </td>

                          {/* 5. Lote e Validade */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-[11px] text-muted-foreground">
                                {p.batch_number ? `Lote: ${p.batch_number}` : "S/ Lote"}
                              </span>
                            </div>

                            {p.expiration_date ? (
                              <div className="mt-1">
                                {isExpired ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-700 dark:text-rose-400">
                                    Vencido ({formatDateBR(p.expiration_date)})
                                  </span>
                                ) : isExpiringSoon ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-400">
                                    Vence em {daysRemaining}d ({formatDateBR(p.expiration_date)})
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-muted-foreground">
                                    Val: {formatDateBR(p.expiration_date)}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-[11px] text-muted-foreground">
                                Sem validade
                              </span>
                            )}
                          </td>

                          {/* 6. Armário / Gaveteiro */}
                          <td className="py-3.5 px-4 text-xs text-muted-foreground whitespace-nowrap">
                            {p.location ? (
                              <span className="inline-flex items-center gap-1 text-[11px]">
                                <MapPin className="h-3 w-3 text-primary/70" />
                                {p.location}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/60">—</span>
                            )}
                          </td>

                          {/* 7. Ações Rápidas */}
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              {/* Quick Entry (+) */}
                              <button
                                onClick={() => handleOpenEntry(p)}
                                title="Dar Entrada (+ estoque)"
                                className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20 flex items-center justify-center transition-all cursor-pointer active:scale-95"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>

                              {/* Quick Exit (-) */}
                              <button
                                onClick={() => handleOpenExit(p)}
                                title="Dar Baixa (- estoque)"
                                className="h-8 w-8 rounded-lg bg-rose-500/10 text-rose-700 dark:text-rose-400 hover:bg-rose-500/20 flex items-center justify-center transition-all cursor-pointer active:scale-95"
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </button>

                              {/* Edit */}
                              <button
                                onClick={() => handleEditProduct(p)}
                                title="Editar dados do produto"
                                className="h-8 w-8 rounded-lg bg-muted text-muted-foreground hover:bg-accent hover:text-foreground flex items-center justify-center transition-all cursor-pointer active:scale-95 ml-1"
                              >
                                <Edit className="h-3.5 w-3.5" />
                              </button>

                              {/* Archive / Delete */}
                              <button
                                onClick={() => {
                                  if (
                                    confirm(`Deseja realmente arquivar "${p.name}" do estoque?`)
                                  ) {
                                    deleteProductMutation.mutate(p.id);
                                  }
                                }}
                                title="Arquivar material"
                                className="h-8 w-8 rounded-lg text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10 flex items-center justify-center transition-all cursor-pointer active:scale-95"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ====================================================================
          5. SUB-TAB: HISTÓRICO DE MOVIMENTAÇÕES (Audit Trail)
          ==================================================================== */}
      {subTab === "historico" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              Auditoria completa de todas as entradas, baixas clínicas e descartes registrados no
              sistema.
            </div>
            <div className="text-xs font-semibold text-foreground">
              Total de registros: {transactions.length}
            </div>
          </div>

          {isLoadingTransactions ? (
            <div className="bg-card border border-border rounded-3xl p-12 text-center text-muted-foreground">
              Carregando histórico de movimentações...
            </div>
          ) : transactions.length === 0 ? (
            <div className="bg-card border border-border rounded-3xl p-12 text-center text-muted-foreground space-y-2">
              <History className="h-8 w-8 mx-auto text-muted-foreground/60" />
              <p className="text-sm font-semibold">Nenhuma movimentação registrada até o momento</p>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-3xl shadow-soft overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                      <th className="py-3 px-4">Data & Hora</th>
                      <th className="py-3 px-4">Tipo</th>
                      <th className="py-3 px-4">Material / Insumo</th>
                      <th className="py-3 px-4">Qtd Movimentada</th>
                      <th className="py-3 px-4">Estoque (Antes ➔ Depois)</th>
                      <th className="py-3 px-4">Motivo / Finalidade</th>
                      <th className="py-3 px-4">Paciente Vinculado</th>
                      <th className="py-3 px-4">Responsável</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border text-xs">
                    {transactions.map((t) => {
                      const isEntrada = t.transaction_type === "entrada";
                      const dateObj = new Date(t.created_at);
                      const formattedDate = dateObj.toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      });

                      return (
                        <tr key={t.id} className="hover:bg-accent/40 transition-colors">
                          <td className="py-3 px-4 whitespace-nowrap text-muted-foreground font-mono text-[11px]">
                            {formattedDate}
                          </td>

                          <td className="py-3 px-4 whitespace-nowrap">
                            {isEntrada ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                                <ArrowDownLeft className="h-3 w-3" />+ ENTRADA
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/15 text-rose-700 dark:text-rose-400">
                                <ArrowUpRight className="h-3 w-3" />- SAÍDA
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-4">
                            <div className="font-semibold text-foreground">
                              {t.product?.name || "Produto excluído"}
                            </div>
                            <div className="text-[11px] text-muted-foreground font-mono">
                              {t.product?.code || "—"} · {t.product?.category || "Geral"}
                            </div>
                          </td>

                          <td className="py-3 px-4 whitespace-nowrap">
                            <span
                              className={cn(
                                "font-bold text-sm",
                                isEntrada
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : "text-rose-600 dark:text-rose-400",
                              )}
                            >
                              {isEntrada ? `+${t.quantity}` : `-${t.quantity}`}{" "}
                              {t.product?.unit || "un"}
                            </span>
                          </td>

                          <td className="py-3 px-4 whitespace-nowrap font-mono text-xs text-muted-foreground">
                            {t.previous_quantity ?? "—"} ➔{" "}
                            <strong className="text-foreground">{t.new_quantity ?? "—"}</strong>
                          </td>

                          <td className="py-3 px-4 max-w-[220px]">
                            <div className="font-medium text-foreground">{t.reason}</div>
                            {t.notes && (
                              <div
                                className="text-[11px] text-muted-foreground truncate"
                                title={t.notes}
                              >
                                {t.notes}
                              </div>
                            )}
                          </td>

                          <td className="py-3 px-4 whitespace-nowrap">
                            {t.patient ? (
                              <div className="flex items-center gap-1.5">
                                <User className="h-3 w-3 text-primary/70" />
                                <span className="font-medium text-foreground">
                                  {t.patient.name}
                                </span>
                                <span className="font-mono text-[10px] text-muted-foreground">
                                  (#{t.patient.record_number})
                                </span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground/60">—</span>
                            )}
                          </td>

                          <td className="py-3 px-4 whitespace-nowrap text-muted-foreground text-[11px]">
                            {t.responsible || "Dra. Michelle Tiago"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ====================================================================
          6. MODAL: DAR ENTRADA NO ESTOQUE (Compra / Reposição)
          ==================================================================== */}
      {showEntryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-3xl bg-card border border-border shadow-raised p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <ArrowDownLeft className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-base">
                    Dar Entrada no Estoque
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Registro de novas unidades recebidas de fornecedor ou reposição
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowEntryModal(false)}
                className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                registerEntryMutation.mutate();
              }}
              className="space-y-4"
            >
              {/* Produto Selecionado */}
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">
                  Material / Insumo
                </label>
                <select
                  value={entrySelectedProduct?.id || ""}
                  onChange={(e) => {
                    const prod = products.find((p) => p.id === e.target.value) || null;
                    if (prod) handleOpenEntry(prod);
                  }}
                  className="w-full min-h-11 rounded-2xl bg-muted/50 border border-border px-3.5 py-2 text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code ? `[${p.code}] ` : ""}
                      {p.name} (Atual: {p.current_quantity} {p.unit})
                    </option>
                  ))}
                </select>
              </div>

              {/* Quantidade e Custo Unitário */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Quantidade a Entrar ({entrySelectedProduct?.unit || "un"})
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={entryForm.quantity}
                    onChange={(e) =>
                      setEntryForm((prev) => ({
                        ...prev,
                        quantity: Math.max(1, parseInt(e.target.value, 10) || 1),
                      }))
                    }
                    className="w-full min-h-11 rounded-2xl bg-card border border-border px-3.5 py-2 text-sm font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  <span className="text-[11px] text-muted-foreground mt-1 block">
                    Novo saldo será:{" "}
                    <strong className="text-emerald-600 dark:text-emerald-400">
                      {(Number(entrySelectedProduct?.current_quantity) || 0) +
                        Number(entryForm.quantity)}{" "}
                      {entrySelectedProduct?.unit || "un"}
                    </strong>
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Custo Unitário (R$)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={entryForm.unit_cost}
                    onChange={(e) =>
                      setEntryForm((prev) => ({
                        ...prev,
                        unit_cost: parseFloat(e.target.value) || 0,
                      }))
                    }
                    className="w-full min-h-11 rounded-2xl bg-card border border-border px-3.5 py-2 text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  <span className="text-[11px] text-muted-foreground mt-1 block">
                    Total: {formatBRL(entryForm.quantity * entryForm.unit_cost)}
                  </span>
                </div>
              </div>

              {/* Fornecedor e Lote */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Fornecedor
                  </label>
                  <input
                    type="text"
                    value={entryForm.supplier}
                    onChange={(e) =>
                      setEntryForm((prev) => ({ ...prev, supplier: e.target.value }))
                    }
                    placeholder="Ex: Dental Cremer"
                    className="w-full min-h-11 rounded-2xl bg-card border border-border px-3.5 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Lote Recebido
                  </label>
                  <input
                    type="text"
                    value={entryForm.batch_number}
                    onChange={(e) =>
                      setEntryForm((prev) => ({ ...prev, batch_number: e.target.value }))
                    }
                    placeholder="Ex: L2026-A"
                    className="w-full min-h-11 rounded-2xl bg-card border border-border px-3.5 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-mono"
                  />
                </div>
              </div>

              {/* Data de Validade e Motivo */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Data de Validade
                  </label>
                  <input
                    type="date"
                    value={entryForm.expiration_date}
                    onChange={(e) =>
                      setEntryForm((prev) => ({ ...prev, expiration_date: e.target.value }))
                    }
                    className="w-full min-h-11 rounded-2xl bg-card border border-border px-3.5 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Motivo da Entrada
                  </label>
                  <select
                    value={entryForm.reason}
                    onChange={(e) => setEntryForm((prev) => ({ ...prev, reason: e.target.value }))}
                    className="w-full min-h-11 rounded-2xl bg-card border border-border px-3.5 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  >
                    <option value="Compra / Reposição de Fornecedor">Compra de Fornecedor</option>
                    <option value="Ajuste de Inventário (Sobra)">Ajuste de Inventário</option>
                    <option value="Devolução de Atendimento">Devolução</option>
                    <option value="Bonificação / Amostra Grátis">
                      Amostra Grátis / Bonificação
                    </option>
                  </select>
                </div>
              </div>

              {/* Observações */}
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">
                  Observações / Nº Nota Fiscal (Opcional)
                </label>
                <input
                  type="text"
                  value={entryForm.notes}
                  onChange={(e) => setEntryForm((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Ex: NF 12.345, entrega entregue por motoboy"
                  className="w-full min-h-11 rounded-2xl bg-card border border-border px-3.5 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowEntryModal(false)}
                  className="min-h-10 px-4 rounded-full border border-border text-xs font-semibold text-muted-foreground hover:bg-muted"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={registerEntryMutation.isPending}
                  className="min-h-10 px-5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold text-white shadow-sm flex items-center gap-1.5 cursor-pointer active:scale-95 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>
                    {registerEntryMutation.isPending ? "Registrando..." : "Confirmar Entrada"}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ====================================================================
          7. MODAL: DAR BAIXA NO ESTOQUE (Consumo Clínico / Descarte)
          ==================================================================== */}
      {showExitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-3xl bg-card border border-border shadow-raised p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                  <ArrowUpRight className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-base">Dar Baixa no Estoque</h3>
                  <p className="text-xs text-muted-foreground">
                    Registro de consumo em atendimento de paciente, descarte ou perda
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowExitModal(false)}
                className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                registerExitMutation.mutate();
              }}
              className="space-y-4"
            >
              {/* Produto Selecionado */}
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">
                  Material / Insumo
                </label>
                <select
                  value={exitSelectedProduct?.id || ""}
                  onChange={(e) => {
                    const prod = products.find((p) => p.id === e.target.value) || null;
                    if (prod) handleOpenExit(prod);
                  }}
                  className="w-full min-h-11 rounded-2xl bg-muted/50 border border-border px-3.5 py-2 text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code ? `[${p.code}] ` : ""}
                      {p.name} (Saldo: {p.current_quantity} {p.unit})
                    </option>
                  ))}
                </select>
              </div>

              {/* Quantidade a Baixar */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Quantidade a Baixar ({exitSelectedProduct?.unit || "un"})
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={exitSelectedProduct?.current_quantity || 9999}
                    step="1"
                    required
                    value={exitForm.quantity}
                    onChange={(e) =>
                      setExitForm((prev) => ({
                        ...prev,
                        quantity: Math.max(1, parseInt(e.target.value, 10) || 1),
                      }))
                    }
                    className="w-full min-h-11 rounded-2xl bg-card border border-border px-3.5 py-2 text-sm font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  <span className="text-[11px] text-muted-foreground mt-1 block">
                    Saldo restante será:{" "}
                    <strong
                      className={cn(
                        (Number(exitSelectedProduct?.current_quantity) || 0) -
                          Number(exitForm.quantity) <=
                          Number(exitSelectedProduct?.min_quantity)
                          ? "text-rose-600 dark:text-rose-400"
                          : "text-foreground",
                      )}
                    >
                      {Math.max(
                        0,
                        (Number(exitSelectedProduct?.current_quantity) || 0) -
                          Number(exitForm.quantity),
                      )}{" "}
                      {exitSelectedProduct?.unit || "un"}
                    </strong>
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Motivo da Baixa
                  </label>
                  <select
                    value={exitForm.reason}
                    onChange={(e) => setExitForm((prev) => ({ ...prev, reason: e.target.value }))}
                    className="w-full min-h-11 rounded-2xl bg-card border border-border px-3.5 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  >
                    <option value="Consumo Clínico / Atendimento">Consumo Clínico</option>
                    <option value="Material Vencido / Descarte">Material Vencido / Descarte</option>
                    <option value="Avaria / Quebra / Perda">Avaria / Quebra / Perda</option>
                    <option value="Ajuste de Inventário (Falta)">Ajuste de Inventário</option>
                  </select>
                </div>
              </div>

              {/* Vincular a Paciente (Rastreabilidade Clinicorp) */}
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">
                  Vincular a Paciente (Opcional - Rastreabilidade Clínica)
                </label>
                <select
                  value={exitForm.patient_id}
                  onChange={(e) => setExitForm((prev) => ({ ...prev, patient_id: e.target.value }))}
                  className="w-full min-h-11 rounded-2xl bg-card border border-border px-3.5 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <option value="">Nenhum (Consumo Geral do Consultório)</option>
                  {patients.map((pt) => (
                    <option key={pt.id} value={pt.id}>
                      #{pt.record_number} — {pt.name} {pt.phone ? `(${pt.phone})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Responsável e Observações */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Responsável
                  </label>
                  <input
                    type="text"
                    value={exitForm.responsible}
                    onChange={(e) =>
                      setExitForm((prev) => ({ ...prev, responsible: e.target.value }))
                    }
                    className="w-full min-h-11 rounded-2xl bg-card border border-border px-3.5 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Observações Adicionais
                  </label>
                  <input
                    type="text"
                    value={exitForm.notes}
                    onChange={(e) => setExitForm((prev) => ({ ...prev, notes: e.target.value }))}
                    placeholder="Ex: Procedimento clareamento dental"
                    className="w-full min-h-11 rounded-2xl bg-card border border-border px-3.5 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowExitModal(false)}
                  className="min-h-10 px-4 rounded-full border border-border text-xs font-semibold text-muted-foreground hover:bg-muted"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={registerExitMutation.isPending}
                  className="min-h-10 px-5 rounded-full bg-rose-600 hover:bg-rose-700 text-xs font-semibold text-white shadow-sm flex items-center gap-1.5 cursor-pointer active:scale-95 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{registerExitMutation.isPending ? "Baixando..." : "Confirmar Baixa"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ====================================================================
          8. MODAL: CADASTRAR OU EDITAR MATERIAL (Ficha Completa)
          ==================================================================== */}
      {showProductModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl bg-card border border-border shadow-raised p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                  <Package className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-base">
                    {editingProduct ? "Editar Material de Estoque" : "Novo Material Odontológico"}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Preencha as informações para controle de quantidade, lote e validade
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowProductModal(false)}
                className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveProductMutation.mutate({
                  id: editingProduct ? editingProduct.id : undefined,
                  code: productForm.code || null,
                  name: productForm.name,
                  category: productForm.category,
                  unit: productForm.unit,
                  current_quantity: Number(productForm.current_quantity) || 0,
                  min_quantity: Number(productForm.min_quantity) || 0,
                  ideal_quantity: Number(productForm.ideal_quantity) || 0,
                  unit_cost: Number(productForm.unit_cost) || 0,
                  supplier: productForm.supplier || null,
                  batch_number: productForm.batch_number || null,
                  expiration_date: productForm.expiration_date || null,
                  location: productForm.location || null,
                  notes: productForm.notes || null,
                });
              }}
              className="space-y-4"
            >
              {/* Nome e Código */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Código / SKU
                  </label>
                  <input
                    type="text"
                    value={productForm.code}
                    onChange={(e) => setProductForm((prev) => ({ ...prev, code: e.target.value }))}
                    placeholder="Ex: RES-001"
                    className="w-full min-h-11 rounded-2xl bg-card border border-border px-3.5 py-2 text-xs font-mono font-bold text-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Nome do Material / Insumo *
                  </label>
                  <input
                    type="text"
                    required
                    value={productForm.name}
                    onChange={(e) => setProductForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="Ex: Resina Filtek Z350 XT Cor A2"
                    className="w-full min-h-11 rounded-2xl bg-card border border-border px-3.5 py-2 text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
              </div>

              {/* Categoria e Unidade */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Categoria Clínica *
                  </label>
                  <select
                    value={productForm.category}
                    onChange={(e) =>
                      setProductForm((prev) => ({ ...prev, category: e.target.value }))
                    }
                    className="w-full min-h-11 rounded-2xl bg-card border border-border px-3.5 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  >
                    {CATEGORIES.filter((c) => c !== "Todas").map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Unidade de Medida *
                  </label>
                  <select
                    value={productForm.unit}
                    onChange={(e) => setProductForm((prev) => ({ ...prev, unit: e.target.value }))}
                    className="w-full min-h-11 rounded-2xl bg-card border border-border px-3.5 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  >
                    {UNITS.map((u) => (
                      <option key={u.value} value={u.value}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Quantidade Atual, Mínimo e Ideal */}
              <div className="grid grid-cols-3 gap-3 p-3.5 rounded-2xl bg-muted/40 border border-border/70">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    Estoque Atual
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={productForm.current_quantity}
                    onChange={(e) =>
                      setProductForm((prev) => ({
                        ...prev,
                        current_quantity: parseInt(e.target.value, 10) || 0,
                      }))
                    }
                    className="w-full min-h-10 rounded-xl bg-card border border-border px-3 py-1.5 text-sm font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">
                    Estoque Mínimo
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={productForm.min_quantity}
                    onChange={(e) =>
                      setProductForm((prev) => ({
                        ...prev,
                        min_quantity: parseInt(e.target.value, 10) || 0,
                      }))
                    }
                    className="w-full min-h-10 rounded-xl bg-card border border-border px-3 py-1.5 text-sm font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  <span className="text-[10px] text-muted-foreground">Alerta de reposição</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    Estoque Ideal
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={productForm.ideal_quantity}
                    onChange={(e) =>
                      setProductForm((prev) => ({
                        ...prev,
                        ideal_quantity: parseInt(e.target.value, 10) || 0,
                      }))
                    }
                    className="w-full min-h-10 rounded-xl bg-card border border-border px-3 py-1.5 text-sm font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  <span className="text-[10px] text-muted-foreground">Capacidade cheia</span>
                </div>
              </div>

              {/* Custo Unitário e Fornecedor */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Custo Unitário (R$)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={productForm.unit_cost}
                    onChange={(e) =>
                      setProductForm((prev) => ({
                        ...prev,
                        unit_cost: parseFloat(e.target.value) || 0,
                      }))
                    }
                    className="w-full min-h-11 rounded-2xl bg-card border border-border px-3.5 py-2 text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Fornecedor Principal
                  </label>
                  <input
                    type="text"
                    value={productForm.supplier}
                    onChange={(e) =>
                      setProductForm((prev) => ({ ...prev, supplier: e.target.value }))
                    }
                    placeholder="Ex: Dental Cremer, Dental Speed"
                    className="w-full min-h-11 rounded-2xl bg-card border border-border px-3.5 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
              </div>

              {/* Lote e Data de Validade */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Lote Atual
                  </label>
                  <input
                    type="text"
                    value={productForm.batch_number}
                    onChange={(e) =>
                      setProductForm((prev) => ({ ...prev, batch_number: e.target.value }))
                    }
                    placeholder="Ex: L2025-09"
                    className="w-full min-h-11 rounded-2xl bg-card border border-border px-3.5 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Data de Validade
                  </label>
                  <input
                    type="date"
                    value={productForm.expiration_date}
                    onChange={(e) =>
                      setProductForm((prev) => ({ ...prev, expiration_date: e.target.value }))
                    }
                    className="w-full min-h-11 rounded-2xl bg-card border border-border px-3.5 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
              </div>

              {/* Localização Física (Armário / Gaveteiro) */}
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">
                  Localização no Consultório (Armário / Gaveteiro / Geladeira)
                </label>
                <input
                  type="text"
                  value={productForm.location}
                  onChange={(e) =>
                    setProductForm((prev) => ({ ...prev, location: e.target.value }))
                  }
                  placeholder="Ex: Gaveteiro 1 - Dentística, Geladeira Insumos, Armário Cirurgia"
                  className="w-full min-h-11 rounded-2xl bg-card border border-border px-3.5 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              {/* Observações */}
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">
                  Observações Técnicas / Clínicas
                </label>
                <textarea
                  rows={2}
                  value={productForm.notes}
                  onChange={(e) => setProductForm((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Ex: Guardar ao abrigo da luz solar, uso estrito para facetas e classe IV"
                  className="w-full rounded-2xl bg-card border border-border px-3.5 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowProductModal(false)}
                  className="min-h-10 px-4 rounded-full border border-border text-xs font-semibold text-muted-foreground hover:bg-muted"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saveProductMutation.isPending}
                  className="min-h-10 px-5 rounded-full bg-primary hover:bg-primary-deep text-xs font-semibold text-primary-foreground shadow-sm flex items-center gap-1.5 cursor-pointer active:scale-95 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>
                    {saveProductMutation.isPending
                      ? "Salvando..."
                      : editingProduct
                        ? "Salvar Alterações"
                        : "Cadastrar Material"}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
