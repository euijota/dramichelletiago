import React, { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { PatientAnamnesisForm } from "@/components/clinical/PatientAnamnesisForm";
import { getAnamnesisInfoByProtocol } from "@/lib/anamnesis-server";
import { CLINIC } from "@/lib/clinic";
import {
  ClipboardList,
  Sparkles,
  CalendarCheck,
  CheckCircle2,
  Clock,
  MapPin,
  Phone,
  ShieldCheck,
  Loader2,
} from "lucide-react";

export const Route = createFileRoute("/anamnese")({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      protocolo: typeof search.protocolo === "string" ? search.protocolo : undefined,
      paciente: typeof search.paciente === "string" ? search.paciente : undefined,
    };
  },
  head: () => ({
    meta: [
      { title: "Ficha de Pré-Atendimento Online — Dra. Michelle Barbosa Tiago" },
      {
        name: "description",
        content:
          "Preencha sua ficha de saúde e anamnese odontológica prévia com a Dra. Michelle Barbosa Tiago em Macapá, AP.",
      },
      { property: "og:title", content: "Ficha de Pré-Atendimento — Dra. Michelle Tiago" },
      {
        property: "og:description",
        content: "Questionário de saúde e histórico para seu atendimento odontológico seguro.",
      },
      {
        property: "og:image",
        content: "https://dramichelletiago.com.br/assets/dra-michelle.jpg",
      },
    ],
    links: [{ rel: "canonical", href: "https://dramichelletiago.com.br/anamnese" }],
  }),
  component: AnamnesePage,
});

function AnamnesePage() {
  const { protocolo, paciente } = Route.useSearch();
  const [isLoading, setIsLoading] = useState(!!protocolo);
  const [appointmentData, setAppointmentData] = useState<{
    id?: string;
    patientId?: string | null;
    patientName?: string | null;
    patientPhone?: string | null;
    patientEmail?: string | null;
    serviceName?: string | null;
    date?: string | null;
    time?: string | null;
    alreadySubmitted?: boolean;
  } | null>(null);

  useEffect(() => {
    if (!protocolo) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    getAnamnesisInfoByProtocol({ data: protocolo })
      .then((res) => {
        if (!isMounted) return;
        if (res.found && res.appointment) {
          setAppointmentData({
            ...res.appointment,
            alreadySubmitted: res.alreadySubmitted,
          });
        }
      })
      .catch((err) => {
        console.warn("[AnamnesePage] Erro ao buscar agendamento por protocolo:", err);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [protocolo]);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main className="mx-auto max-w-4xl px-4 py-10 sm:py-16">
        {/* Topo / Cabeçalho */}
        <div className="text-center space-y-3 mb-8">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3.5 py-1 text-xs font-semibold uppercase tracking-widest text-primary">
            <ClipboardList className="h-3.5 w-3.5" />
            Ficha de Pré-Atendimento Online
          </span>
          <h1 className="font-display text-3xl sm:text-4xl text-foreground font-normal">
            Histórico de Saúde do <span className="font-script text-primary">Paciente</span>
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm max-w-xl mx-auto">
            Por favor, responda com atenção. Suas informações são confidenciais e preparam a Dra.
            Michelle para oferecer um atendimento personalizado e sem riscos.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 pt-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 text-primary" /> Macapá - AP
            </span>
            <span className="flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Sigilo Médico e LGPD
            </span>
            <span className="flex items-center gap-1">
              <Phone className="h-3.5 w-3.5 text-primary" /> {CLINIC.phone}
            </span>
          </div>
        </div>

        {/* Card do Agendamento Identificado */}
        {isLoading ? (
          <div className="rounded-3xl border border-border bg-card p-12 text-center space-y-3 shadow-petal">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
            <p className="text-xs text-muted-foreground">
              Carregando informações do agendamento...
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {protocolo && appointmentData?.patientName && (
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <CalendarCheck className="h-4 w-4 text-emerald-600" />
                    <span className="font-bold text-foreground">
                      Agendamento identificado: {appointmentData.patientName}
                    </span>
                  </div>
                  <p className="text-muted-foreground">
                    Protocolo: <strong className="text-foreground">{protocolo}</strong> · Serviço:{" "}
                    {appointmentData.serviceName || "Consulta Odontológica"}
                  </p>
                  {appointmentData.date && (
                    <p className="text-muted-foreground">
                      Data da consulta: {appointmentData.date.split("-").reverse().join("/")} às{" "}
                      {appointmentData.time?.slice(0, 5)}
                    </p>
                  )}
                </div>
                {appointmentData.alreadySubmitted && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Ficha já preenchida anteriormente
                  </span>
                )}
              </div>
            )}

            {/* Formulário Principal de Anamnese */}
            <div className="rounded-3xl border border-border bg-card p-6 sm:p-8 shadow-petal">
              <PatientAnamnesisForm
                patientId={appointmentData?.patientId || paciente || null}
                appointmentId={appointmentData?.id || null}
                protocol={protocolo || null}
                patientName={appointmentData?.patientName || null}
                patientPhone={appointmentData?.patientPhone || null}
                patientEmail={appointmentData?.patientEmail || null}
                defaultReason={appointmentData?.serviceName || null}
                inline={true}
              />
            </div>
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
