import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Gift } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { addDays, formatShortDate, toISODate } from "@/lib/clinic";
import { cn } from "@/lib/utils";

type BirthdayPatient = {
  id: string;
  name: string;
  phone: string | null;
  birth_date: string;
};

export type UpcomingBirthday = BirthdayPatient & {
  /** Data (YYYY-MM-DD) do aniversário neste ano/semana. */
  dateISO: string;
  /** 0 = hoje, 1 = amanhã, … 6. */
  daysAway: number;
  /** Idade que completa. */
  turningAge: number;
};

const PAGE_SIZE = 1000;

async function fetchPatientsWithBirthDate(): Promise<BirthdayPatient[]> {
  const all: BirthdayPatient[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("patients")
      .select("id, name, phone, birth_date")
      .not("birth_date", "is", null)
      .order("name")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    all.push(...((data || []) as BirthdayPatient[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return all;
}

function isLeapYear(y: number) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/** Aniversariantes de hoje até daqui a 6 dias (janela de 7 dias). */
function computeUpcomingBirthdays(
  patients: BirthdayPatient[],
  today: Date,
  days = 7,
): UpcomingBirthday[] {
  const result: UpcomingBirthday[] = [];
  for (let i = 0; i < days; i++) {
    const day = addDays(today, i);
    const iso = toISODate(day);
    const mmdd = iso.slice(5);
    const year = day.getFullYear();
    // Nascidos em 29/02 comemoram em 28/02 nos anos não bissextos.
    const alsoFeb29 = mmdd === "02-28" && !isLeapYear(year);
    for (const p of patients) {
      const birthMmdd = p.birth_date.slice(5, 10);
      if (birthMmdd === mmdd || (alsoFeb29 && birthMmdd === "02-29")) {
        const birthYear = Number(p.birth_date.slice(0, 4));
        result.push({ ...p, dateISO: iso, daysAway: i, turningAge: year - birthYear });
      }
    }
  }
  return result;
}

export function BirthdaysCard({ onOpenCRC }: { onOpenCRC: () => void }) {
  const { data: patients = [] } = useQuery({
    queryKey: ["patients", "birthdays_week"],
    queryFn: fetchPatientsWithBirthDate,
    staleTime: 10 * 60_000,
  });

  const todayISO = toISODate(new Date());
  const upcoming = useMemo(
    () => computeUpcomingBirthdays(patients, new Date()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [patients, todayISO],
  );
  const todayList = upcoming.filter((b) => b.daysAway === 0);
  const weekList = upcoming.filter((b) => b.daysAway > 0);

  return (
    <button
      type="button"
      onClick={onOpenCRC}
      className="group relative overflow-hidden rounded-3xl border border-border/80 bg-gradient-to-br from-card via-card to-pink-500/[0.04] p-7 text-left shadow-soft transition-all duration-500 hover:-translate-y-1 hover:border-pink-500/40 hover:shadow-raised cursor-pointer"
    >
      <div className="absolute top-0 right-0 h-28 w-28 rounded-bl-full bg-pink-500/5 transition-transform duration-500 group-hover:scale-125 pointer-events-none" />
      <div className="flex items-center justify-between">
        <span className="text-kicker text-muted-foreground">Aniversariantes</span>
        <div
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-2xl shadow-inner transition-transform duration-300 group-hover:scale-110",
            upcoming.length > 0
              ? "bg-pink-500/12 text-pink-600 dark:text-pink-400"
              : "bg-muted text-muted-foreground",
          )}
        >
          <Gift className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-5 flex items-baseline gap-3">
        <span className="font-display text-5xl font-light tracking-tight text-foreground transition-colors duration-300 group-hover:text-pink-600">
          {todayList.length}
        </span>
        <span className="text-xs font-medium text-muted-foreground">hoje</span>
      </div>
      <div className="mt-4 space-y-1.5 border-t border-border/40 pt-3 text-xs text-muted-foreground">
        {upcoming.length === 0 ? (
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/40" />
            <span>Nenhum aniversário nos próximos 7 dias</span>
          </div>
        ) : (
          <>
            {todayList.slice(0, 3).map((b) => (
              <div key={`t-${b.id}`} className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-pink-500 animate-pulse" />
                <span className="truncate font-semibold text-foreground">{b.name}</span>
                <span className="shrink-0">· {b.turningAge} anos</span>
              </div>
            ))}
            {weekList.slice(0, Math.max(0, 3 - todayList.length)).map((b) => (
              <div key={`w-${b.id}-${b.dateISO}`} className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-pink-300" />
                <span className="truncate">{b.name}</span>
                <span className="shrink-0 font-mono">· {formatShortDate(b.dateISO)}</span>
              </div>
            ))}
            {upcoming.length > 3 && (
              <div className="pt-0.5 text-[11px] font-semibold text-pink-700 dark:text-pink-400">
                +{upcoming.length - 3} nesta semana · ver no CRC
              </div>
            )}
          </>
        )}
      </div>
    </button>
  );
}
