import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  PROCEDURE_CATEGORIES,
  DEFAULT_PROCEDURE_CATALOG,
  STORAGE_KEY,
  loadProcedureCatalog,
  saveProcedureCatalog,
  upsertCatalogProcedure,
  deleteCatalogProcedure,
  resetProcedureCatalogToDefaults,
  filterProcedures,
  getSuggestedProcedurePrice,
  isToothNumber,
  formatProcedureTarget,
  targetTypeToDefaultToothNumber,
  parseMoneyInput,
  buildProcedureEvolutionText,
  calculateTreatmentPlanTotals,
  formatBudgetRecordContent,
} from "./procedures";
import { parseOrcamentoInfo } from "./crc";

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}

describe("Procedures Catalog & Treatment Plan Utilities", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createMemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("Catálogo Padrão e Persistência", () => {
    it("deve carregar o catálogo padrão cobrindo todas as especialidades e com templates preenchidos", () => {
      const catalog = loadProcedureCatalog();
      expect(catalog.length).toBeGreaterThanOrEqual(30);

      const categoriesInCatalog = new Set(catalog.map((p) => p.category));
      for (const cat of PROCEDURE_CATEGORIES) {
        expect(categoriesInCatalog.has(cat)).toBe(true);
      }

      for (const proc of catalog) {
        expect(proc.id).toBeTruthy();
        expect(proc.code).toBeTruthy();
        expect(proc.name).toBeTruthy();
        expect(proc.evolutionTemplate.trim().length).toBeGreaterThan(10);
        expect(proc.defaultPriceParticular).toBeGreaterThanOrEqual(0);
        expect(proc.defaultPriceConvenio).toBeGreaterThanOrEqual(0);
      }
    });

    it("deve permitir criar, editar, excluir e restaurar procedimentos no catálogo", () => {
      const afterCreate = upsertCatalogProcedure({
        code: "CLIN-999",
        name: "Bichectomia Estética",
        category: "Harmonização Orofacial (HOF)",
        defaultTargetType: "face",
        requiresSurfaces: false,
        defaultPriceParticular: 2500,
        defaultPriceConvenio: 2100,
        defaultStatus: "planned",
        evolutionTemplate: "Procedimento cirúrgico estético realizado sem intercorrências.",
      });

      const created = afterCreate.find((p) => p.code === "CLIN-999");
      expect(created).toBeDefined();
      expect(created?.isCustom).toBe(true);
      expect(loadProcedureCatalog().some((p) => p.code === "CLIN-999")).toBe(true);

      const afterUpdate = upsertCatalogProcedure({
        ...created!,
        defaultPriceParticular: 2800,
      });
      expect(afterUpdate.find((p) => p.id === created!.id)?.defaultPriceParticular).toBe(2800);

      const afterDelete = deleteCatalogProcedure(created!.id);
      expect(afterDelete.some((p) => p.id === created!.id)).toBe(false);

      saveProcedureCatalog([]);
      // Reset explícito restaura o catálogo completo padrão
      const reset = resetProcedureCatalogToDefaults();
      expect(reset.length).toBe(DEFAULT_PROCEDURE_CATALOG.length);
      expect(localStorage.getItem(STORAGE_KEY)).toBeTruthy();
    });
  });

  describe("Busca, Filtro e Tabela de Preços", () => {
    it("deve filtrar por categoria e buscar sem diferenciar acentos ou maiúsculas", () => {
      const byText = filterProcedures(DEFAULT_PROCEDURE_CATALOG, { query: "restauracao" });
      expect(byText.length).toBeGreaterThanOrEqual(3);
      expect(byText.every((p) => p.name.toLowerCase().includes("restauração"))).toBe(true);

      const byCode = filterProcedures(DEFAULT_PROCEDURE_CATALOG, { query: "84000190" });
      expect(byCode.some((p) => p.name.includes("Profilaxia"))).toBe(true);

      const byCategory = filterProcedures(DEFAULT_PROCEDURE_CATALOG, {
        category: "Endodontia",
        query: "canal",
      });
      expect(byCategory.length).toBeGreaterThanOrEqual(3);
      expect(byCategory.every((p) => p.category === "Endodontia")).toBe(true);
    });

    it("deve sugerir valor Particular ou Convênio conforme o plano do paciente", () => {
      const proc = DEFAULT_PROCEDURE_CATALOG.find((p) => p.id === "proc-restauracao-resina-2f")!;
      expect(getSuggestedProcedurePrice(proc, null)).toBe(proc.defaultPriceParticular);
      expect(getSuggestedProcedurePrice(proc, "")).toBe(proc.defaultPriceParticular);
      expect(getSuggestedProcedurePrice(proc, "PARTICULAR")).toBe(proc.defaultPriceParticular);
      expect(getSuggestedProcedurePrice(proc, "particular")).toBe(proc.defaultPriceParticular);
      expect(getSuggestedProcedurePrice(proc, "ODONTOPREV")).toBe(proc.defaultPriceConvenio);
      expect(getSuggestedProcedurePrice(proc, "Bradesco Dental")).toBe(proc.defaultPriceConvenio);
    });
  });

  describe("Alvos Odontológicos e Geração de Evolução Clínica", () => {
    it("deve identificar dentes válidos e formatar corretamente dentes, faces e regiões gerais", () => {
      expect(isToothNumber(24)).toBe(true);
      expect(isToothNumber(55)).toBe(true);
      expect(isToothNumber(0)).toBe(false);
      expect(isToothNumber(3)).toBe(false);

      expect(formatProcedureTarget(24, ["M", "O"])).toBe("Dente 24 (M, O)");
      expect(formatProcedureTarget(11, [])).toBe("Dente 11");
      expect(formatProcedureTarget(0)).toBe("Boca Toda / Geral");
      expect(formatProcedureTarget(1)).toBe("Arcada Superior");
      expect(formatProcedureTarget(2)).toBe("Arcada Inferior");
      expect(formatProcedureTarget(3)).toBe("Face / HOF");
      expect(formatProcedureTarget(4)).toBe("Sextantes / Periodontia");

      expect(targetTypeToDefaultToothNumber("mouth", 16)).toBe(0);
      expect(targetTypeToDefaultToothNumber("arch_upper", 16)).toBe(1);
      expect(targetTypeToDefaultToothNumber("face", 16)).toBe(3);
      expect(targetTypeToDefaultToothNumber("tooth", 24)).toBe(24);
    });

    it("deve gerar evolução clínica estruturada com dados do procedimento e materiais", () => {
      const proc = DEFAULT_PROCEDURE_CATALOG.find((p) => p.id === "proc-restauracao-resina-2f")!;
      const text = buildProcedureEvolutionText({
        procedureName: proc.name,
        catalogItem: proc,
        toothNumber: 24,
        surfaces: ["M", "O"],
        materialOrShade: "Resina Z350 A2 + Adesivo Single Bond",
        anesthetic: "Mepivacaína 2% (1 tubete)",
        notes: "Paciente tolerou bem o procedimento.",
        cost: 290,
      });

      expect(text).toContain("Procedimento executado: Restauração em Resina Composta (2 Faces)");
      expect(text).toContain("Dente / Região: Dente 24 (M, O)");
      expect(text).toContain("Anestésico / Técnica: Mepivacaína 2% (1 tubete)");
      expect(text).toContain("Material / Cor / Lote: Resina Z350 A2 + Adesivo Single Bond");
      expect(text).toContain("Descrição Clínica:");
      expect(text).toContain("Observações da Sessão: Paciente tolerou bem o procedimento.");
      expect(text).toContain("Valor de Referência: R$ 290,00");
    });

    it("deve converter strings monetárias em português e inglês corretamente", () => {
      expect(parseMoneyInput("350,00")).toBe(350);
      expect(parseMoneyInput("1.250,50")).toBe(1250.5);
      expect(parseMoneyInput("R$ 890,00")).toBe(890);
      expect(parseMoneyInput("200.00")).toBe(200);
      expect(parseMoneyInput("")).toBe(0);
    });
  });

  describe("Totais do Plano de Tratamento e Compatibilidade com CRC", () => {
    it("deve calcular totais, descontos e percentual de conclusão do plano", () => {
      const totals = calculateTreatmentPlanTotals(
        [
          { cost: 220, status: "completed" },
          { cost: 290, status: "in_progress" },
          { cost: 490, status: "planned" },
        ],
        100,
      );

      expect(totals.subtotal).toBe(1000);
      expect(totals.discount).toBe(100);
      expect(totals.total).toBe(900);
      expect(totals.totalCount).toBe(3);
      expect(totals.completedCount).toBe(1);
      expect(totals.inProgressCount).toBe(1);
      expect(totals.plannedCount).toBe(1);
      expect(totals.completedValue).toBe(220);
      expect(totals.plannedValue).toBe(780);
      expect(totals.completionPercent).toBe(33);
    });

    it("deve formatar orçamento multi-itens preservando a extração do valor total e status no parseOrcamentoInfo", () => {
      const items = [
        {
          id: "1",
          procedureCode: "84000190",
          procedureName: "Profilaxia + ATF + OHB",
          toothNumber: 0,
          surfaces: [],
          cost: 220,
        },
        {
          id: "2",
          procedureCode: "85100200",
          procedureName: "Restauração em Resina Composta (2 Faces)",
          toothNumber: 24,
          surfaces: ["M", "O"],
          cost: 290,
        },
        {
          id: "3",
          procedureCode: "85200140",
          procedureName: "Tratamento de Canal (Endo Unirradicular)",
          toothNumber: 11,
          surfaces: [],
          cost: 750,
        },
      ];

      const pendingContent = formatBudgetRecordContent({
        title: "Planejamento Clínico",
        items,
        discount: 60,
        paymentForm: "Cartão de Crédito",
        status: "Aberto",
        insuranceTable: "PARTICULAR",
      });

      const pendingParsed = parseOrcamentoInfo(
        "Planejamento Clínico [Aberto] — 3 procs. — R$ 1.200,00",
        pendingContent,
      );
      expect(pendingParsed.status).toBe("pendente");
      expect(pendingParsed.amount).toBe("R$ 1.200,00");

      const approvedContent = formatBudgetRecordContent({
        title: "Planejamento Clínico",
        items,
        discount: 60,
        paymentForm: "PIX / À vista",
        status: "Aprovado",
      });

      const approvedParsed = parseOrcamentoInfo(
        "Planejamento Clínico [Aprovado] — 3 procs. — R$ 1.200,00",
        approvedContent,
      );
      expect(approvedParsed.status).toBe("aprovado");
      expect(approvedParsed.amount).toBe("R$ 1.200,00");
    });
  });
});
