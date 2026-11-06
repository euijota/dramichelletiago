import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Calendar as CalendarIcon,
  Clock,
  Plus,
  Search,
  CheckCircle2,
  Send,
  X,
  Ban,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CLINIC, INSURANCE_PLANS, buildTimeSlots, trimSeconds } from "@/lib/clinic";
import { generateBookingProtocol } from "@/lib/booking";
import { toast } from "sonner";

interface PatientSummary {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  cpf: string | null;
  insurance: string | null;
  record_number: number;
}

interface NewAppointmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: string; // YYYY-MM-DD
  defaultPatient?: PatientSummary | null;
  defaultMode?: "existing" | "new" | "block";
  onSuccess?: () => void;
}

const COMMON_SERVICES = [
  "Consulta Inicial / Avaliação",
  "Odontopediatria (Atendimento Infantil)",
  "Profilaxia & Limpeza Dental",
  "Restauração Estética em Resina",
  "Clareamento Dental Consultório/Caseiro",
  "Aplicação Tópica de Flúor",
  "Selante Dental Preventivo",
  "Urgência / Alívio de Dor",
  "Manutenção Preventiva Semestral",
  "Outro Procedimento",
];

export function NewAppointmentModal({
  open,
  onOpenChange,
  defaultDate,
  defaultPatient,
  defaultMode = "existing",
  onSuccess,
}: NewAppointmentModalProps) {
  // Mode: "existing" vs "new" vs "block"
  const [patientMode, setPatientMode] = useState<"existing" | "new" | "block">(defaultMode);

  // Search existing patient
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PatientSummary[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<PatientSummary | null>(null);

  // Form Fields
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [insurance, setInsurance] = useState("Particular");
  const [customInsurance, setCustomInsurance] = useState("");

  // Block mode fields
  const [blockReason, setBlockReason] = useState("Compromisso / Bloqueio de Agenda");
  const [blockAllShift, setBlockAllShift] = useState(false);

  const [date, setDate] = useState(() => defaultDate || new Date().toISOString().split("T")[0]);
  const [time, setTime] = useState("15:00");
  const [occupiedTimes, setOccupiedTimes] = useState<string[]>([]);
  const [service, setService] = useState(COMMON_SERVICES[0]);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"confirmed" | "pending">("confirmed");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmedData, setConfirmedData] = useState<{
    id: string;
    protocol: string;
    patientName: string;
    patientPhone: string;
    date: string;
    time: string;
    service: string;
    isBlock?: boolean;
  } | null>(null);

  // Populate when defaultPatient changes
  useEffect(() => {
    if (defaultPatient) {
      setSelectedPatient(defaultPatient);
      setPatientMode("existing");
      setName(defaultPatient.name);
      setPhone(defaultPatient.phone || "");
      setEmail(defaultPatient.email || "");
      setInsurance(defaultPatient.insurance || "Particular");
    } else if (open) {
      setPatientMode(defaultMode);
    }
  }, [defaultPatient, defaultMode, open]);

  useEffect(() => {
    if (defaultDate) {
      setDate(defaultDate);
    }
  }, [defaultDate]);

  // Fetch occupied slots for selected date
  useEffect(() => {
    if (!open || !date) return;
    let active = true;
    supabase
      .from("appointments")
      .select("appointment_time")
      .eq("appointment_date", date)
      .neq("status", "cancelled")
      .then(({ data: rows }) => {
        if (!active) return;
        const times = (rows || []).map((r) => trimSeconds(r.appointment_time));
        setOccupiedTimes(times);
        const weekdaySlots = buildTimeSlots(new Date(date + "T12:00:00").getDay());
        const firstFree = weekdaySlots.find((s) => !times.includes(s));
        if (firstFree) {
          setTime(firstFree);
        } else {
          setTime("");
        }
      });
    return () => {
      active = false;
    };
  }, [date, open]);

  // Live search for patients
  useEffect(() => {
    if (patientMode !== "existing" || !searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const query = searchQuery.trim();
        let dbQuery = supabase
          .from("patients")
          .select("id, name, phone, email, cpf, insurance, record_number")
          .order("name")
          .limit(10);

        if (/^\d+$/.test(query)) {
          dbQuery = dbQuery.or(`phone.ilike.%${query}%,record_number.eq.${parseInt(query, 10)}`);
        } else {
          dbQuery = dbQuery.ilike("name", `%${query}%`);
        }

        const { data, error } = await dbQuery;
        if (!error && data) {
          setSearchResults(data as PatientSummary[]);
        }
      } catch (err) {
        console.error("Error searching patients:", err);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery, patientMode]);

  // Determine weekday and available shifts for Dra. Michelle
  const selectedDateObj = new Date(date + "T12:00:00");
  const weekday = selectedDateObj.getDay();
  const dayNames = [
    "Domingo",
    "Segunda-feira",
    "Terça-feira",
    "Quarta-feira",
    "Quinta-feira",
    "Sexta-feira",
    "Sábado",
  ];
  const dayName = dayNames[weekday] || "";

  // Available slots for Dra. Michelle
  const recommendedSlots = buildTimeSlots(weekday);

  // Reset form
  function handleClose() {
    setConfirmedData(null);
    setSelectedPatient(null);
    setSearchQuery("");
    setName("");
    setPhone("");
    setEmail("");
    setNotes("");
    setBlockAllShift(false);
    setIsSubmitting(false);
    onOpenChange(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!date) {
      toast.error("Selecione a data.");
      return;
    }

    if (patientMode === "block") {
      const reason = blockReason.trim() || "Horário Bloqueado";
      const slotsToBlock =
        blockAllShift && recommendedSlots.length > 0
          ? recommendedSlots.filter((s) => !occupiedTimes.includes(s))
          : [time];

      if (slotsToBlock.length === 0) {
        toast.error("Todos os horários deste turno já estão ocupados.");
        return;
      }

      setIsSubmitting(true);
      try {
        const rows = slotsToBlock.map((slot) => ({
          appointment_date: date,
          appointment_time: slot.length === 5 ? `${slot}:00` : slot,
          patient_name: reason,
          patient_phone: CLINIC.phone,
          patient_email: null,
          service_name: "Bloqueio de Agenda",
          notes: notes.trim() || "Horário bloqueado pelo painel administrativo",
          status: "confirmed" as const,
          patient_id: null,
        }));

        const { data: inserted, error: blockErr } = await supabase
          .from("appointments")
          .insert(rows)
          .select("id");

        if (blockErr) {
          if (blockErr.code === "23505") {
            throw new Error("Este horário já está ocupado ou bloqueado.");
          }
          throw new Error(blockErr.message);
        }

        setConfirmedData({
          id: inserted?.[0]?.id || "block",
          protocol: "BLOQUEIO",
          patientName: reason,
          patientPhone: "",
          date,
          time: slotsToBlock.join(", "),
          service: "Bloqueio de Agenda",
          isBlock: true,
        });
        toast.success(
          slotsToBlock.length > 1
            ? `${slotsToBlock.length} horários bloqueados com sucesso!`
            : "Horário bloqueado com sucesso!",
        );
        if (onSuccess) onSuccess();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Erro ao bloquear horário";
        toast.error(msg);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    const patientName = patientMode === "existing" ? selectedPatient?.name || name : name;
    const patientPhone = patientMode === "existing" ? selectedPatient?.phone || phone : phone;
    const patientEmail = patientMode === "existing" ? selectedPatient?.email || email : email;

    if (!patientName.trim()) {
      toast.error("Por favor, selecione ou informe o nome do paciente.");
      return;
    }

    if (!time) {
      toast.error("Selecione um horário livre na agenda.");
      return;
    }

    if (occupiedTimes.includes(time.slice(0, 5))) {
      toast.error("Este horário já possui paciente agendado! Escolha outro horário ou data.");
      return;
    }

    setIsSubmitting(true);
    const protocol = generateBookingProtocol();
    const finalInsurance = insurance === "Outro" ? customInsurance : insurance;
    const finalServiceName =
      finalInsurance !== "Particular" ? `${service} (Plano: ${finalInsurance})` : service;

    try {
      let patientId = selectedPatient?.id || null;

      // If new patient, insert into public.patients first
      if (patientMode === "new" && !patientId) {
        const { data: newPatient, error: pErr } = await supabase
          .from("patients")
          .insert({
            name: patientName.trim(),
            phone: patientPhone.trim() || null,
            email: patientEmail?.trim() || null,
            insurance: finalInsurance,
            origin: "Painel Clínico",
            notes: notes.trim() || null,
          })
          .select("id, name, phone, email, cpf, insurance, record_number")
          .single();

        if (pErr) {
          throw new Error(`Erro ao cadastrar paciente: ${pErr.message}`);
        }
        if (newPatient) {
          patientId = newPatient.id;
        }
      }

      // Insert appointment
      const formattedTime = time.length === 5 ? `${time}:00` : time;
      const { data: insertedAppt, error: apptErr } = await supabase
        .from("appointments")
        .insert({
          appointment_date: date,
          appointment_time: formattedTime,
          patient_name: patientName.trim(),
          patient_phone: patientPhone.trim() || CLINIC.phone,
          patient_email: patientEmail?.trim() || null,
          service_name: finalServiceName,
          notes: notes.trim() ? `[${protocol}] ${notes.trim()}` : `[${protocol}]`,
          status,
          patient_id: patientId,
        })
        .select("id")
        .single();

      if (apptErr) {
        if (apptErr.code === "23505") {
          throw new Error("Este horário já está ocupado por outro agendamento.");
        }
        throw new Error(apptErr.message);
      }

      setConfirmedData({
        id: insertedAppt.id,
        protocol,
        patientName: patientName.trim(),
        patientPhone: patientPhone.trim(),
        date,
        time,
        service: finalServiceName,
      });

      toast.success("Agendamento criado com sucesso!");
      if (onSuccess) onSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao agendar consulta";
      console.error("Error creating appointment:", err);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  // Generate WhatsApp confirmation message for Dra. Michelle's patient
  function getWhatsAppUrl() {
    if (!confirmedData) return "";
    const [y, m, d] = confirmedData.date.split("-");
    const dateFormatted = `${d}/${m}/${y}`;

    const text = encodeURIComponent(
      `Olá, ${confirmedData.patientName}! 😊\n\n` +
        `Passando para confirmar seu agendamento no consultório da *Dra. Michelle Tiago*:\n\n` +
        `📅 *Data:* ${dateFormatted} (${dayName})\n` +
        `⏰ *Horário:* ${confirmedData.time}\n` +
        `🩺 *Procedimento:* ${confirmedData.service}\n` +
        `📌 *Protocolo:* ${confirmedData.protocol}\n` +
        `📍 *Endereço:* ${CLINIC.address}\n\n` +
        `Por favor, nos confirme sua presença respondendo a esta mensagem. Caso precise remarcar, nos avise com antecedência!\n\n` +
        `Atenciosamente,\n` +
        `*Dra. Michelle Barbosa Tiago*\n` +
        `Cirurgiã-Dentista · CRO-AP 596`,
    );

    const cleanPhone = confirmedData.patientPhone.replace(/\D/g, "");
    const fullPhone = cleanPhone.length > 11 ? cleanPhone : `55${cleanPhone}`;
    return `https://wa.me/${fullPhone}?text=${text}`;
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl rounded-3xl p-0 overflow-hidden bg-background border border-primary/20 shadow-2xl">
        {/* Header */}
        <div className="bg-[#90464f] py-6 px-6 text-white border-b border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center">
                <CalendarIcon className="w-5 h-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-xl font-display font-medium text-white">
                  {patientMode === "block" ? "Bloquear Horário na Agenda" : "Novo Agendamento"}
                </DialogTitle>
                <DialogDescription className="text-white/80 text-xs mt-0.5">
                  Dra. Michelle Barbosa Tiago · CRO-AP 596
                </DialogDescription>
              </div>
            </div>
          </div>
        </div>

        {/* Confirmation Screen */}
        {confirmedData ? (
          <div className="p-8 text-center space-y-6">
            <div className="mx-auto w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-600" />
            </div>

            <div>
              <h3 className="font-display text-2xl text-foreground font-medium">
                {confirmedData.isBlock ? "Horário Bloqueado!" : "Agendamento Confirmado!"}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {confirmedData.isBlock
                  ? "O horário selecionado não ficará disponível para agendamento online."
                  : "Consulta registrada com sucesso na agenda."}
              </p>
              {!confirmedData.isBlock && (
                <div className="inline-block bg-muted text-foreground font-mono font-bold text-sm px-4 py-2 rounded-xl mt-3 border border-border">
                  Protocolo: {confirmedData.protocol}
                </div>
              )}
            </div>

            <div className="bg-accent/40 p-4 rounded-2xl border border-border text-sm text-foreground text-left space-y-2">
              <div className="flex justify-between border-b border-border/40 pb-2">
                <span className="text-muted-foreground">
                  {confirmedData.isBlock ? "Motivo:" : "Paciente:"}
                </span>
                <span className="font-semibold text-foreground">{confirmedData.patientName}</span>
              </div>
              <div className="flex justify-between border-b border-border/40 pb-2">
                <span className="text-muted-foreground">Data e Horário:</span>
                <span className="font-semibold text-primary">
                  {confirmedData.date.split("-").reverse().join("/")} às {confirmedData.time}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tipo:</span>
                <span className="font-medium text-foreground">{confirmedData.service}</span>
              </div>
            </div>

            <div className="space-y-3">
              {!confirmedData.isBlock && confirmedData.patientPhone && (
                <Button
                  onClick={() => window.open(getWhatsAppUrl(), "_blank")}
                  className="w-full bg-[#25D366] hover:bg-[#20ba5a] text-white rounded-full py-6 text-sm font-bold shadow-md transition-silk gap-2 cursor-pointer"
                >
                  <Send className="w-4 h-4" /> Enviar Confirmação via WhatsApp do Paciente
                </Button>
              )}

              <Button
                variant="outline"
                onClick={handleClose}
                className="w-full rounded-full py-5 text-sm font-semibold gap-2 border-border cursor-pointer"
              >
                Concluir e Fechar
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {/* Mode Selector */}
            <div className="flex flex-wrap items-center gap-1.5 p-1 bg-muted/60 rounded-2xl border border-border/60">
              <button
                type="button"
                onClick={() => {
                  setPatientMode("existing");
                  setSelectedPatient(null);
                }}
                className={`flex-1 py-2 px-3 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
                  patientMode === "existing"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Paciente Cadastrado
              </button>
              <button
                type="button"
                onClick={() => {
                  setPatientMode("new");
                  setSelectedPatient(null);
                }}
                className={`flex-1 py-2 px-3 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
                  patientMode === "new"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                + Novo Paciente
              </button>
              <button
                type="button"
                onClick={() => {
                  setPatientMode("block");
                  setSelectedPatient(null);
                }}
                className={`flex-1 py-2 px-3 text-xs font-semibold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  patientMode === "block"
                    ? "bg-amber-600 text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Ban className="w-3.5 h-3.5" />
                Bloquear Horário
              </button>
            </div>

            {/* Existing Patient Search */}
            {patientMode === "existing" && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-foreground">
                  Localizar Paciente (Nome, Telefone ou Prontuário)
                </Label>
                {selectedPatient ? (
                  <div className="flex items-center justify-between p-3.5 bg-primary/5 rounded-2xl border border-primary/20">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                        #{selectedPatient.record_number || "•"}
                      </div>
                      <div>
                        <div className="font-semibold text-sm text-foreground">
                          {selectedPatient.name}
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          {selectedPatient.phone && <span>{selectedPatient.phone}</span>}
                          {selectedPatient.insurance && (
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                              {selectedPatient.insurance}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedPatient(null)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3.5 top-3 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="Digite o nome, celular ou #prontuário..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 rounded-2xl text-sm"
                      autoFocus
                    />

                    {/* Results Dropdown */}
                    {searchResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-56 overflow-y-auto bg-card rounded-2xl border border-border shadow-xl divide-y divide-border/60">
                        {searchResults.map((p) => (
                          <div
                            key={p.id}
                            onClick={() => {
                              setSelectedPatient(p);
                              setName(p.name);
                              setPhone(p.phone || "");
                              setEmail(p.email || "");
                              if (p.insurance) setInsurance(p.insurance);
                              setSearchQuery("");
                              setSearchResults([]);
                            }}
                            className="p-3 hover:bg-accent cursor-pointer transition-colors flex items-center justify-between text-left"
                          >
                            <div>
                              <div className="text-sm font-semibold text-foreground">{p.name}</div>
                              <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                                {p.phone && <span>{p.phone}</span>}
                                {p.cpf && <span>CPF: {p.cpf}</span>}
                              </div>
                            </div>
                            <span className="text-xs font-mono font-medium text-primary">
                              #{p.record_number}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {isSearching && (
                      <div className="text-xs text-muted-foreground mt-1 ml-1">
                        Buscando pacientes...
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {patientMode === "new" && (
              /* New Patient Fields */
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs font-semibold">Nome Completo do Paciente *</Label>
                  <Input
                    required
                    placeholder="Ex: Larissa Monteiro da Silva"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="rounded-2xl"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Telefone / WhatsApp *</Label>
                  <Input
                    required
                    placeholder="(96) 98100-0000"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="rounded-2xl"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">E-mail (opcional)</Label>
                  <Input
                    type="email"
                    placeholder="paciente@gmail.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="rounded-2xl"
                  />
                </div>
              </div>
            )}

            {patientMode === "block" && (
              <div className="space-y-3 p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">
                    Título / Motivo do Bloqueio *
                  </Label>
                  <Input
                    required
                    placeholder="Ex: Congresso, Feriado, Natal Solidário, Compromisso Pessoal..."
                    value={blockReason}
                    onChange={(e) => setBlockReason(e.target.value)}
                    className="rounded-2xl"
                  />
                </div>
                <label className="flex items-center gap-2 text-xs font-semibold text-foreground cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={blockAllShift}
                    onChange={(e) => setBlockAllShift(e.target.checked)}
                    className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                  />
                  <span>Bloquear o turno inteiro deste dia ({recommendedSlots.join(", ")})</span>
                </label>
              </div>
            )}

            {/* Date and Time Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-border/60 pt-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <CalendarIcon className="w-3.5 h-3.5 text-primary" /> Data *
                </Label>
                <Input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="rounded-2xl"
                />
                <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <span className="font-semibold text-foreground">{dayName}</span>
                  {weekday === 0 ? (
                    <span className="text-amber-600 font-semibold">(Domingo Fechado)</span>
                  ) : [1, 2, 4].includes(weekday) ? (
                    <span className="text-emerald-700 font-medium">· Turno Tarde (15h às 18h)</span>
                  ) : (
                    <span className="text-emerald-700 font-medium">· Turno Manhã (09h às 12h)</span>
                  )}
                </div>
              </div>

              {!blockAllShift && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-primary" /> Horário *
                  </Label>
                  {recommendedSlots.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {recommendedSlots.map((slot) => {
                        const isOccupied = occupiedTimes.includes(slot);
                        return (
                          <button
                            key={slot}
                            type="button"
                            disabled={isOccupied}
                            onClick={() => {
                              if (!isOccupied) setTime(slot);
                            }}
                            className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1 ${
                              isOccupied
                                ? "bg-rose-500/10 text-rose-700/60 dark:text-rose-300/60 line-through border border-rose-500/25 cursor-not-allowed"
                                : time === slot
                                  ? "bg-primary text-primary-foreground shadow-sm cursor-pointer"
                                  : "bg-muted text-foreground hover:bg-accent border border-border cursor-pointer"
                            }`}
                            title={
                              isOccupied
                                ? `Horário ${slot} já ocupado por outro agendamento`
                                : `Selecionar horário livre ${slot}`
                            }
                          >
                            <span>{slot}</span>
                            {isOccupied && (
                              <span className="text-[10px] no-underline font-normal">
                                (Ocupado)
                              </span>
                            )}
                          </button>
                        );
                      })}
                      <div className="w-24">
                        <Input
                          type="time"
                          value={time}
                          onChange={(e) => setTime(e.target.value)}
                          className="rounded-xl text-xs h-8"
                        />
                      </div>
                    </div>
                  ) : (
                    <Input
                      type="time"
                      required
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      className="rounded-2xl"
                    />
                  )}
                </div>
              )}
            </div>

            {/* Service & Insurance (only for patient appointments) */}
            {patientMode !== "block" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Procedimento / Motivo</Label>
                  <Select value={service} onValueChange={setService}>
                    <SelectTrigger className="rounded-2xl">
                      <SelectValue placeholder="Selecione o procedimento" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl">
                      {COMMON_SERVICES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Tipo de Atendimento / Plano</Label>
                  <Select value={insurance} onValueChange={setInsurance}>
                    <SelectTrigger className="rounded-2xl">
                      <SelectValue placeholder="Selecione o plano" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl">
                      <SelectItem value="Particular">Particular</SelectItem>
                      {INSURANCE_PLANS.map((plan) => (
                        <SelectItem key={plan} value={plan}>
                          {plan}
                        </SelectItem>
                      ))}
                      <SelectItem value="Outro">Outro Convênio</SelectItem>
                    </SelectContent>
                  </Select>
                  {insurance === "Outro" && (
                    <Input
                      placeholder="Nome do convênio..."
                      value={customInsurance}
                      onChange={(e) => setCustomInsurance(e.target.value)}
                      className="rounded-xl text-xs mt-1"
                    />
                  )}
                </div>
              </div>
            )}

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Observações Clínicas / Notas</Label>
              <Textarea
                rows={2}
                placeholder={
                  patientMode === "block"
                    ? "Observação opcional sobre o bloqueio..."
                    : "Ex: Primeira consulta infantil, trazer exames de raio-x, paciente com receio..."
                }
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="rounded-2xl resize-none text-sm"
              />
            </div>

            {/* Status */}
            {patientMode !== "block" && (
              <div className="flex items-center justify-between p-3 bg-muted/40 rounded-2xl border border-border/60">
                <span className="text-xs font-medium text-foreground">
                  Status Inicial do Agendamento:
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setStatus("confirmed")}
                    className={`px-3 py-1 text-xs font-semibold rounded-full transition-all cursor-pointer ${
                      status === "confirmed"
                        ? "bg-emerald-600 text-white shadow-sm"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Confirmada
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatus("pending")}
                    className={`px-3 py-1 text-xs font-semibold rounded-full transition-all cursor-pointer ${
                      status === "pending"
                        ? "bg-amber-500 text-white shadow-sm"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Pendente
                  </button>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                className="rounded-full px-5 cursor-pointer"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="rounded-full px-7 bg-primary hover:bg-primary-deep text-primary-foreground font-semibold gap-2 shadow-petal cursor-pointer"
              >
                {isSubmitting ? (
                  "Salvando..."
                ) : patientMode === "block" ? (
                  <>
                    <Ban className="w-4 h-4" /> Confirmar Bloqueio
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" /> Salvar Agendamento
                  </>
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
