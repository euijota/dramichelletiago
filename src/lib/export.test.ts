import { describe, it, expect } from "vitest";
import { filterAppointments } from "./export";
import type { AppointmentExport, ExportFilters } from "./export";

const mockAppointments: AppointmentExport[] = [
  {
    id: "1",
    appointment_date: "2026-08-10",
    appointment_time: "09:00:00",
    patient_name: "João Silva",
    patient_phone: "(96) 98765-4321",
    patient_email: "joao@email.com",
    service_name: "Limpeza",
    status: "confirmed",
    notes: "Primeira consulta",
    created_at: "2026-08-01T10:00:00Z",
  },
  {
    id: "2",
    appointment_date: "2026-08-15",
    appointment_time: "14:30:00",
    patient_name: "Maria Santos",
    patient_phone: "(96) 99876-5432",
    patient_email: "maria@email.com",
    service_name: "Avaliação",
    status: "pending",
    notes: null,
    created_at: "2026-08-05T15:00:00Z",
  },
  {
    id: "3",
    appointment_date: "2026-08-20",
    appointment_time: "10:00:00",
    patient_name: "Pedro Costa",
    patient_phone: "(96) 91234-5678",
    patient_email: "pedro@email.com",
    service_name: "Clareamento",
    status: "cancelled",
    notes: "Cancelado pelo paciente",
    created_at: "2026-08-03T12:00:00Z",
  },
  {
    id: "4",
    appointment_date: "2026-08-25",
    appointment_time: "16:00:00",
    patient_name: "Ana Oliveira",
    patient_phone: "(96) 98888-9999",
    patient_email: "ana@email.com",
    service_name: "Manutenção",
    status: "completed",
    notes: "Tratamento finalizado",
    created_at: "2026-08-02T09:00:00Z",
  },
];

describe("Export Filters", () => {
  it("should return all appointments with no filters", () => {
    const result = filterAppointments(mockAppointments, {});
    expect(result).toHaveLength(4);
  });

  it("should filter by start date", () => {
    const filters: ExportFilters = { startDate: "2026-08-15" };
    const result = filterAppointments(mockAppointments, filters);

    expect(result).toHaveLength(3);
    expect(result.every((apt) => apt.appointment_date >= "2026-08-15")).toBe(true);
  });

  it("should filter by end date", () => {
    const filters: ExportFilters = { endDate: "2026-08-15" };
    const result = filterAppointments(mockAppointments, filters);

    expect(result).toHaveLength(2);
    expect(result.every((apt) => apt.appointment_date <= "2026-08-15")).toBe(true);
  });

  it("should filter by date range", () => {
    const filters: ExportFilters = {
      startDate: "2026-08-12",
      endDate: "2026-08-22",
    };
    const result = filterAppointments(mockAppointments, filters);

    expect(result).toHaveLength(2);
    expect(result.map((a) => a.id)).toEqual(["2", "3"]);
  });

  it("should filter by single status", () => {
    const filters: ExportFilters = { status: ["confirmed"] };
    const result = filterAppointments(mockAppointments, filters);

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("confirmed");
  });

  it("should filter by multiple statuses", () => {
    const filters: ExportFilters = { status: ["pending", "confirmed"] };
    const result = filterAppointments(mockAppointments, filters);

    expect(result).toHaveLength(2);
    expect(result.every((a) => ["pending", "confirmed"].includes(a.status))).toBe(true);
  });

  it("should filter by patient name (case insensitive)", () => {
    const filters: ExportFilters = { searchTerm: "maria" };
    const result = filterAppointments(mockAppointments, filters);

    expect(result).toHaveLength(1);
    expect(result[0].patient_name).toBe("Maria Santos");
  });

  it("should filter by phone number", () => {
    const filters: ExportFilters = { searchTerm: "98765" };
    const result = filterAppointments(mockAppointments, filters);

    expect(result).toHaveLength(1);
    expect(result[0].patient_phone).toContain("98765");
  });

  it("should filter by email", () => {
    const filters: ExportFilters = { searchTerm: "pedro@" };
    const result = filterAppointments(mockAppointments, filters);

    expect(result).toHaveLength(1);
    expect(result[0].patient_email).toBe("pedro@email.com");
  });

  it("should filter by service name", () => {
    const filters: ExportFilters = { searchTerm: "clareamento" };
    const result = filterAppointments(mockAppointments, filters);

    expect(result).toHaveLength(1);
    expect(result[0].service_name).toBe("Clareamento");
  });

  it("should combine multiple filters", () => {
    const filters: ExportFilters = {
      startDate: "2026-08-10",
      endDate: "2026-08-20",
      status: ["pending", "cancelled"],
      searchTerm: "santos",
    };
    const result = filterAppointments(mockAppointments, filters);

    expect(result).toHaveLength(1);
    expect(result[0].patient_name).toBe("Maria Santos");
  });

  it("should return empty array when no matches", () => {
    const filters: ExportFilters = { searchTerm: "nonexistent" };
    const result = filterAppointments(mockAppointments, filters);

    expect(result).toHaveLength(0);
  });

  it("should handle empty search term", () => {
    const filters: ExportFilters = { searchTerm: "" };
    const result = filterAppointments(mockAppointments, filters);

    expect(result).toHaveLength(4);
  });

  it("should handle whitespace-only search term", () => {
    const filters: ExportFilters = { searchTerm: "   " };
    const result = filterAppointments(mockAppointments, filters);

    expect(result).toHaveLength(4);
  });
});

describe("Export Data Structure", () => {
  it("should have all required fields", () => {
    const appointment = mockAppointments[0];

    expect(appointment).toHaveProperty("id");
    expect(appointment).toHaveProperty("appointment_date");
    expect(appointment).toHaveProperty("appointment_time");
    expect(appointment).toHaveProperty("patient_name");
    expect(appointment).toHaveProperty("patient_phone");
    expect(appointment).toHaveProperty("patient_email");
    expect(appointment).toHaveProperty("service_name");
    expect(appointment).toHaveProperty("status");
    expect(appointment).toHaveProperty("notes");
    expect(appointment).toHaveProperty("created_at");
  });

  it("should handle null notes field", () => {
    const appointmentWithNullNotes = mockAppointments.find((a) => a.notes === null);
    expect(appointmentWithNullNotes).toBeDefined();
    expect(appointmentWithNullNotes!.notes).toBeNull();
  });
});
