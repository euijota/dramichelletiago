import { useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";
import { CLINIC } from "@/lib/clinic";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { FileText, Download, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface DocumentGeneratorProps {
  patientId?: string;
  patientName: string;
  patientCpf?: string;
}

const PRESCRIPTION_PRESETS = [
  {
    label: "Receita Adulto com Antibiótico (Padrão Dra. Michelle)",
    medicines: [
      {
        name: "Amoxicilina 500mg (1 cx)",
        instructions: "Tomar 01 comprimido de 08/08h, durante 7 dias.",
      },
      {
        name: "Nimesulida 100mg (1 cx)",
        instructions: "Tomar 01 comprimido de 12/12h, durante 5 dias.",
      },
      {
        name: "Paracetamol 500mg (1 cx)",
        instructions:
          "Tomar 01 comprimido de 06/06h durante o 1º dia; se persistir a dor, manter por mais 2 dias.",
      },
    ],
  },
  {
    label: "Analgesia & Anti-inflamatório (Pós-Procedimento)",
    medicines: [
      {
        name: "Ibuprofeno 600mg (1 cx)",
        instructions: "Tomar 01 comprimido de 08/08h por 3 a 5 dias.",
      },
      {
        name: "Dipirona Sódica 500mg (1 cx)",
        instructions: "Tomar 01 comprimido de 06/06h em caso de dor.",
      },
    ],
  },
  {
    label: "Odontopediatria — Analgesia Infantil (Gotas)",
    medicines: [
      {
        name: "Paracetamol 200mg/mL (Gotas - 1 frasco)",
        instructions:
          "Administrar 1 gota por kg de peso corporal de 06/06h em caso de dor ou febre.",
      },
      {
        name: "Ibuprofeno 100mg/mL (Gotas - 1 frasco)",
        instructions: "Administrar 1 gota por kg de peso corporal de 08/08h durante 3 dias.",
      },
    ],
  },
  {
    label: "Ansiolítico Pré-Atendimento (Ansitec 5mg)",
    medicines: [
      {
        name: "Ansitec 05mg (1 cx / 30 comp)",
        instructions: "Tomar 01 comprimido 30 minutos antes de dormir ou antes do procedimento.",
      },
    ],
  },
];

export function DocumentGenerator({ patientId, patientName, patientCpf }: DocumentGeneratorProps) {
  const queryClient = useQueryClient();
  const [docType, setDocType] = useState<"receita" | "atestado" | "orcamento" | "orientacoes">(
    "receita",
  );
  const [medicines, setMedicines] = useState(PRESCRIPTION_PRESETS[0].medicines);
  const [certificateDays, setCertificateDays] = useState("1");
  const [certificatePeriod, setCertificatePeriod] = useState("das 15:00 às 17:00");
  const [certificateReason, setCertificateReason] = useState(
    "procedimento odontológico sob nossos cuidados profissionais",
  );
  const [budgetText, setBudgetText] = useState(
    "Prótese em Silicone (Dentflex): R$ 1.350,00\n" +
      "• Entrada de 50% à vista + 3x no cartão de crédito sem juros (R$ 1.350,00)\n" +
      "• Entrada de 50% à vista + 50% na entrega do trabalho (R$ 1.200,00)\n\n" +
      "Prótese PPR — Estrutura Metálica: R$ 1.000,00\n" +
      "• Entrada de 50% à vista + 3x no cartão de crédito sem juros (R$ 1.000,00)\n" +
      "• Entrada de 50% à vista + 50% na entrega do trabalho (R$ 900,00)",
  );
  const [postOpText, setPostOpText] = useState(
    "1. Manter a gaze pressionada por 30 minutos após a exodontia.\n" +
      "2. Alimentação fria ou gelada, líquida ou pastosa nas primeiras 24 a 48 horas.\n" +
      "3. Aplicar compressa de gelo na face (15 min com intervalo) nas primeiras 12 horas.\n" +
      "4. Não fazer bochechos vigorosos, não cuspir e evitar exposição ao sol ou esforço físico.\n" +
      "5. Higienizar normalmente os demais dentes e tomar rigorosamente a medicação prescrita.",
  );

  const addMedicine = () => {
    setMedicines([...medicines, { name: "", instructions: "" }]);
  };

  const removeMedicine = (index: number) => {
    setMedicines(medicines.filter((_, i) => i !== index));
  };

  const updateMedicine = (index: number, field: "name" | "instructions", value: string) => {
    const updated = [...medicines];
    updated[index][field] = value;
    setMedicines(updated);
  };

  const generatePDF = async () => {
    try {
      const doc = new jsPDF();
      const today = new Date().toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });

      // Cabeçalho da Clínica
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(144, 70, 79); // Burgundy #90464f
      doc.text(CLINIC.name, 105, 25, { align: "center" });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(108, 117, 125);
      doc.text(`${CLINIC.role} · ${CLINIC.cro}`, 105, 32, { align: "center" });
      doc.text(CLINIC.address, 105, 37, { align: "center" });
      doc.text(`Telefone / WhatsApp: ${CLINIC.phone}`, 105, 42, { align: "center" });

      // Linha divisória
      doc.setDrawColor(144, 70, 79);
      doc.line(20, 48, 190, 48);

      // Dados do Paciente
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(33, 37, 41);
      doc.text(`Paciente: ${patientName}`, 20, 60);
      if (patientCpf) {
        doc.setFont("helvetica", "normal");
        doc.text(`CPF: ${patientCpf}`, 20, 66);
      }

      let recordTitle = "";
      let recordContent = "";

      if (docType === "receita") {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text("RECEITUÁRIO ODONTOLÓGICO (USO INTERNO)", 105, 80, { align: "center" });

        const validMeds = medicines.filter((m) => m.name.trim());
        const tableBody = validMeds.map((m, idx) => [`${idx + 1}. ${m.name}`, m.instructions]);

        autoTable(doc, {
          startY: 90,
          head: [["Medicamento / Apresentação", "Posologia e Instruções de Uso"]],
          body: tableBody,
          theme: "grid",
          headStyles: { fillColor: [144, 70, 79], textColor: 255 },
          styles: { fontSize: 10, cellPadding: 5 },
        });

        recordTitle = "Receituário Emitido";
        recordContent = validMeds.map((m) => `• ${m.name}: ${m.instructions}`).join("\n");
      } else if (docType === "atestado") {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text("ATESTADO ODONTOLÓGICO", 105, 85, { align: "center" });

        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        doc.setTextColor(33, 37, 41);
        const text = `Declaro para os devidos fins trabalhistas/escolares que o(a) paciente ${patientName}${
          patientCpf ? `, inscrito(a) no CPF ${patientCpf}` : ""
        }, esteve sob nossos cuidados profissionais nesta data (${certificatePeriod}) para ${certificateReason}, necessitando de ${certificateDays} dia(s) de repouso/afastamento.`;

        const splitText = doc.splitTextToSize(text, 160);
        doc.text(splitText, 25, 105);

        recordTitle = "Atestado Emitido";
        recordContent = text;
      } else if (docType === "orcamento") {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text("ORÇAMENTO & PLANO PROPOSTO", 105, 85, { align: "center" });

        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        const splitText = doc.splitTextToSize(budgetText, 160);
        doc.text(splitText, 25, 102);

        recordTitle = "Orçamento Emitido";
        recordContent = budgetText;
      } else {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text("ORIENTAÇÕES PÓS-OPERATÓRIAS", 105, 85, { align: "center" });

        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        const splitText = doc.splitTextToSize(postOpText, 160);
        doc.text(splitText, 25, 102);

        recordTitle = "Orientações Pós-Operatórias Emitidas";
        recordContent = postOpText;
      }

      // Data e Assinatura
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(`Macapá/AP, ${today}`, 105, 230, { align: "center" });

      doc.line(65, 255, 145, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(33, 37, 41);
      doc.text(CLINIC.name, 105, 262, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(`${CLINIC.role} · ${CLINIC.cro}`, 105, 267, { align: "center" });

      doc.save(`${docType}_${patientName.replace(/\s+/g, "_")}.pdf`);

      // Registrar automaticamente no prontuário do paciente
      if (patientId && recordContent) {
        await supabase.from("clinical_records").insert({
          patient_id: patientId,
          record_type: "evolucao",
          record_date: new Date().toISOString(),
          title: recordTitle,
          content: recordContent,
        });
        queryClient.invalidateQueries({ queryKey: ["clinical_records", patientId] });
      }

      toast.success("PDF gerado e salvo automaticamente no histórico do prontuário!");
    } catch (e: any) {
      toast.error(`Erro ao gerar PDF: ${e.message}`);
    }
  };

  return (
    <div className="p-6 rounded-3xl bg-card border border-border shadow-petal space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <h4 className="font-display text-xl text-foreground flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Emissão de Documentos Clínicos em PDF
          </h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            Com modelos oficiais da Dra. Michelle e registro automático no prontuário.
          </p>
        </div>

        {/* Seletor de Tipo */}
        <div className="flex flex-wrap items-center gap-1 bg-muted/60 p-1 rounded-xl border border-border text-xs">
          <button
            onClick={() => setDocType("receita")}
            className={cn(
              "px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer",
              docType === "receita"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Receituário
          </button>
          <button
            onClick={() => setDocType("atestado")}
            className={cn(
              "px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer",
              docType === "atestado"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Atestado
          </button>
          <button
            onClick={() => setDocType("orcamento")}
            className={cn(
              "px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer",
              docType === "orcamento"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Orçamento
          </button>
          <button
            onClick={() => setDocType("orientacoes")}
            className={cn(
              "px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer",
              docType === "orientacoes"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Pós-Operatório
          </button>
        </div>
      </div>

      {/* Formulário de Conteúdo da Receita */}
      {docType === "receita" && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Modelos Rápidos da Dra. Michelle
            </label>
            <div className="flex flex-wrap gap-2">
              {PRESCRIPTION_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setMedicines(preset.medicines.map((m) => ({ ...m })))}
                  className="px-3 py-1.5 rounded-xl border border-primary/25 bg-primary/5 hover:bg-primary/15 text-xs font-semibold text-primary transition-all cursor-pointer"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <h5 className="text-xs font-bold text-foreground uppercase tracking-wider">
              Medicamentos Prescritos
            </h5>
            <button
              onClick={addMedicine}
              className="text-xs font-semibold text-primary hover:underline cursor-pointer flex items-center gap-1"
            >
              + Adicionar Medicamento
            </button>
          </div>

          <div className="space-y-3">
            {medicines.map((med, index) => (
              <div
                key={index}
                className="grid grid-cols-1 sm:grid-cols-12 gap-3 p-3.5 rounded-2xl bg-muted/30 border border-border/70"
              >
                <div className="sm:col-span-4">
                  <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
                    Medicamento / Dosagem
                  </label>
                  <input
                    type="text"
                    value={med.name}
                    onChange={(e) => updateMedicine(index, "name", e.target.value)}
                    placeholder="Ex: Amoxicilina 500mg"
                    className="w-full text-xs p-2 rounded-xl border border-border bg-background text-foreground"
                  />
                </div>

                <div className="sm:col-span-7">
                  <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
                    Posologia / Modo de Tomar
                  </label>
                  <input
                    type="text"
                    value={med.instructions}
                    onChange={(e) => updateMedicine(index, "instructions", e.target.value)}
                    placeholder="Ex: Tomar 1 cápsula a cada 8 horas por 7 dias."
                    className="w-full text-xs p-2 rounded-xl border border-border bg-background text-foreground"
                  />
                </div>

                <div className="sm:col-span-1 flex items-end justify-center pb-1">
                  <button
                    onClick={() => removeMedicine(index)}
                    className="text-xs text-muted-foreground hover:text-rose-600 cursor-pointer"
                    title="Excluir"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Formulário de Atestado */}
      {docType === "atestado" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                Dias de Repouso
              </label>
              <input
                type="number"
                value={certificateDays}
                onChange={(e) => setCertificateDays(e.target.value)}
                className="w-full text-xs p-2.5 rounded-xl border border-border bg-background text-foreground"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                Período de Atendimento
              </label>
              <input
                type="text"
                value={certificatePeriod}
                onChange={(e) => setCertificatePeriod(e.target.value)}
                placeholder="Ex: das 15:00 às 17:00"
                className="w-full text-xs p-2.5 rounded-xl border border-border bg-background text-foreground"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                Motivo / Justificativa
              </label>
              <input
                type="text"
                value={certificateReason}
                onChange={(e) => setCertificateReason(e.target.value)}
                className="w-full text-xs p-2.5 rounded-xl border border-border bg-background text-foreground"
              />
            </div>
          </div>
        </div>
      )}

      {/* Formulário de Orçamento */}
      {docType === "orcamento" && (
        <div className="space-y-3">
          <label className="block text-xs font-semibold text-muted-foreground">
            Descrição do Orçamento (Prótese, Restaurações, Tratamentos)
          </label>
          <textarea
            rows={6}
            value={budgetText}
            onChange={(e) => setBudgetText(e.target.value)}
            className="w-full text-xs p-3 rounded-2xl border border-border bg-background text-foreground"
          />
        </div>
      )}

      {/* Formulário de Orientações */}
      {docType === "orientacoes" && (
        <div className="space-y-3">
          <label className="block text-xs font-semibold text-muted-foreground">
            Instruções e Cuidados Pós-Procedimento
          </label>
          <textarea
            rows={6}
            value={postOpText}
            onChange={(e) => setPostOpText(e.target.value)}
            className="w-full text-xs p-3 rounded-2xl border border-border bg-background text-foreground"
          />
        </div>
      )}

      {/* Botão de Geração */}
      <div className="flex justify-end pt-4 border-t border-border">
        <button
          onClick={generatePDF}
          className="text-xs font-semibold px-5 py-2.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all cursor-pointer flex items-center gap-2 shadow-sm"
        >
          <Download className="h-4 w-4" />
          Gerar PDF Timbrado & Salvar no Prontuário
        </button>
      </div>
    </div>
  );
}
