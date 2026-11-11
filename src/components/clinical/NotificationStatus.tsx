import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  acknowledgeClinicalNotification,
  getClinicalNotificationState,
} from "@/lib/clinical-notification-admin";

const labels = {
  pending: "Pendente",
  processing: "Em processamento",
  accepted: "Aceito pelo provedor",
  failed: "Falhou",
  uncertain: "Resultado incerto",
  superseded: "Substituído",
};

export function NotificationStatus() {
  const client = useQueryClient();
  const key = ["clinical-notification-status"];
  const { data, isError } = useQuery({
    queryKey: key,
    queryFn: () => getClinicalNotificationState(),
    refetchInterval: 30000,
  });
  const review = useMutation({
    mutationFn: (id: string) => acknowledgeClinicalNotification({ data: { id } }),
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
    onError: () => toast.error("Não foi possível marcar o aviso como revisado."),
  });
  return (
    <details className="mb-4 rounded-2xl border border-border bg-card p-4 text-sm">
      <summary className="cursor-pointer font-semibold">
        Avisos por e-mail{" "}
        {data &&
          `· ${data.pending_count} pendentes · ${data.failed_count} falhas · ${data.uncertain_count} incertos`}
      </summary>
      {isError && <p className="mt-3">Não foi possível consultar os avisos.</p>}
      {data && (
        <>
          <p className="my-3 text-muted-foreground">
            {data.last_cycle_completed_at
              ? `Último ciclo: ${new Date(data.last_cycle_completed_at).toLocaleString("pt-BR", { timeZone: "America/Belem" })}`
              : "Aguardando o primeiro ciclo de monitoramento."}
          </p>
          {data.recent_events.length === 0 && <p>Nenhum aviso recente.</p>}
          <ul className="space-y-2">
            {data.recent_events.map((event) => (
              <li
                key={event.id}
                className="flex flex-wrap items-center gap-2 border-t border-border py-2"
              >
                <span>{event.kind === "confirmed" ? "Confirmação" : "Cancelamento"}</span>
                <time dateTime={event.created_at}>
                  {new Date(event.created_at).toLocaleString("pt-BR", {
                    timeZone: "America/Belem",
                  })}
                </time>
                <span>
                  {labels[event.status]} · {event.attempt_count} tentativa(s)
                </span>
                {event.reviewed_at && <span>Revisado</span>}
                {!event.reviewed_at &&
                  event.next_attempt_at === null &&
                  ["failed", "uncertain"].includes(event.status) && (
                    <button
                      type="button"
                      className="underline"
                      disabled={review.isPending}
                      onClick={() => review.mutate(event.id)}
                    >
                      Marcar como revisado
                    </button>
                  )}
              </li>
            ))}
          </ul>
        </>
      )}
    </details>
  );
}
