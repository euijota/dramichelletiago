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
import { Calendar, Clock, Check, Send, Phone, User, FileText, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  CLINIC,
  INSURANCE_PLANS,
  buildTimeSlots,
  buildGoogleCalendarUrl,
  parseICSFeed,
  weekdayOf,
} from "@/lib/clinic";
import { toast } from "sonner";

interface BookingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultService?: string;
}

interface DayItem {
  dateString: string;
  dayName: string;
  dayNumber: string;
  monthName: string;
  fullFormatted: string;
  weekday: number;
}

export function BookingModal({ open, onOpenChange, defaultService }: BookingModalProps) {
  const [days, setDays] = useState<DayItem[]>([]);
  const [selectedDay, setSelectedDay] = useState<DayItem | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);

  // Form State
  const [patientName, setPatientName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [patientEmail, setPatientEmail] = useState("");
  const [attendanceType, setAttendanceType] = useState<"particular" | "convenio">("particular");
  const [healthPlan, setHealthPlan] = useState<string>(INSURANCE_PLANS[0]);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState<{
    protocol: string;
    dateFormatted: string;
    time: string;
    name: string;
    phone: string;
  } | null>(null);

  // Generates next 14 available days (skipping Sundays)
  useEffect(() => {
    const nextDays: DayItem[] = [];
    const today = new Date();
    const curr = new Date(today);

    const dayNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
    const monthNames = [
      "Jan",
      "Fev",
      "Mar",
      "Abr",
      "Mai",
      "Jun",
      "Jul",
      "Ago",
      "Set",
      "Out",
      "Nov",
      "Dez",
    ];

    while (nextDays.length < 14) {
      const weekday = curr.getDay();
      if (weekday !== 0) {
        // Skip Sunday
        const year = curr.getFullYear();
        const month = String(curr.getMonth() + 1).padStart(2, "0");
        const dateNum = String(curr.getDate()).padStart(2, "0");
        const dateString = `${year}-${month}-${dateNum}`;

        nextDays.push({
          dateString,
          dayName: dayNames[weekday],
          dayNumber: dateNum,
          monthName: monthNames[curr.getMonth()],
          fullFormatted: `${dayNames[weekday]}, ${dateNum} de ${monthNames[curr.getMonth()]}`,
          weekday,
        });
      }
      curr.setDate(curr.getDate() + 1);
    }

    setDays(nextDays);
    if (nextDays.length > 0) {
      setSelectedDay(nextDays[0]);
    }
  }, []);

  // Fetch booked slots from Supabase + live iCal feed from Consultorio.me / Google Agenda
  useEffect(() => {
    if (!selectedDay) return;

    async function fetchBooked() {
      try {
        const occupied: string[] = [];

        // 1. Fetch from Supabase
        const { data } = await supabase
          .from("appointments")
          .select("appointment_time")
          .eq("appointment_date", selectedDay!.dateString)
          .neq("status", "cancelled");

        if (data) {
          data.forEach((item) => occupied.push(item.appointment_time.slice(0, 5)));
        }

        // 2. Fetch live iCal feed from Google Agenda (Consultório.me)
        try {
          const ICAL_URL =
            "https://calendar.google.com/calendar/ical/dramichellebarbosatiago%40gmail.com/private-01e577e4ac71421318a056fcd50dd223/basic.ics";
          const res = await fetch(ICAL_URL);
          if (res.ok) {
            const text = await res.text();
            const events = parseICSFeed(text);
            events.forEach((evt) => {
              if (evt.date === selectedDay!.dateString) {
                occupied.push(evt.time.slice(0, 5));
              }
            });
          }
        } catch (e) {
          console.warn("iCal fetch warning:", e);
        }

        setBookedSlots(Array.from(new Set(occupied)));
      } catch (err) {
        console.error("Erro ao buscar horários agendados:", err);
      }
    }

    fetchBooked();
  }, [selectedDay]);

  const availableTimeSlots = selectedDay ? buildTimeSlots(selectedDay.weekday) : [];

  // Mask Phone: (XX) XXXXX-XXXX
  function handlePhoneChange(e: React.ChangeEvent<HTMLInputElement>) {
    let val = e.target.value.replace(/\D/g, "");
    if (val.length > 11) val = val.slice(0, 11);

    if (val.length > 6) {
      val = `(${val.slice(0, 2)}) ${val.slice(2, 7)}-${val.slice(7)}`;
    } else if (val.length > 2) {
      val = `(${val.slice(0, 2)}) ${val.slice(2)}`;
    } else if (val.length > 0) {
      val = `(${val}`;
    }
    setPatientPhone(val);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!selectedDay || !selectedSlot) {
      toast.error("Por favor, selecione a data e o horário desejado.");
      return;
    }
    if (!patientName.trim() || !patientPhone.trim()) {
      toast.error("Por favor, preencha seu nome e telefone de contato.");
      return;
    }

    setIsSubmitting(true);
    const protocol = "AG-" + Math.floor(100000 + Math.random() * 900000);
    const serviceName =
      defaultService ||
      (attendanceType === "convenio"
        ? `Plano: ${healthPlan}`
        : "Consulta Odontológica (Particular)");

    try {
      const { error } = await supabase.from("appointments").insert({
        appointment_date: selectedDay.dateString,
        appointment_time: selectedSlot,
        patient_name: patientName.trim(),
        patient_phone: patientPhone.trim(),
        patient_email: patientEmail.trim() || "nao_informado@paciente.com",
        service_name: serviceName,
        notes: notes.trim() ? `[${protocol}] ${notes.trim()}` : `[${protocol}]`,
        status: "pending",
      });

      if (error) {
        throw error;
      }

      toast.success("Solicitação de agendamento realizada com sucesso!");

      const confirmed = {
        protocol,
        dateFormatted: selectedDay.fullFormatted,
        time: selectedSlot,
        name: patientName.trim(),
        phone: patientPhone.trim(),
      };

      setConfirmedBooking(confirmed);
    } catch (err: unknown) {
      console.error("Erro ao salvar agendamento:", err);
      toast.error("Ocorreu um erro ao salvar o agendamento. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleReset() {
    setConfirmedBooking(null);
    setSelectedSlot(null);
    setPatientName("");
    setPatientPhone("");
    setPatientEmail("");
    setNotes("");
    onOpenChange(false);
  }

  const waMessage = confirmedBooking
    ? encodeURIComponent(
        `Olá Drª Michelle, gostaria de confirmar minha solicitação de agendamento:\n\n` +
          `📌 Protocolo: ${confirmedBooking.protocol}\n` +
          `📅 Data/Hora: ${confirmedBooking.dateFormatted} às ${confirmedBooking.time}\n` +
          `👤 Paciente: ${confirmedBooking.name}\n` +
          `📞 Telefone: ${confirmedBooking.phone}\n` +
          `💳 Atendimento: ${attendanceType === "convenio" ? healthPlan : "Particular"}`,
      )
    : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl rounded-3xl p-0 overflow-hidden bg-background border border-border shadow-bloom">
        {/* Header */}
        <div className="bg-primary px-6 py-5 text-primary-foreground">
          <DialogTitle className="font-display text-2xl font-normal text-white">
            {confirmedBooking ? "Agendamento Solicitado!" : "Solicitação de Agendamento"}
          </DialogTitle>
          <DialogDescription className="text-primary-foreground/80 text-sm mt-1">
            {confirmedBooking
              ? "Sua solicitação foi registrada no consultório"
              : "Escolha o melhor dia e horário para a sua consulta"}
          </DialogDescription>
        </div>

        {/* Confirmation Screen */}
        {confirmedBooking ? (
          <div className="p-8 text-center space-y-6">
            <div className="mx-auto w-16 h-16 bg-success/15 text-success rounded-full flex items-center justify-center text-3xl">
              <CheckCircle2 className="w-10 h-10 text-emerald-600" />
            </div>

            <div>
              <h3 className="font-display text-2xl text-foreground font-medium">
                Sua solicitação foi registrada
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Guarde o seu código de protocolo:
              </p>
              <div className="inline-block bg-muted text-foreground font-mono font-bold text-lg px-4 py-2 rounded-xl mt-3 border border-border">
                {confirmedBooking.protocol}
              </div>
            </div>

            <div className="bg-accent/40 p-4 rounded-2xl border border-border text-sm text-foreground space-y-1">
              <p className="font-semibold text-primary">Consulta marcada para:</p>
              <p className="text-base font-medium">
                {confirmedBooking.dateFormatted} às {confirmedBooking.time}
              </p>
            </div>

            <Button
              onClick={() =>
                window.open(`https://wa.me/${CLINIC.whatsapp}?text=${waMessage}`, "_blank")
              }
              className="w-full bg-[#25D366] hover:bg-[#20ba5a] text-white rounded-full py-6 text-base font-bold shadow-md transition-silk gap-2"
            >
              <Send className="w-5 h-5" /> Enviar Confirmação pelo WhatsApp
            </Button>

            {selectedDay && (
              <Button
                variant="outline"
                onClick={() => {
                  const gUrl = buildGoogleCalendarUrl(
                    `Consulta Odontológica - Dra. Michelle Tiago (${confirmedBooking.name})`,
                    selectedDay.dateString,
                    confirmedBooking.time,
                    `Agendamento para ${confirmedBooking.name} (${confirmedBooking.phone}). Protocolo: ${confirmedBooking.protocol}`,
                  );
                  window.open(gUrl, "_blank");
                }}
                className="w-full rounded-full py-5 text-sm font-semibold gap-2 border-border"
              >
                <Calendar className="w-4 h-4 text-primary" /> Adicionar à minha Google Agenda
              </Button>
            )}

            <Button variant="outline" onClick={handleReset} className="rounded-full w-full">
              Concluir
            </Button>
          </div>
        ) : (
          /* Form Step */
          <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
            {/* Carousel Days */}
            <div>
              <Label className="text-xs font-bold uppercase tracking-wider text-primary-soft flex items-center gap-1.5 mb-2">
                <Calendar className="w-4 h-4" /> 1. Selecione o dia da consulta
              </Label>
              <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-none">
                {days.map((day) => {
                  const isActive = selectedDay?.dateString === day.dateString;
                  return (
                    <button
                      key={day.dateString}
                      type="button"
                      onClick={() => {
                        setSelectedDay(day);
                        setSelectedSlot(null);
                      }}
                      className={`flex-none w-20 py-3 px-2 rounded-2xl text-center border transition-silk ${
                        isActive
                          ? "bg-primary text-primary-foreground border-primary shadow-sm"
                          : "bg-card hover:bg-accent border-border text-foreground"
                      }`}
                    >
                      <div className="text-[11px] font-bold uppercase opacity-80">
                        {day.dayName}
                      </div>
                      <div className="text-xl font-extrabold my-0.5">{day.dayNumber}</div>
                      <div className="text-[11px] opacity-80">{day.monthName}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Time Slots */}
            <div>
              <Label className="text-xs font-bold uppercase tracking-wider text-primary-soft flex items-center gap-1.5 mb-2">
                <Clock className="w-4 h-4" /> 2. Escolha o horário vago (
                {selectedDay?.fullFormatted})
              </Label>
              <div className="grid grid-cols-4 gap-2.5">
                {availableTimeSlots.map((time) => {
                  const isBooked = bookedSlots.includes(time);
                  const isSelected = selectedSlot === time;
                  return (
                    <button
                      key={time}
                      type="button"
                      disabled={isBooked}
                      onClick={() => setSelectedSlot(time)}
                      className={`py-2.5 px-2 rounded-xl text-sm font-bold border text-center transition-silk ${
                        isBooked
                          ? "bg-muted text-muted-foreground border-border line-through opacity-50 cursor-not-allowed"
                          : isSelected
                            ? "bg-primary text-primary-foreground border-primary shadow-sm"
                            : "bg-card hover:bg-accent border-primary/40 text-primary"
                      }`}
                    >
                      {time}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Patient Form Fields */}
            <div className="space-y-4 pt-2 border-t border-border">
              <Label className="text-xs font-bold uppercase tracking-wider text-primary-soft flex items-center gap-1.5">
                <User className="w-4 h-4" /> 3. Dados do Paciente
              </Label>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="type" className="text-xs font-semibold">
                    Tipo de Atendimento
                  </Label>
                  <Select
                    value={attendanceType}
                    onValueChange={(v: "particular" | "convenio") => setAttendanceType(v)}
                  >
                    <SelectTrigger id="type" className="rounded-xl">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="particular">Particular</SelectItem>
                      <SelectItem value="convenio">Plano de Saúde (Convênio)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {attendanceType === "convenio" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="plan" className="text-xs font-semibold">
                      Convênio
                    </Label>
                    <Select value={healthPlan} onValueChange={setHealthPlan}>
                      <SelectTrigger id="plan" className="rounded-xl">
                        <SelectValue placeholder="Selecione o plano" />
                      </SelectTrigger>
                      <SelectContent>
                        {INSURANCE_PLANS.map((p) => (
                          <SelectItem key={p} value={p}>
                            {p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-xs font-semibold">
                  Nome Completo *
                </Label>
                <Input
                  id="name"
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  placeholder="Seu nome completo"
                  className="rounded-xl"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="phone" className="text-xs font-semibold">
                    Celular / WhatsApp *
                  </Label>
                  <Input
                    id="phone"
                    value={patientPhone}
                    onChange={handlePhoneChange}
                    placeholder="(00) 00000-0000"
                    className="rounded-xl"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs font-semibold">
                    E-mail (opcional)
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={patientEmail}
                    onChange={(e) => setPatientEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className="rounded-xl"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="notes" className="text-xs font-semibold">
                  Observações / Motivo da Consulta
                </Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex: Avaliação inicial, Clareamento, Alinhadores estéticos..."
                  className="rounded-xl resize-none"
                  rows={2}
                />
              </div>
            </div>

            <div className="pt-3 border-t border-border flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="rounded-full"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !selectedSlot}
                className="bg-primary hover:bg-primary-deep text-primary-foreground rounded-full px-6 shadow-md transition-silk gap-2"
              >
                {isSubmitting ? "Enviando..." : "Solicitar Agendamento"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
