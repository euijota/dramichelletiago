import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { BOOKING_URL, CLINIC } from "@/lib/clinic";
import heroImage from "@/assets/hero-clinica.jpg";

export const Route = createFileRoute("/sobre")({
  head: () => ({
    meta: [
      { title: "Sobre — Dra. Michelle Barbosa Tiago" },
      {
        name: "description",
        content:
          "Conheça a Dra. Michelle Barbosa Tiago, cirurgiã-dentista especializada em odontologia estética e reabilitadora em Macapá, Amapá.",
      },
      { property: "og:title", content: "Sobre a Dra. Michelle Barbosa Tiago" },
      {
        property: "og:description",
        content:
          "Cirurgiã-dentista especializada em odontologia estética e reabilitadora em Macapá, Amapá.",
      },
    ],
  }),
  component: Sobre,
});

function Sobre() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <section className="mx-auto grid max-w-6xl gap-16 px-6 py-20 lg:grid-cols-[0.9fr_1.1fr] lg:py-28">
        <div className="overflow-hidden rounded-t-[12rem] rounded-b-3xl shadow-bloom">
          <img
            src={heroImage}
            alt="Ambiente do consultório da Dra. Michelle Tiago"
            width={1200}
            height={1504}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        </div>

        <div>
          <p className="text-kicker text-primary-soft">Sobre</p>
          <h1 className="mt-6 font-display text-5xl leading-tight text-foreground lg:text-6xl">
            Uma odontologia
            <br />
            <span className="font-script text-primary">sem pressa</span>
          </h1>

          <div className="mt-9 space-y-6 text-base leading-relaxed text-muted-foreground">
            <p>
              A Dra. Michelle Barbosa Tiago é cirurgiã-dentista com atuação em odontologia estética
              e reabilitação oral. Seu trabalho parte de uma ideia simples: entender a pessoa antes
              de planejar o sorriso.
            </p>
            <p>
              O consultório foi desenhado para diminuir a ansiedade que muita gente carrega ao
              marcar uma consulta — luz natural, silêncio e horários espaçados, para que cada
              atendimento tenha o tempo que precisa.
            </p>
            <p>
              Do clareamento às facetas, da limpeza de rotina à reabilitação completa, o cuidado é o
              mesmo: técnica precisa e um resultado que continua parecendo seu.
            </p>
          </div>

          <dl className="mt-12 grid gap-8 border-t border-border pt-10 sm:grid-cols-2">
            <div>
              <dt className="text-kicker text-primary-soft">Atendimento</dt>
              <dd className="mt-3 text-sm text-muted-foreground">{CLINIC.hours}</dd>
            </div>
            <div>
              <dt className="text-kicker text-primary-soft">Consultório</dt>
              <dd className="mt-3 text-sm text-muted-foreground">{CLINIC.address}</dd>
            </div>
          </dl>

          <a
            href={BOOKING_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-12 inline-flex rounded-full bg-primary px-9 py-4 text-kicker text-primary-foreground shadow-petal transition-silk hover:bg-primary-deep"
          >
            Agendar consulta
          </a>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
