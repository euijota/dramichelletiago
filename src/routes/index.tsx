import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { ToothMark } from "@/components/Logo";
import { BOOKING_URL, CLINIC, INSURANCE_PLANS as CLINIC_INSURANCE_PLANS  } from "@/lib/clinic";
import { supabase } from "@/integrations/supabase/client";
import heroAsset from "@/assets/dra-michelle.jpg.asset.json";
import signatureWine from "@/assets/signature-wine.png.asset.json";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      {
        title: "Dra. Michelle Barbosa Tiago — Odontologia estética em Macapá",
      },
      {
        name: "description",
        content:
          "Agende sua consulta com a Dra. Michelle Barbosa Tiago. Especialista em transformar sorrisos com Esthetic Aligner, Clareamento, Facetas em Resina, HOF e Laserterapia. Atendimento para adultos e crianças em Macapá, Amapá.",
      },
      {
        property: "og:title",
        content: "Dra. Michelle Barbosa Tiago — Odontologia estética em Macapá",
      },
      {
        property: "og:description",
        content:
          "Agende sua consulta com a Dra. Michelle Barbosa Tiago. Especialista em transformar sorrisos com Esthetic Aligner, Clareamento, Facetas em Resina, HOF e Laserterapia. Atendimento para adultos e crianças em Macapá, Amapá.",
      },
    ],
  }),
  component: Home,
});


const pillars = [
  {
    title: "Escuta antes do tratamento",
    body: "Cada plano começa com uma conversa sem pressa sobre o que você sente e o que deseja mudar.",
  },
  {
    title: "Estética que parece natural",
    body: "Proporção, cor e textura pensadas para o seu rosto — nunca um sorriso padronizado.",
  },
  {
    title: "Tempo e conforto",
    body: "Agenda com espaçamento generoso, para que ninguém seja atendido com pressa.",
  },
];

const homeInsurancePlans = [...CLINIC_INSURANCE_PLANS];

function Home() {
  const { data: services } = useQuery({
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

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-16 px-6 py-20 lg:grid-cols-[1.05fr_0.95fr] lg:py-28">
          <div className="animate-rise">
            <p className="text-kicker text-primary-soft">
              {CLINIC.role} · CRO-AP 596
            </p>
            <h1 className="mt-7 font-display text-5xl leading-[1.05] text-foreground sm:text-6xl lg:text-7xl">
              Especialista em
              <br />
              <span className="font-script text-primary">transformar sorrisos</span>
            </h1>
            <p className="mt-8 max-w-[46ch] text-base leading-relaxed text-muted-foreground">
              Atendimento para adultos e crianças. Odontologia estética e
              reabilitadora em um consultório pensado para acalmar. Escolha o
              horário que combina com a sua rotina e receba a confirmação da
              própria Dra. Michelle.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-4">
              <a
                href={BOOKING_URL}
            target="_blank"
            rel="noreferrer"
                className="rounded-full bg-primary px-9 py-4 text-kicker text-primary-foreground shadow-petal transition-silk hover:bg-primary-deep"
              >
                Agendar consulta
              </a>
            </div>

            <div className="mt-10">
              <p className="text-kicker text-primary-soft">
                Planos odontológicos atendidos
              </p>
              <ul className="mt-4 flex flex-wrap gap-2">
                {homeInsurancePlans.map((plan) => (
                  <li
                    key={plan}
                    className="rounded-full border border-border px-4 py-2 text-sm text-foreground"
                  >
                    {plan}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-14 flex items-center gap-4 border-t border-border pt-8">
              <ToothMark className="h-7 text-primary-soft" />
              <p className="text-sm leading-relaxed text-muted-foreground">
                {CLINIC.hours}
                <br />
                {CLINIC.address}
              </p>
            </div>
          </div>


          <div className="animate-veil">
            <div className="relative overflow-hidden rounded-t-[14rem] rounded-b-3xl shadow-bloom">
              <img
                src={heroAsset.url}
                alt="Dra. Michelle Barbosa Tiago, cirurgiã-dentista em Macapá"
                width={786}
                height={786}
                className="h-full w-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Pillars */}
      <section className="bg-gradient-blush">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <p className="text-kicker text-primary-soft">Como atendemos</p>
          <div className="mt-14 grid gap-12 md:grid-cols-3">
            {pillars.map((pillar) => (
              <div key={pillar.title} className="space-y-4">
                <span className="block h-px w-12 bg-primary/40" />
                <h2 className="font-display text-2xl text-foreground">
                  {pillar.title}
                </h2>
                <p className="max-w-[38ch] text-sm leading-relaxed text-muted-foreground">
                  {pillar.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Treatments */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <p className="text-kicker text-primary-soft">Tratamentos</p>
        <h2 className="mt-6 max-w-[20ch] font-display text-4xl leading-tight text-foreground lg:text-5xl">
          Atendimento para adultos e crianças
        </h2>

        <div className="mt-14 grid gap-x-12 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {services?.map((service) => (
            <article key={service.id} className="space-y-3">
              <ToothMark className="h-5 text-primary-soft" />
              <h3 className="font-display text-2xl text-foreground">
                {service.name}
              </h3>
              <p className="max-w-[36ch] text-sm leading-relaxed text-muted-foreground">
                {service.description}
              </p>
            </article>
          ))}
        </div>

        <Link
          to="/tratamentos"
          className="mt-14 inline-flex rounded-full border border-border px-9 py-4 text-kicker text-foreground transition-silk hover:bg-accent"
        >
          Ver todos os tratamentos
        </Link>
      </section>



      {/* Invitation */}
      <section className="mx-auto max-w-3xl px-6 py-28 text-center">
        <ToothMark className="mx-auto h-8 text-primary" />
        <p className="mt-10 font-display text-3xl leading-snug text-foreground sm:text-4xl">
          “Cuidar de um sorriso é cuidar da forma como alguém se apresenta ao
          mundo.”
        </p>
        <img
          src={signatureWine.url}
          alt="Dra. Michelle Barbosa Tiago"
          className="mx-auto mt-10 h-9 w-auto sm:h-11"
          loading="lazy"
          decoding="async"
        />

        <a
          href={BOOKING_URL}
            target="_blank"
            rel="noreferrer"
          className="mt-12 inline-flex rounded-full bg-primary px-9 py-4 text-kicker text-primary-foreground shadow-petal transition-silk hover:bg-primary-deep"
        >
          Reservar meu horário
        </a>
      </section>

      <SiteFooter />
    </div>
  );
}
