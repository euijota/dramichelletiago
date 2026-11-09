export interface InventoryItemCalculation {
  current_quantity: number;
  min_quantity: number;
  ideal_quantity?: number;
  unit_cost?: number | null;
  expiration_date?: string | null;
}

export type StockLevelStatus = "critical" | "warning" | "healthy";

/**
 * Avalia o status do nível de estoque com base nos limites de segurança
 */
export function evaluateStockStatus(
  current: number,
  min: number,
  ideal: number = min > 0 ? min * 2 : 5,
): {
  status: StockLevelStatus;
  label: string;
  progressPercentage: number;
} {
  const currentSafe = Math.max(0, current);
  const minSafe = Math.max(0, min);
  const idealSafe = Math.max(minSafe + 1, ideal);

  const progressPercentage = Math.min(100, Math.round((currentSafe / idealSafe) * 100));

  if (currentSafe <= minSafe) {
    return {
      status: "critical",
      label: "Abaixo do Mínimo",
      progressPercentage,
    };
  }

  if (currentSafe < idealSafe) {
    return {
      status: "warning",
      label: "Estoque Moderado",
      progressPercentage,
    };
  }

  return {
    status: "healthy",
    label: "Estoque Suficiente",
    progressPercentage,
  };
}

/**
 * Calcula dias restantes até o vencimento do lote
 */
export function getDaysUntilExpiration(
  dateStr: string | null | undefined,
  referenceDate?: Date,
): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr + "T00:00:00");
  if (isNaN(target.getTime())) return null;

  const today = referenceDate ? new Date(referenceDate) : new Date();
  today.setHours(0, 0, 0, 0);

  const diffTime = target.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Classifica a urgência da data de validade
 */
export function classifyExpirationStatus(
  daysRemaining: number | null,
): "expired" | "critical" | "valid" | "none" {
  if (daysRemaining === null) return "none";
  if (daysRemaining < 0) return "expired";
  if (daysRemaining <= 45) return "critical";
  return "valid";
}

/**
 * Calcula o valor financeiro patrimonial total do estoque
 */
export function calculateTotalStockValuation(
  items: Array<{ current_quantity: number; unit_cost?: number | null }>,
): number {
  return items.reduce((acc, item) => {
    const cost = Number(item.unit_cost) || 0;
    const qty = Number(item.current_quantity) || 0;
    return acc + cost * qty;
  }, 0);
}

/**
 * Calcula o novo saldo após uma movimentação
 */
export function calculateNewStockBalance(
  currentQuantity: number,
  movementQuantity: number,
  type: "entrada" | "saida" | "ajuste",
): number {
  const current = Number(currentQuantity) || 0;
  const movement = Math.max(0, Number(movementQuantity) || 0);

  if (type === "entrada") {
    return current + movement;
  }
  if (type === "saida") {
    return Math.max(0, current - movement);
  }
  return movement; // ajuste define o novo saldo
}
