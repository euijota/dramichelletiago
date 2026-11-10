import React, { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { PatientAnamnesisForm } from "@/components/clinical/PatientAnamnesisForm";
import { getAnamnesisInfoByToken, getAnamnesisInfoByProtocol } from "@/lib/anamnesis-server";
import { CLINIC } from "@/lib/clinic";
import {
  ClipboardList,
  CalendarCheck,
  CheckCircle2,
  MapPin,
  Phone,
  ShieldCheck,
  Loader2,
  Lock,
  KeyRound,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/anamnese")({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      token: typeof search.token === "string" ? search.token : undefined,
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
  const { token, protocolo, paciente } = Route.useSearch();
  const [isLoading, setIsLoading] = useState(!!(token || protocolo));
  const [verifiedToken, setVerifiedToken] = useState<string | null>(token || null);
  const [phoneDigitsInput, setPhoneDigitsInput] = useState("");
  const [isVerifyingPhone, setIsVerifyingPhone] = useState(false);
  const [requiresPhoneVerification, setRequiresPhoneVerification] = useState(false);
  const [phoneHint, setPhoneHint] = useState<string | undefined>(undefined);

  const [appointmentData, setAppointmentData] = useState<{
    id?: string | null;
    patientId?: string | null;
    patientName?: string | null;
    patientPhone?: string | null;
    patientEmail?: string | null;
    serviceName?: string | null;
    date?: string | null;
    time?: string | null;
    alreadySubmitted?: boolean;
    isVerified?: boolean;
  } | null>(null);

  // 1. Carrega dados via Token Criptográfico ou Protocolo
  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      if (token) {
        try {
          const res = await getAnamnesisInfoByToken({ data: token });
          if (!isMounted) return;
          if (res.found && res.appointment) {
            setVerifiedToken(token);
            setAppointmentData({
              ...res.appointment,
              alreadySubmitted: res.alreadySubmitted,
              isVerified: true,
            });
            setRequiresPhoneVerification(false);
          }
        } catch (err) {
          console.warn("[AnamnesePage] Erro ao validar token:", err);
        } finally {
          if (isMounted) setIsLoading(false);
        }
        return;
      }

      if (protocolo) {
        try {
          const res = await getAnamnesisInfoByProtocol({
            data: { protocol: protocolo },
          });
          if (!isMounted) return;
          if (res.found && res.appointment) {
            setAppointmentData({
              ...res.appointment,
              isVerified: res.isVerified,
            });
            if (res.requiresPhoneVerification) {
              setRequiresPhoneVerification(true);
              setPhoneHint(res.phoneHint);
            }
          }
        } catch (err) {
          console.warn("[AnamnesePage] Erro ao buscar agendamento por protocolo:", err);
        } finally {
          if (isMounted) setIsLoading(false);
        }
        return;
      }

      setIsLoading(false);
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [token, protocolo]);

  // Desbloqueia dados com os 4 últimos dígitos do telefone quando acessado somente por protocolo
  const handleUnlockWithPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!protocolo || phoneDigitsInput.trim().length !== 4) {
      toast.error("Digite os 4 últimos dígitos do seu telefone para desbloquear.");
      return;
    }

    setIsVerifyingPhone(true);
    try {
      const res = await getAnamnesisInfoByProtocol({
        data: {
          protocol: protocolo,
          phoneDigits4: phoneDigitsInput.trim(),
        },
      });

      if (res.found && res.isVerified && res.appointment) {
        setVerifiedToken(res.token || null);
        setAppointmentData({
          ...res.appointment,
          isVerified: true,
        });
        setRequiresPhoneVerification(false);
        toast.success("Identidade confirmada! Seus dados foram carregados.");
      } else {
        toast.error("Os dígitos informados não coincidem com o telefone do agendamento.");
      }
    } catch {
      toast.error("Erro ao verificar dados. Tente novamente.");
    } finally {
      setIsVerifyingPhone(false);
    }
  };

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
            Por favor, responda com atenção. Suas respostas são confidenciais e preparam a Dra.
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

        {/* Loading State */}
        {isLoading ? (
          <div className="rounded-3xl border border-border bg-card p-12 text-center space-y-3 shadow-petal">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
            <p className="text-xs text-muted-foreground">
              Carregando informações do agendamento com segurança...
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Challenge de Verificação de Privacidade de Telefone (Anti-PII Leak) */}
            {requiresPhoneVerification && appointmentData && (
              <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0">
                    <Lock className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-display text-base font-bold text-foreground">
                      Confirmação de Segurança
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Identificamos o agendamento{" "}
                      <strong className="text-foreground">{protocolo}</strong> para{" "}
                      <strong className="text-foreground">{appointmentData.patientName}</strong>.
                      Para proteger seus dados pessoais, informe os 4 últimos dígitos do seu
                      telefone para desbloquear a ficha completa.
                    </p>
                  </div>
                </div>

                <form
                  onSubmit={handleUnlockWithPhone}
                  className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1"
                >
                  <div className="relative flex-1 sm:max-w-xs">
                    <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                      type="text"
                      maxLength={4}
                      inputMode="numeric"
                      value={phoneDigitsInput}
                      onChange={(e) => setPhoneDigitsInput(e.target.value.replace(/\D/g, ""))}
                      placeholder={phoneHint ? `4 dígitos (${phoneHint})` : "Ex: 7223"}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-background text-sm font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isVerifyingPhone || phoneDigitsInput.length !== 4}
                    className="min-h-11 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-xs flex items-center justify-center gap-2 hover:bg-primary-deep transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isVerifyingPhone ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <span>Desbloquear</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </>
                    )}
                  </button>
                </form>
              </div>
            )}

            {/* Card de Agendamento Verificado */}
            {appointmentData?.isVerified && appointmentData.patientName && (
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <CalendarCheck className="h-4 w-4 text-emerald-600" />
                    <span className="font-bold text-foreground">
                      Agendamento Verificado: {appointmentData.patientName}
                    </span>
                  </div>
                  <p className="text-muted-foreground">
                    Protocolo:{" "}
                    <strong className="text-foreground">{protocolo || "Confirmado"}</strong> ·
                    Serviço: {appointmentData.serviceName || "Consulta Odontológica"}
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
                    <CheckCircle2 className="h-3.5 w-3.5" /> Ficha já preenchida
                  </span>
                )}
              </div>
            )}

            {/* Formulário Principal de Anamnese */}
            <div className="rounded-3xl border border-border bg-card p-6 sm:p-8 shadow-petal">
              <PatientAnamnesisForm
                token={verifiedToken}
                patientId={appointmentData?.patientId || paciente || null}
                appointmentId={appointmentData?.id || null}
                protocol={protocolo || null}
                patientName={appointmentData?.isVerified ? appointmentData.patientName : null}
                patientPhone={appointmentData?.isVerified ? appointmentData.patientPhone : null}
                patientEmail={appointmentData?.isVerified ? appointmentData.patientEmail : null}
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
