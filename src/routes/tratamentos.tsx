import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { supabase } from "@/integrations/supabase/client";
import { BOOKING_URL, INSURANCE_PLANS } from "@/lib/clinic";

export const Route = createFileRoute("/tratamentos")({
  head: () => ({
    meta: [
      { title: "Tratamentos — Dra. Michelle Barbosa Tiago" },
      {
        name: "description",
        content:
          "Esthetic Aligner, HOF (fios de sustentação PDO), clareamento dental, facetas em resina e laserterapia. Atendimento para adultos e crianças com a Dra. Michelle Barbosa Tiago.",
      },
      { property: "og:title", content: "Tratamentos — Dra. Michelle Tiago" },
      {
        property: "og:description",
        content:
          "Esthetic Aligner, HOF, clareamento, facetas em resina e laserterapia com cuidado delicado.",
      },
    ],
  }),
  component: Tratamentos,
});

function Tratamentos() {
  const { data: services, isLoading } = useQuery({
    queryKey: ["services"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("id, name, description, duration_minutes")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <section className="mx-auto max-w-6xl px-6 py-20 lg:py-28">
        <p className="text-kicker text-primary-soft">Tratamentos</p>
        <h1 className="mt-6 max-w-[18ch] font-display text-5xl leading-tight text-foreground lg:text-6xl">
          Especialista em transformar sorrisos
        </h1>
        <p className="mt-7 max-w-[52ch] text-base leading-relaxed text-muted-foreground">
          Atendimento para adultos e crianças. A duração indicada é a reserva na agenda — sempre com
          folga, para que a consulta nunca seja apressada.
        </p>

        <div className="mt-16 divide-y divide-border border-y border-border">
          {isLoading &&
            [0, 1, 2, 3].map((i) => (
              <div key={i} className="py-9">
                <div className="h-6 w-56 animate-pulse rounded bg-muted" />
                <div className="mt-4 h-4 w-96 max-w-full animate-pulse rounded bg-muted" />
              </div>
            ))}

          {services?.map((service) => (
            <article
              key={service.id}
              className="group flex flex-col gap-4 py-9 sm:flex-row sm:items-baseline sm:justify-between"
            >
              <div className="max-w-[46ch]">
                <h2 className="font-display text-3xl text-foreground transition-silk group-hover:text-primary">
                  {service.name}
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {service.description}
                </p>
              </div>
              <span className="shrink-0 text-kicker text-primary-soft">
                {service.duration_minutes} min
              </span>
            </article>
          ))}
        </div>

        <section className="mt-20 rounded-2xl border border-border bg-card px-8 py-10 sm:px-10">
          <p className="text-kicker text-primary-soft">Convênios</p>
          <h2 className="mt-5 max-w-[22ch] font-display text-3xl leading-tight text-foreground">
            Planos odontológicos atendidos
          </h2>
          <ul className="mt-8 flex flex-wrap gap-3">
            {INSURANCE_PLANS.map((plan) => (
              <li
                key={plan}
                className="rounded-full border border-border px-5 py-2.5 text-sm text-foreground"
              >
                {plan}
              </li>
            ))}
          </ul>
          <p className="mt-7 max-w-[52ch] text-sm leading-relaxed text-muted-foreground">
            Também atendemos particular. Em caso de dúvida sobre a cobertura do seu plano, fale com
            a gente antes da consulta.
          </p>
        </section>

        <a
          href={BOOKING_URL}
          target="_blank"
          rel="noreferrer"
          className="mt-16 inline-flex rounded-full bg-primary px-9 py-4 text-kicker text-primary-foreground shadow-petal transition-silk hover:bg-primary-deep"
        >
          Agendar consulta
        </a>
      </section>

      <SiteFooter />
    </div>
  );
}
