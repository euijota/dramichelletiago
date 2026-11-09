import { describe, it, expect } from "vitest";
import {
  evaluateStockStatus,
  getDaysUntilExpiration,
  classifyExpirationStatus,
  calculateTotalStockValuation,
  calculateNewStockBalance,
} from "./inventory";

describe("Inventory Management Logic", () => {
  describe("evaluateStockStatus", () => {
    it("identifies critical stock when quantity is equal to or below minimum", () => {
      const res = evaluateStockStatus(2, 3, 10);
      expect(res.status).toBe("critical");
      expect(res.label).toBe("Abaixo do Mínimo");
      expect(res.progressPercentage).toBe(20);
    });

    it("identifies warning status when above minimum but below ideal", () => {
      const res = evaluateStockStatus(5, 2, 10);
      expect(res.status).toBe("warning");
      expect(res.label).toBe("Estoque Moderado");
      expect(res.progressPercentage).toBe(50);
    });

    it("identifies healthy status when at or above ideal stock", () => {
      const res = evaluateStockStatus(12, 3, 10);
      expect(res.status).toBe("healthy");
      expect(res.label).toBe("Estoque Suficiente");
      expect(res.progressPercentage).toBe(100);
    });
  });

  describe("getDaysUntilExpiration and classifyExpirationStatus", () => {
    const refDate = new Date("2026-11-08T12:00:00");

    it("calculates positive days for future date", () => {
      const days = getDaysUntilExpiration("2026-11-18", refDate);
      expect(days).toBe(10);
      expect(classifyExpirationStatus(days)).toBe("critical");
    });

    it("calculates negative days for expired date", () => {
      const days = getDaysUntilExpiration("2026-11-01", refDate);
      expect(days).toBe(-7);
      expect(classifyExpirationStatus(days)).toBe("expired");
    });

    it("classifies as valid if more than 45 days", () => {
      const days = getDaysUntilExpiration("2027-02-01", refDate);
      expect(days).toBeGreaterThan(45);
      expect(classifyExpirationStatus(days)).toBe("valid");
    });

    it("returns null and none for empty date", () => {
      expect(getDaysUntilExpiration(null)).toBeNull();
      expect(classifyExpirationStatus(null)).toBe("none");
    });
  });

  describe("calculateTotalStockValuation", () => {
    it("sums current_quantity * unit_cost correctly", () => {
      const items = [
        { current_quantity: 4, unit_cost: 100 },
        { current_quantity: 2, unit_cost: 50.5 },
        { current_quantity: 10, unit_cost: null },
      ];
      const total = calculateTotalStockValuation(items);
      expect(total).toBe(501); // (4*100) + (2*50.5) + 0
    });

    it("handles empty items array gracefully", () => {
      expect(calculateTotalStockValuation([])).toBe(0);
    });
  });

  describe("calculateNewStockBalance", () => {
    it("adds quantity on entrada", () => {
      expect(calculateNewStockBalance(5, 3, "entrada")).toBe(8);
    });

    it("subtracts quantity on saida and does not go below zero", () => {
      expect(calculateNewStockBalance(5, 2, "saida")).toBe(3);
      expect(calculateNewStockBalance(3, 5, "saida")).toBe(0);
    });

    it("sets new quantity directly on ajuste", () => {
      expect(calculateNewStockBalance(10, 7, "ajuste")).toBe(7);
    });
  });
});
