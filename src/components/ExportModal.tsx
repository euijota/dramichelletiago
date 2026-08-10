import { useState } from "react";
import { Download, FileText, FileSpreadsheet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { AppointmentExport, ExportFilters } from "@/lib/export";
import { exportToPDF, exportToExcel, exportToCSV } from "@/lib/export";

interface ExportModalProps {
  appointments: AppointmentExport[];
  onClose: () => void;
}

export function ExportModal({ appointments, onClose }: ExportModalProps) {
  const [format, setFormat] = useState<"pdf" | "excel" | "csv">("pdf");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

  const handleExport = () => {
    const filters: ExportFilters = {
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      status: statusFilter.length > 0 ? statusFilter : undefined,
      searchTerm: searchTerm || undefined,
    };

    switch (format) {
      case "pdf":
        exportToPDF(appointments, filters);
        break;
      case "excel":
        exportToExcel(appointments, filters);
        break;
      case "csv":
        exportToCSV(appointments, filters);
        break;
    }

    onClose();
  };

  const toggleStatus = (status: string) => {
    if (statusFilter.includes(status)) {
      setStatusFilter(statusFilter.filter((s) => s !== status));
    } else {
      setStatusFilter([...statusFilter, status]);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-primary-deep/40 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl overflow-y-auto rounded-3xl bg-card p-8 shadow-bloom"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-display text-3xl text-foreground">Exportar Agenda</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Escolha o formato e os filtros para exportação
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-muted-foreground transition-silk hover:bg-accent hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-8 space-y-6">
          {/* Format selection */}
          <div>
            <Label className="mb-3 block text-sm font-semibold">Formato</Label>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => setFormat("pdf")}
                className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-silk ${
                  format === "pdf"
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <FileText className={`h-8 w-8 ${format === "pdf" ? "text-primary" : "text-muted-foreground"}`} />
                <span className="text-sm font-medium">PDF</span>
              </button>
              <button
                onClick={() => setFormat("excel")}
                className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-silk ${
                  format === "excel"
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <FileSpreadsheet className={`h-8 w-8 ${format === "excel" ? "text-primary" : "text-muted-foreground"}`} />
                <span className="text-sm font-medium">Excel</span>
              </button>
              <button
                onClick={() => setFormat("csv")}
                className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-silk ${
                  format === "csv"
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <FileSpreadsheet className={`h-8 w-8 ${format === "csv" ? "text-primary" : "text-muted-foreground"}`} />
                <span className="text-sm font-medium">CSV</span>
              </button>
            </div>
          </div>

          {/* Date range */}
          <div>
            <Label className="mb-3 block text-sm font-semibold">Período</Label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="startDate" className="mb-1.5 block text-xs text-muted-foreground">
                  Data início
                </Label>
                <input
                  type="date"
                  id="startDate"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                />
              </div>
              <div>
                <Label htmlFor="endDate" className="mb-1.5 block text-xs text-muted-foreground">
                  Data fim
                </Label>
                <input
                  type="date"
                  id="endDate"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                />
              </div>
            </div>
          </div>

          {/* Status filter */}
          <div>
            <Label className="mb-3 block text-sm font-semibold">Status (opcional)</Label>
            <div className="flex flex-wrap gap-2">
              {[
                { value: "pending", label: "Pendente", color: "bg-warning/10 text-warning border-warning/40" },
                { value: "confirmed", label: "Confirmado", color: "bg-success/10 text-success border-success/40" },
                { value: "cancelled", label: "Cancelado", color: "bg-muted text-muted-foreground border-border" },
                { value: "completed", label: "Concluído", color: "bg-primary/10 text-primary border-primary/40" },
              ].map((status) => (
                <button
                  key={status.value}
                  onClick={() => toggleStatus(status.value)}
                  className={`rounded-full border px-4 py-2 text-xs font-medium transition-silk ${
                    statusFilter.includes(status.value)
                      ? status.color
                      : "border-border text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  {statusFilter.includes(status.value) && "✓ "}
                  {status.label}
                </button>
              ))}
            </div>
          </div>

          {/* Search */}
          <div>
            <Label htmlFor="search" className="mb-3 block text-sm font-semibold">
              Buscar (opcional)
            </Label>
            <input
              type="text"
              id="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Nome, telefone, email ou serviço..."
              className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary"
            />
          </div>
        </div>

        <div className="mt-8 flex gap-3">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1 rounded-full"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleExport}
            className="flex-1 rounded-full bg-primary text-white hover:bg-primary/90"
          >
            <Download className="mr-2 h-4 w-4" />
            Exportar {format.toUpperCase()}
          </Button>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          {appointments.length} agendamento{appointments.length !== 1 ? "s" : ""} no total
        </p>
      </div>
    </div>
  );
}
