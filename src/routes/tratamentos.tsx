import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { supabase } from "@/integrations/supabase/client";
import { BOOKING_URL, DEFAULT_SERVICES, INSURANCE_PLANS } from "@/lib/clinic";

export const Route = createFileRoute("/tratamentos")({
  head: () => ({
    meta: [
      { title: "Tratamentos — Dra. Michelle Barbosa Tiago" },
      {
        name: "description",
        content:
          "Esthetic Aligner, HOF, clareamento dental, facetas em resina e laserterapia em Macapá/AP. Atendimento para adultos e crianças com a Dra. Michelle Barbosa Tiago.",
      },
      { property: "og:title", content: "Tratamentos — Dra. Michelle Tiago" },
      {
        property: "og:description",
        content:
          "Esthetic Aligner, HOF, clareamento, facetas em resina e laserterapia com cuidado delicado.",
      },
      {
        property: "og:image",
        content: "https://dramichelletiago.com.br/assets/dra-michelle.jpg",
      },
      {
        property: "og:type",
        content: "website",
      },
      {
        property: "og:site_name",
        content: "Dra. Michelle Barbosa Tiago",
      },
      {
        property: "og:locale",
        content: "pt_BR",
      },
    ],
    links: [{ rel: "canonical", href: "https://dramichelletiago.com.br/tratamentos" }],
  }),
  component: Tratamentos,
});

function Tratamentos() {
  const { data: services, isLoading } = useQuery({
    queryKey: ["services"],
    initialData: DEFAULT_SERVICES,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("id, name, description, duration_minutes")
        .eq("is_active", true)
        .order("sort_order");
      if (error || !data || data.length === 0) return DEFAULT_SERVICES;
      return data;
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <section className="mx-auto max-w-6xl px-6 py-20 lg:py-28">
        <p className="text-kicker text-primary-soft">Tratamentos</p>
        <h1 className="mt-6 max-w-[20ch] font-display text-5xl leading-tight text-foreground lg:text-6xl">
          Tratamentos de Odontologia Estética em Macapá
        </h1>
        <p className="mt-7 max-w-[52ch] text-base leading-relaxed text-muted-foreground">
          Atendimento para adultos e crianças. A duração indicada é a reserva na agenda — sempre com
          folga, para que a consulta nunca seja apressada.
        </p>

        <div className="mt-16 grid gap-5 md:grid-cols-2 lg:grid-cols-3" aria-live="polite">
          {isLoading &&
            [0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="rounded-3xl border border-border bg-card p-7"
                aria-label="Carregando tratamento"
              >
                <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
                <div className="mt-8 h-7 w-4/5 animate-pulse rounded bg-muted" />
                <div className="mt-4 h-12 w-full animate-pulse rounded bg-muted" />
              </div>
            ))}

          {services?.map((service, index) => (
            <article
              key={service.id}
              className="group relative flex min-h-64 flex-col overflow-hidden rounded-3xl border border-border bg-card p-7 shadow-petal transition-silk hover:-translate-y-1 hover:border-primary/35 hover:shadow-bloom"
            >
              <div className="flex items-start justify-between gap-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-kicker text-primary-soft">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="rounded-full border border-border px-3 py-1 text-kicker text-primary-soft">
                  {service.duration_minutes} min
                </span>
              </div>
              <h2 className="mt-8 max-w-[16ch] font-display text-2xl leading-tight text-foreground transition-silk group-hover:text-primary">
                {service.name}
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                {service.description}
              </p>
              <span className="mt-auto pt-7 text-kicker text-primary-soft opacity-0 transition-silk group-hover:opacity-100">
                Conheça este cuidado
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
