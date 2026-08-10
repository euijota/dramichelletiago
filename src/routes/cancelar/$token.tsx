import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getAppointmentByToken, cancelAppointmentByToken } from "@/lib/cancellation";
import { formatLongDate } from "@/lib/clinic";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  AlertCircle,
  CheckCircle2,
  Calendar,
  Clock,
  User,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/cancelar/$token")({
  head: () => ({
    meta: [
      {
        title: "Cancelar Agendamento - Dra. Michelle Barbosa Tiago",
      },
      {
        name: "description",
        content: "Cancelar agendamento de consulta odontológica",
      },
      {
        name: "robots",
        content: "noindex, nofollow",
      },
    ],
  }),
  component: CancelAppointment,
});

function CancelAppointment() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const [reason, setReason] = useState("");
  const [showConfirmation, setShowConfirmation] = useState(false);

  const { data: appointment, isLoading, error } = useQuery({
    queryKey: ["appointment", token],
    queryFn: () => getAppointmentByToken({ data: token }),
  });

  const cancelMutation = useMutation({
    mutationFn: (reason: string) =>
      cancelAppointmentByToken({ data: { token, reason } }),
    onSuccess: () => {
      toast.success("Agendamento cancelado com sucesso!");
      setShowConfirmation(true);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro ao cancelar agendamento");
    },
  });

  const handleCancel = () => {
    if (!reason.trim()) {
      toast.error("Por favor, informe o motivo do cancelamento");
      return;
    }
    cancelMutation.mutate(reason);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="container mx-auto px-6 py-20 text-center">
          <div className="animate-pulse">
            <div className="mx-auto h-12 w-12 rounded-full bg-muted" />
            <p className="mt-4 text-muted-foreground">Carregando agendamento...</p>
          </div>
        </div>
        <SiteFooter />
      </div>
    );
  }

  if (error || !appointment) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="container mx-auto max-w-2xl px-6 py-20">
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-8 text-center">
            <XCircle className="mx-auto h-16 w-16 text-rose-600" />
            <h1 className="mt-6 font-display text-2xl text-foreground">
              Agendamento não encontrado
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              O link de cancelamento pode estar inválido, expirado ou o agendamento já foi
              cancelado anteriormente.
            </p>
            <Button
              onClick={() => navigate({ to: "/" })}
              className="mt-6 rounded-full bg-primary px-8 py-3"
            >
              Voltar para o site
            </Button>
          </div>
        </div>
        <SiteFooter />
      </div>
    );
  }

  if (appointment.status === "cancelled") {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="container mx-auto max-w-2xl px-6 py-20">
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-8 text-center">
            <AlertCircle className="mx-auto h-16 w-16 text-amber-600" />
            <h1 className="mt-6 font-display text-2xl text-foreground">
              Agendamento já cancelado
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Este agendamento foi cancelado anteriormente e não pode ser cancelado novamente.
            </p>
            <Button
              onClick={() => navigate({ to: "/" })}
              className="mt-6 rounded-full bg-primary px-8 py-3"
            >
              Voltar para o site
            </Button>
          </div>
        </div>
        <SiteFooter />
      </div>
    );
  }

  if (showConfirmation) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="container mx-auto max-w-2xl px-6 py-20">
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-8 text-center">
            <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-600" />
            <h1 className="mt-6 font-display text-2xl text-foreground">
              Cancelamento confirmado
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Seu agendamento foi cancelado com sucesso. A Dra. Michelle foi notificada.
            </p>
            <div className="mt-6 rounded-2xl bg-background p-4 text-left">
              <div className="flex items-start gap-3 text-sm">
                <User className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="font-semibold text-foreground">{appointment.patient_name}</p>
                </div>
              </div>
              <div className="mt-3 flex items-start gap-3 text-sm">
                <Calendar className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-muted-foreground">
                    {formatLongDate(appointment.appointment_date)}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex items-start gap-3 text-sm">
                <Clock className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-muted-foreground">{appointment.appointment_time}</p>
                </div>
              </div>
            </div>
            <Button
              onClick={() => navigate({ to: "/" })}
              className="mt-6 rounded-full bg-primary px-8 py-3"
            >
              Agendar nova consulta
            </Button>
          </div>
        </div>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="container mx-auto max-w-2xl px-6 py-20">
        <div className="rounded-3xl border border-border bg-card p-8">
          <div className="text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-amber-600" />
            <h1 className="mt-6 font-display text-3xl text-foreground">
              Cancelar agendamento
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Confirme os dados e informe o motivo do cancelamento
            </p>
          </div>

          <div className="mt-8 space-y-4 rounded-2xl bg-muted/50 p-6">
            <div className="flex items-start gap-3">
              <User className="mt-0.5 h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Paciente
                </p>
                <p className="mt-1 font-semibold text-foreground">{appointment.patient_name}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Calendar className="mt-0.5 h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Data
                </p>
                <p className="mt-1 text-foreground">
                  {formatLongDate(appointment.appointment_date)}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Clock className="mt-0.5 h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Horário
                </p>
                <p className="mt-1 text-foreground">{appointment.appointment_time}</p>
              </div>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <Label htmlFor="reason" className="text-sm font-semibold">
              Motivo do cancelamento *
            </Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Imprevisto pessoal, reagendar para outra data..."
              className="min-h-[100px] rounded-xl"
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground">
              {reason.length}/500 caracteres
            </p>
          </div>

          <div className="mt-8 flex gap-3">
            <Button
              variant="outline"
              onClick={() => navigate({ to: "/" })}
              className="flex-1 rounded-full"
            >
              Voltar
            </Button>
            <Button
              onClick={handleCancel}
              disabled={cancelMutation.isPending || !reason.trim()}
              className="flex-1 rounded-full bg-rose-600 text-white hover:bg-rose-700"
            >
              {cancelMutation.isPending ? "Cancelando..." : "Confirmar Cancelamento"}
            </Button>
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Ao confirmar, a Dra. Michelle será notificada automaticamente sobre o cancelamento.
          </p>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
