import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bell, CalendarPlus, CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatShortDate } from "@/lib/clinic";
import { cn } from "@/lib/utils";

/** Campos mínimos para abrir a ficha da consulta no painel. */
export type NotificationAppointment = {
  id: string;
  patient_id: string | null;
  patient_name: string;
  patient_email: string | null;
  patient_phone: string;
  service_name: string;
  appointment_date: string;
  appointment_time: string;
  status: "pending" | "confirmed" | "cancelled" | "completed";
  notes: string | null;
  reminder_sent_at: string | null;
  created_at: string;
  confirmed_at: string | null;
  updated_at: string;
  cancellation_reason: string | null;
};

type NotificationKind = "request" | "confirmed" | "cancelled";

type NotificationEvent = {
  key: string;
  kind: NotificationKind;
  at: string;
  appointment: NotificationAppointment;
};

const FIELDS =
  "id, patient_id, patient_name, patient_email, patient_phone, service_name, appointment_date, appointment_time, status, notes, reminder_sent_at, created_at, confirmed_at, updated_at, cancellation_reason";

const LOOKBACK_DAYS = 7;
const SEEN_KEY = "painel_notifications_seen_at";

const KIND_META: Record<
  NotificationKind,
  { label: string; icon: typeof Bell; tone: string; dot: string }
> = {
  request: {
    label: "Nova solicitação",
    icon: CalendarPlus,
    tone: "bg-primary/10 text-primary",
    dot: "bg-primary",
  },
  confirmed: {
    label: "Confirmou presença",
    icon: CheckCircle2,
    tone: "bg-emerald-500/12 text-emerald-600",
    dot: "bg-emerald-500",
  },
  cancelled: {
    label: "Cancelou",
    icon: XCircle,
    tone: "bg-rose-500/12 text-rose-600",
    dot: "bg-rose-500",
  },
};

function relativeTime(iso: string): string {
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `há ${diffMin} min`;
  const h = Math.round(diffMin / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ontem" : `há ${d} dias`;
}

function buildNotificationEvents(
  rows: NotificationAppointment[],
  sinceISO: string,
): NotificationEvent[] {
  const since = new Date(sinceISO).getTime();
  const events: NotificationEvent[] = [];
  for (const a of rows) {
    if (new Date(a.created_at).getTime() >= since) {
      events.push({ key: `${a.id}-request`, kind: "request", at: a.created_at, appointment: a });
    }
    if (a.confirmed_at && new Date(a.confirmed_at).getTime() >= since) {
      events.push({
        key: `${a.id}-confirmed`,
        kind: "confirmed",
        at: a.confirmed_at,
        appointment: a,
      });
    }
    if (a.status === "cancelled" && new Date(a.updated_at).getTime() >= since) {
      events.push({
        key: `${a.id}-cancelled`,
        kind: "cancelled",
        at: a.updated_at,
        appointment: a,
      });
    }
  }
  return events.sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime());
}

export function NotificationBell({
  enabled,
  onSelect,
}: {
  enabled: boolean;
  onSelect: (appointment: NotificationAppointment) => void;
}) {
  const [open, setOpen] = useState(false);
  const [seenAt, setSeenAt] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    return Number(window.localStorage.getItem(SEEN_KEY) || 0);
  });

  const { data: rows = [] } = useQuery({
    // Prefixo "appointments": o canal realtime do painel já invalida esta chave.
    queryKey: ["appointments", "notifications"],
    enabled,
    refetchInterval: 30_000,
    queryFn: async () => {
      const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();
      const { data, error } = await supabase
        .from("appointments")
        .select(FIELDS)
        .or(
          `created_at.gte.${since},confirmed_at.gte.${since},and(status.eq.cancelled,updated_at.gte.${since})`,
        )
        .order("updated_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as NotificationAppointment[];
    },
  });

  const events = useMemo(
    () =>
      buildNotificationEvents(
        rows,
        new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString(),
      ).slice(0, 40),
    [rows],
  );
  const unread = events.filter((e) => new Date(e.at).getTime() > seenAt).length;

  // Ao abrir, marca tudo como visto (o destaque some ao fechar).
  useEffect(() => {
    if (!open) return;
    const now = Date.now();
    window.localStorage.setItem(SEEN_KEY, String(now));
    return () => setSeenAt(now);
  }, [open]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notificações${unread ? `: ${unread} novas` : ""}`}
        aria-expanded={open}
        title="Solicitações, confirmações e cancelamentos"
        className="relative h-11 w-11 flex items-center justify-center rounded-full text-white/90 hover:bg-white/12 hover:text-white transition-colors cursor-pointer"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-400 text-[11px] font-bold text-neutral-950 flex items-center justify-center shadow-sm">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="dialog"
            aria-label="Notificações"
            className="absolute right-0 top-full z-50 mt-2 w-[min(92vw,380px)] overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-raised"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="text-sm font-semibold">Notificações</span>
              <span className="text-[11px] text-muted-foreground">
                últimos {LOOKBACK_DAYS} dias
              </span>
            </div>
            <div className="max-h-[60vh] overflow-y-auto divide-y divide-border/60">
              {events.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  Nenhuma solicitação, confirmação ou cancelamento recente.
                </div>
              ) : (
                events.map((e) => {
                  const meta = KIND_META[e.kind];
                  const Icon = meta.icon;
                  const isNew = new Date(e.at).getTime() > seenAt;
                  const a = e.appointment;
                  return (
                    <button
                      key={e.key}
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        onSelect(a);
                      }}
                      className={cn(
                        "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent cursor-pointer",
                        isNew && "bg-amber-50/60 dark:bg-amber-500/5",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                          meta.tone,
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {meta.label}
                          {isNew && <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />}
                        </span>
                        <span className="block truncate text-sm font-semibold">
                          {a.patient_name}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {formatShortDate(a.appointment_date)} às {a.appointment_time.slice(0, 5)}{" "}
                          · {a.service_name}
                        </span>
                        {e.kind === "cancelled" && a.cancellation_reason && (
                          <span className="mt-0.5 block truncate text-xs italic text-rose-600/90">
                            “{a.cancellation_reason}”
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {relativeTime(e.at)}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
