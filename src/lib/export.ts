import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { formatLongDate } from "./clinic";

export interface AppointmentExport {
  id: string;
  appointment_date: string;
  appointment_time: string;
  patient_name: string;
  patient_phone: string;
  patient_email: string;
  service_name: string;
  status: string;
  notes: string | null;
  created_at: string;
}

export interface ExportFilters {
  startDate?: string;
  endDate?: string;
  status?: string[];
  searchTerm?: string;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  confirmed: "Confirmado",
  cancelled: "Cancelado",
  completed: "Concluído",
};

/**
 * Filters appointments based on provided criteria
 */
export function filterAppointments(
  appointments: AppointmentExport[],
  filters: ExportFilters
): AppointmentExport[] {
  let filtered = [...appointments];

  if (filters.startDate) {
    filtered = filtered.filter((apt) => apt.appointment_date >= filters.startDate!);
  }

  if (filters.endDate) {
    filtered = filtered.filter((apt) => apt.appointment_date <= filters.endDate!);
  }

  if (filters.status && filters.status.length > 0) {
    filtered = filtered.filter((apt) => filters.status!.includes(apt.status));
  }

  if (filters.searchTerm && filters.searchTerm.trim()) {
    const term = filters.searchTerm.toLowerCase();
    filtered = filtered.filter(
      (apt) =>
        apt.patient_name.toLowerCase().includes(term) ||
        apt.patient_phone.includes(term) ||
        apt.patient_email.toLowerCase().includes(term) ||
        apt.service_name.toLowerCase().includes(term)
    );
  }

  return filtered;
}

/**
 * Exports appointments to PDF
 */
export function exportToPDF(
  appointments: AppointmentExport[],
  filters: ExportFilters = {}
): void {
  const filtered = filterAppointments(appointments, filters);

  const doc = new jsPDF();

  // Header
  doc.setFontSize(18);
  doc.setTextColor(139, 69, 139); // Primary color
  doc.text("Dra. Michelle Barbosa Tiago", 14, 20);

  doc.setFontSize(12);
  doc.setTextColor(100);
  doc.text("Relatório de Agendamentos", 14, 28);

  // Period info
  doc.setFontSize(10);
  doc.setTextColor(120);
  let periodText = "Período: ";
  if (filters.startDate && filters.endDate) {
    periodText += `${formatBrazilianDate(filters.startDate)} até ${formatBrazilianDate(filters.endDate)}`;
  } else if (filters.startDate) {
    periodText += `A partir de ${formatBrazilianDate(filters.startDate)}`;
  } else if (filters.endDate) {
    periodText += `Até ${formatBrazilianDate(filters.endDate)}`;
  } else {
    periodText += "Todos os agendamentos";
  }
  doc.text(periodText, 14, 35);

  // Summary stats
  const stats = calculateStats(filtered);
  doc.setFontSize(9);
  doc.text(`Total: ${stats.total} | Confirmados: ${stats.confirmed} | Pendentes: ${stats.pending} | Cancelados: ${stats.cancelled}`, 14, 42);

  // Table
  const tableData = filtered.map((apt) => [
    formatBrazilianDate(apt.appointment_date),
    apt.appointment_time.slice(0, 5),
    apt.patient_name,
    apt.patient_phone,
    apt.service_name,
    STATUS_LABELS[apt.status] || apt.status,
  ]);

  autoTable(doc, {
    startY: 48,
    head: [["Data", "Hora", "Paciente", "Telefone", "Serviço", "Status"]],
    body: tableData,
    theme: "grid",
    headStyles: {
      fillColor: [139, 69, 139],
      textColor: 255,
      fontSize: 9,
      fontStyle: "bold",
    },
    bodyStyles: {
      fontSize: 8,
      textColor: 50,
    },
    alternateRowStyles: {
      fillColor: [245, 245, 245],
    },
    columnStyles: {
      0: { cellWidth: 25 },
      1: { cellWidth: 18 },
      2: { cellWidth: 40 },
      3: { cellWidth: 30 },
      4: { cellWidth: 45 },
      5: { cellWidth: 25 },
    },
  });

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      `Gerado em ${new Date().toLocaleString("pt-BR")} - Página ${i} de ${pageCount}`,
      14,
      doc.internal.pageSize.height - 10
    );
  }

  // Download
  const filename = `agenda_${formatFilename()}.pdf`;
  doc.save(filename);
}

/**
 * Exports appointments to Excel
 */
export function exportToExcel(
  appointments: AppointmentExport[],
  filters: ExportFilters = {}
): void {
  const filtered = filterAppointments(appointments, filters);

  // Prepare data
  const data = filtered.map((apt) => ({
    Data: formatBrazilianDate(apt.appointment_date),
    Hora: apt.appointment_time.slice(0, 5),
    Paciente: apt.patient_name,
    Telefone: apt.patient_phone,
    Email: apt.patient_email,
    Serviço: apt.service_name,
    Status: STATUS_LABELS[apt.status] || apt.status,
    Observações: apt.notes || "",
    "Criado em": new Date(apt.created_at).toLocaleString("pt-BR"),
  }));

  // Create workbook
  const wb = XLSX.utils.book_new();

  // Main sheet with appointments
  const ws = XLSX.utils.json_to_sheet(data);

  // Set column widths
  ws["!cols"] = [
    { wch: 12 }, // Data
    { wch: 8 },  // Hora
    { wch: 25 }, // Paciente
    { wch: 15 }, // Telefone
    { wch: 30 }, // Email
    { wch: 25 }, // Serviço
    { wch: 12 }, // Status
    { wch: 40 }, // Observações
    { wch: 18 }, // Criado em
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Agendamentos");

  // Summary sheet
  const stats = calculateStats(filtered);
  const summaryData = [
    { Métrica: "Total de agendamentos", Valor: stats.total },
    { Métrica: "Confirmados", Valor: stats.confirmed },
    { Métrica: "Pendentes", Valor: stats.pending },
    { Métrica: "Cancelados", Valor: stats.cancelled },
    { Métrica: "Concluídos", Valor: stats.completed },
  ];

  if (filters.startDate) {
    summaryData.push({
      Métrica: "Data início",
      Valor: formatBrazilianDate(filters.startDate),
    });
  }

  if (filters.endDate) {
    summaryData.push({
      Métrica: "Data fim",
      Valor: formatBrazilianDate(filters.endDate),
    });
  }

  const wsSummary = XLSX.utils.json_to_sheet(summaryData);
  wsSummary["!cols"] = [{ wch: 25 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "Resumo");

  // Download
  const filename = `agenda_${formatFilename()}.xlsx`;
  XLSX.writeFile(wb, filename);
}

/**
 * Exports appointments to CSV
 */
export function exportToCSV(
  appointments: AppointmentExport[],
  filters: ExportFilters = {}
): void {
  const filtered = filterAppointments(appointments, filters);

  const data = filtered.map((apt) => ({
    Data: formatBrazilianDate(apt.appointment_date),
    Hora: apt.appointment_time.slice(0, 5),
    Paciente: apt.patient_name,
    Telefone: apt.patient_phone,
    Email: apt.patient_email,
    Serviço: apt.service_name,
    Status: STATUS_LABELS[apt.status] || apt.status,
    Observações: apt.notes || "",
    "Criado em": new Date(apt.created_at).toLocaleString("pt-BR"),
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, "Agendamentos");

  const filename = `agenda_${formatFilename()}.csv`;
  XLSX.writeFile(wb, filename, { bookType: "csv" });
}

/**
 * Calculate statistics from appointments
 */
function calculateStats(appointments: AppointmentExport[]) {
  return {
    total: appointments.length,
    confirmed: appointments.filter((a) => a.status === "confirmed").length,
    pending: appointments.filter((a) => a.status === "pending").length,
    cancelled: appointments.filter((a) => a.status === "cancelled").length,
    completed: appointments.filter((a) => a.status === "completed").length,
  };
}

/**
 * Format date to Brazilian format (DD/MM/YYYY)
 */
function formatBrazilianDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

/**
 * Generate filename with current date
 */
function formatFilename(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
