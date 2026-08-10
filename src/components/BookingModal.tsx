import React, { useState, useEffect, useRef } from "react";
import { getOccupiedSlots } from "@/lib/ical-server";
import { saveAppointmentAndNotify } from "@/lib/notify-server";
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
  Send,
  User,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  CalendarCheck,
  AlertCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  CLINIC,
  INSURANCE_PLANS,
  buildTimeSlots,
  buildGoogleCalendarUrl,
} from "@/lib/clinic";
import { Logo } from "@/components/Logo";
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
  fullMonthName: string;
  monthYear: string;
  fullFormatted: string;
  weekday: number;
}

export function BookingModal({ open, onOpenChange, defaultService }: BookingModalProps) {
  const [bookingMode, setBookingMode] = useState<"interactive" | "iframe">("interactive");
  const [days, setDays] = useState<DayItem[]>([]);
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [selectedDay, setSelectedDay] = useState<DayItem | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);

  const carouselRef = useRef<HTMLDivElement>(null);

  // Form State
  const [patientName, setPatientName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [patientEmail, setPatientEmail] = useState("");
  const [attendanceType, setAttendanceType] = useState<"particular" | "convenio">("particular");
  const [healthPlan, setHealthPlan] = useState<string>(INSURANCE_PLANS[0]);
  const [notes, setNotes] = useState("");
  const [lgpdConsent, setLgpdConsent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState<{
    protocol: string;
    dateFormatted: string;
    time: string;
    name: string;
    phone: string;
  } | null>(null);

  // Generates 60 available days (skipping Sundays)
  useEffect(() => {
    const nextDays: DayItem[] = [];
    const monthsSet = new Set<string>();
    const today = new Date();
    const curr = new Date(today);

    const dayNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
    const monthNamesShort = [
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
    const monthNamesFull = [
      "Janeiro",
      "Fevereiro",
      "Março",
      "Abril",
      "Maio",
      "Junho",
      "Julho",
      "Agosto",
      "Setembro",
      "Outubro",
      "Novembro",
      "Dezembro",
    ];

    while (nextDays.length < 60) {
      const weekday = curr.getDay();
      if (weekday !== 0) {
        // Skip Sunday
        const year = curr.getFullYear();
        const monthNum = curr.getMonth();
        const monthStr = String(monthNum + 1).padStart(2, "0");
        const dateNum = String(curr.getDate()).padStart(2, "0");
        const dateString = `${year}-${monthStr}-${dateNum}`;
        const monthYear = `${monthNamesFull[monthNum]} ${year}`;

        monthsSet.add(monthYear);

        nextDays.push({
          dateString,
          dayName: dayNames[weekday],
          dayNumber: dateNum,
          monthName: monthNamesShort[monthNum],
          fullMonthName: monthNamesFull[monthNum],
          monthYear,
          fullFormatted: `${dayNames[weekday]}, ${dateNum} de ${monthNamesFull[monthNum]}`,
          weekday,
        });
      }
      curr.setDate(curr.getDate() + 1);
    }

    const monthsArr = Array.from(monthsSet);
    setDays(nextDays);
    setAvailableMonths(monthsArr);

    if (monthsArr.length > 0) {
      setSelectedMonth(monthsArr[0]);
    }
    if (nextDays.length > 0) {
      setSelectedDay(nextDays[0]);
    }
  }, []);

  const filteredDays = days.filter((d) => d.monthYear === selectedMonth);

  // Fetch booked slots from Supabase + iCal, auto-select first available time slot
  // Cache of occupied events by date: { "2026-08-10": ["15:00", "16:00", "17:00"] }
  const [occupiedMap, setOccupiedMap] = useState<Record<string, string[]>>({});
  const [isFeedLoaded, setIsFeedLoaded] = useState(false);

  // 1. Fetch iCal Feed & Supabase appointments ONCE when modal opens
  useEffect(() => {
    if (!open) return;

    let isMounted = true;
    setIsLoadingSlots(true);

    async function loadAllOccupied() {
      try {
        const map: Record<string, string[]> = {};

        // 1. Fetch Supabase
        const { data: supaData } = await supabase
          .from("appointments")
          .select("appointment_date, appointment_time")
          .neq("status", "cancelled");

        if (supaData) {
          supaData.forEach((item) => {
            const d = item.appointment_date;
            const t = item.appointment_time.slice(0, 5);
            if (!map[d]) map[d] = [];
            map[d].push(t);
          });
        }

        // 2. Fetch iCal Feed
        try {
          const slots = await getOccupiedSlots();
          slots.forEach((evt) => {
            if (!map[evt.date]) map[evt.date] = [];
            map[evt.date].push(evt.time.slice(0, 5));
          });
        } catch (e) {
          console.error("iCal feed fetch failed:", e);
        }

        if (!isMounted) return;

        // Deduplicate slots per date
        const cleanMap: Record<string, string[]> = {};
        Object.keys(map).forEach((dateKey) => {
          cleanMap[dateKey] = Array.from(new Set(map[dateKey]));
        });

        setOccupiedMap(cleanMap);
        setIsFeedLoaded(true);

        // Auto-find the absolute FIRST day & slot available in the entire calendar
        const now = new Date();
        const year = now.getFullYear();
        const monthStr = String(now.getMonth() + 1).padStart(2, "0");
        const dateNum = String(now.getDate()).padStart(2, "0");
        const todayIso = `${year}-${monthStr}-${dateNum}`;

        let firstAvailableDay: DayItem | null = null;
        let firstAvailableSlot: string | null = null;

        for (const day of days) {
          const occupiedForDay = cleanMap[day.dateString] || [];
          const allSlots = buildTimeSlots(day.weekday);
          const isToday = day.dateString === todayIso;

          const avail = allSlots.filter((slot) => {
            if (occupiedForDay.includes(slot)) return false;
            if (isToday) {
              const slotHour = parseInt(slot.split(":")[0], 10);
              if (slotHour <= now.getHours()) return false;
            }
            return true;
          });

          if (avail.length > 0) {
            firstAvailableDay = day;
            firstAvailableSlot = avail[0];
            break;
          }
        }

        if (firstAvailableDay) {
          setSelectedMonth(firstAvailableDay.monthYear);
          setSelectedDay(firstAvailableDay);
          setSelectedSlot(firstAvailableSlot);
        }
      } catch (err) {
        console.error("Erro ao carregar agenda:", err);
      } finally {
        if (isMounted) setIsLoadingSlots(false);
      }
    }

    loadAllOccupied();

    return () => {
      isMounted = false;
    };
  }, [open, days]);

  // 2. When feed loads or selectedDay changes, calculate available slots INSTANTLY
  useEffect(() => {
    if (!selectedDay || !isFeedLoaded) return;

    const dateKey = selectedDay.dateString;
    const occupiedForDay = occupiedMap[dateKey] || [];
    setBookedSlots(occupiedForDay);

    const allSlots = buildTimeSlots(selectedDay.weekday);
    const now = new Date();
    const year = now.getFullYear();
    const monthStr = String(now.getMonth() + 1).padStart(2, "0");
    const dateNum = String(now.getDate()).padStart(2, "0");
    const todayIso = `${year}-${monthStr}-${dateNum}`;
    const isToday = selectedDay.dateString === todayIso;

    const availableSlots = allSlots.filter((slot) => {
      if (occupiedForDay.includes(slot)) return false;
      if (isToday) {
        const slotHour = parseInt(slot.split(":")[0], 10);
        if (slotHour <= now.getHours()) return false;
      }
      return true;
    });

    if (availableSlots.length > 0) {
      setSelectedSlot(availableSlots[0]);
    } else {
      setSelectedSlot(null);
    }
  }, [selectedDay, isFeedLoaded, occupiedMap]);

  const availableTimeSlots = selectedDay ? buildTimeSlots(selectedDay.weekday) : [];

  function scrollCarousel(direction: "left" | "right") {
    if (carouselRef.current) {
      const scrollAmount = direction === "left" ? -240 : 240;
      carouselRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
    }
  }

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
    if (!lgpdConsent) {
      toast.error("Você precisa aceitar a Política de Privacidade para continuar.");
      return;
    }

    setIsSubmitting(true);
    // Use crypto.randomUUID for unique protocol
    const protocol = "AG-" + crypto.randomUUID().slice(0, 8).toUpperCase();
    const serviceName =
      defaultService ||
      (attendanceType === "convenio"
        ? `Plano: ${healthPlan}`
        : "Consulta Odontológica (Particular)");

    const formattedTime = selectedSlot.length === 5 ? `${selectedSlot}:00` : selectedSlot;
    const notesText = notes.trim() ? `[${protocol}] ${notes.trim()}` : `[${protocol}]`;

    try {
      // Server function: tenta salvar no banco e envia e-mail de notificação
      const result = await saveAppointmentAndNotify({
        data: {
          protocol,
          appointmentDate: selectedDay.dateString,
          appointmentTime: formattedTime,
          patientName: patientName.trim(),
          patientPhone: patientPhone.trim(),
          patientEmail: patientEmail.trim() || "",
          serviceName,
          notes: notesText,
        },
      });

      if (!result.success) {
        throw new Error("Falha ao processar agendamento");
      }

      const confirmed = {
        protocol,
        dateFormatted: selectedDay.fullFormatted,
        time: selectedSlot,
        name: patientName.trim(),
        phone: patientPhone.trim(),
      };
      setConfirmedBooking(confirmed);
      toast.success("Solicitação de agendamento realizada com sucesso!");
      setIsSubmitting(false);

      // Notificação imediata: abre WhatsApp da Dra. Michelle com os dados do agendamento
      const dentistMsg = encodeURIComponent(
        `🦷 *NOVO AGENDAMENTO RECEBIDO*\n\n` +
        `📌 Protocolo: ${protocol}\n` +
        `👤 Paciente: ${patientName.trim()}\n` +
        `📞 Telefone: ${patientPhone.trim()}\n` +
        `📅 Data: ${selectedDay.fullFormatted} às ${selectedSlot}\n` +
        `💼 Serviço: ${serviceName}\n` +
        `📝 Obs: ${notes.trim() || "Nenhuma"}`
      );
      window.open(`https://wa.me/${CLINIC.whatsapp}?text=${dentistMsg}`, "_blank");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      console.error("Booking error:", msg);
      toast.error(msg.includes("horário") ? msg : "Erro ao agendar. Tente novamente ou use o WhatsApp.");
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
    setLgpdConsent(false);
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
      <DialogContent className="max-w-2xl rounded-3xl p-0 overflow-hidden bg-background border border-[#90464f]/20 shadow-2xl">
        {/* Exact Header Banner with Official Burgundy Background */}
        <div className="bg-[#90464f] py-6 px-6 text-center border-b border-white/10 flex flex-col items-center justify-center">
          <Logo onWine className="h-11 w-auto max-w-[320px]" />
          <DialogTitle className="sr-only">Agendamento Dra Michelle Barbosa Tiago</DialogTitle>
          <DialogDescription className="text-white/80 text-xs mt-2 font-medium tracking-wide">
            Consultório Odontológico · CRO-AP 596 · Macapá
          </DialogDescription>
        </div>

        {/* Info Strip */}
        <div className="bg-[#FAF5F5] px-6 py-3 border-b border-[#90464f]/10 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="flex items-center justify-center gap-1.5 text-foreground/80 font-medium">
            <CalendarCheck className="w-3.5 h-3.5 text-[#90464f]" /> Hora Marcada
          </div>
          <div className="flex items-center justify-center gap-1.5 text-foreground/80 font-medium border-x border-[#90464f]/10">
            <Clock className="w-3.5 h-3.5 text-[#90464f]" /> Seg a Sex
          </div>
          <div className="flex items-center justify-center gap-1.5 text-foreground/80 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-[#90464f]" /> Confirmado
          </div>
        </div>

        {/* Confirmation Screen */}
        {confirmedBooking ? (
          <div className="p-8 text-center space-y-6">
            <div className="mx-auto w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-3xl">
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
              <p className="font-semibold text-[#90464f]">Consulta marcada para:</p>
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
                <CalendarIcon className="w-4 h-4 text-[#90464f]" /> Adicionar à minha Google Agenda
              </Button>
            )}

            <Button variant="outline" onClick={handleReset} className="rounded-full w-full">
              Concluir
            </Button>
          </div>
        ) : (
          /* Main Step: Interactive Calendar */
          <div className="p-6 space-y-5 max-h-[78vh] overflow-y-auto">
            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Month Tabs & Day Carousel */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold uppercase tracking-wider text-[#90464f] flex items-center gap-1.5">
                      <CalendarIcon className="w-4 h-4" /> 1. Selecione a data da consulta
                    </Label>
                    <div className="flex gap-1.5 bg-muted/60 p-1 rounded-xl border border-border">
                      {availableMonths.map((month) => {
                        const isSelected = selectedMonth === month;
                        return (
                          <button
                            key={month}
                            type="button"
                            onClick={() => {
                              setSelectedMonth(month);
                              const firstDayOfMonth = days.find((d) => d.monthYear === month);
                              if (firstDayOfMonth) {
                                setSelectedDay(firstDayOfMonth);
                              }
                            }}
                            className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                              isSelected
                                ? "bg-[#90464f] text-white shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {month}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="relative group">
                    <button
                      type="button"
                      onClick={() => scrollCarousel("left")}
                      className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-background/90 border border-border shadow-sm flex items-center justify-center text-foreground hover:bg-accent transition-all"
                      aria-label="Anterior"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>

                    <div
                      ref={carouselRef}
                      className="flex gap-2.5 overflow-x-auto px-6 py-1 scrollbar-none scroll-smooth"
                    >
                      {filteredDays.map((day) => {
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
                                ? "bg-[#90464f] text-white border-[#90464f] shadow-sm scale-105"
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

                    <button
                      type="button"
                      onClick={() => scrollCarousel("right")}
                      className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-background/90 border border-border shadow-sm flex items-center justify-center text-foreground hover:bg-accent transition-all"
                      aria-label="Próximo"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Time Slots */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-[#90464f] flex items-center gap-1.5">
                      <Clock className="w-4 h-4" /> 2. Próximo horário disponível para atendimento ({selectedDay?.fullFormatted})
                    </Label>
                    {selectedSlot && (
                      <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-0.5 rounded-full flex items-center gap-1 border border-emerald-200 dark:border-emerald-800">
                        <Sparkles className="w-3 h-3" /> Selecionado automaticamente
                      </span>
                    )}
                  </div>

                  {isLoadingSlots ? (
                    <div className="py-6 text-center text-xs text-muted-foreground animate-pulse">
                      Verificando disponibilidade de horários...
                    </div>
                  ) : availableTimeSlots.length === 0 ? (
                    <div className="py-4 text-center text-xs text-muted-foreground">
                      Nenhum horário disponível para este dia.
                    </div>
                  ) : (
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
                                ? "bg-muted text-muted-foreground border-border line-through opacity-40 cursor-not-allowed"
                                : isSelected
                                  ? "bg-[#90464f] text-white border-[#90464f] shadow-md ring-2 ring-[#90464f]/30 scale-[1.02]"
                                  : "bg-card hover:bg-accent border-[#90464f]/40 text-[#90464f]"
                            }`}
                          >
                            {time}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Patient Form Fields */}
                <div className="space-y-4 pt-2 border-t border-border">
                  <Label className="text-xs font-bold uppercase tracking-wider text-[#90464f] flex items-center gap-1.5">
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

                  {/* LGPD Consent */}
                  <div className="space-y-1.5">
                    <div className="flex items-start gap-2.5">
                      <input
                        type="checkbox"
                        id="lgpdConsent"
                        checked={lgpdConsent}
                        onChange={(e) => setLgpdConsent(e.target.checked)}
                        required
                        className="mt-1 h-4 w-4 rounded border-[#90464f] text-[#90464f] focus:ring-[#90464f] focus:ring-2"
                      />
                      <Label htmlFor="lgpdConsent" className="text-xs text-foreground/80 leading-relaxed cursor-pointer">
                        Concordo com o tratamento dos meus dados pessoais (nome, telefone, e-mail) para fins de agendamento,
                        envio de lembretes e comunicação via WhatsApp/e-mail, conforme a
                        <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="underline hover:text-[#90464f]">
                          Política de Privacidade
                        </a>
                        .*
                      </Label>
                    </div>
                    <p className="text-[10px] text-muted-foreground/60">
                      * Obrigatório. Seus dados não serão compartilhados com terceiros além dos necessários para o agendamento.
                    </p>
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
                    className="bg-[#90464f] hover:bg-[#77373f] text-white rounded-full px-6 shadow-md transition-silk gap-2"
                  >
                    {isSubmitting ? "Enviando..." : "Solicitar Agendamento"}
                  </Button>
                </div>
              </form>
          </div>
        )}

        {/* WhatsApp Assistance Bar */}
        <div className="bg-gradient-to-r from-background to-[#FAF5F5] px-6 py-4 border-t border-[#90464f]/10 flex flex-wrap items-center justify-between gap-3">
          <div className="text-left">
            <p className="font-semibold text-foreground text-xs">
              Dúvidas ou prefere agendar por mensagem?
            </p>
            <span className="text-[11px] text-muted-foreground">
              Fale diretamente com nossa equipe no WhatsApp
            </span>
          </div>
          <a
            href={`https://wa.me/${CLINIC.whatsapp}?text=${encodeURIComponent(
              "Olá, gostaria de agendar uma consulta com a Dra Michelle",
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-[#25D366] hover:bg-[#22c35e] text-white px-4 py-2 rounded-full text-xs font-bold shadow-sm transition-all"
          >
            <Send className="w-3.5 h-3.5" /> Agendar via WhatsApp
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
