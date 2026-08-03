import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { BOOKING_URL, CLINIC, SCHEDULE_SUMMARY } from "@/lib/clinic";

export const Route = createFileRoute("/contato")({
  head: () => ({
    meta: [
      { title: "Contato — Dra. Michelle Barbosa Tiago" },
      {
        name: "description",
        content:
          "Telefone, WhatsApp, endereço e horários de atendimento do consultório da Dra. Michelle Barbosa Tiago, em Macapá, Amapá.",
      },
      { property: "og:title", content: "Contato — Dra. Michelle Tiago" },
      {
        property: "og:description",
        content: "Telefone, WhatsApp, endereço e horários do consultório em Macapá, Amapá.",
      },
    ],
  }),
  component: Contato,
});

function Contato() {
  const blocks = [
    { label: "Telefone e WhatsApp", value: CLINIC.phone },
    { label: "E-mail", value: CLINIC.email },
    { label: "Endereço", value: CLINIC.address },
  ];

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <section className="mx-auto max-w-4xl px-6 py-20 lg:py-28">
        <p className="text-kicker text-primary-soft">Contato</p>
        <h1 className="mt-6 max-w-[16ch] font-display text-5xl leading-tight text-foreground lg:text-6xl">
          Vamos conversar
        </h1>
        <p className="mt-7 max-w-[50ch] text-base leading-relaxed text-muted-foreground">
          Para agendar, o caminho mais rápido é a agenda online no consultorio.me. Para dúvidas
          sobre tratamentos, fale direto com a recepção.
        </p>

        <dl className="mt-16 grid gap-x-12 gap-y-10 border-t border-border pt-12 sm:grid-cols-2">
          {blocks.map((block) => (
            <div key={block.label}>
              <dt className="text-kicker text-primary-soft">{block.label}</dt>
              <dd className="mt-3 font-display text-2xl text-foreground">{block.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-16 border-t border-border pt-12">
          <p className="text-kicker text-primary-soft">Horários de atendimento</p>
          <ul className="mt-6 max-w-md divide-y divide-border">
            {SCHEDULE_SUMMARY.map((item) => (
              <li
                key={item.day}
                className="flex items-baseline justify-between gap-6 py-3.5 text-sm"
              >
                <span className="text-foreground">{item.day}</span>
                <span className="text-muted-foreground">{item.hours}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-16 flex flex-wrap gap-4">
          <a
            href={BOOKING_URL}
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-primary px-9 py-4 text-kicker text-primary-foreground shadow-petal transition-silk hover:bg-primary-deep"
          >
            Agendar consulta
          </a>
          <a
            href={`https://wa.me/${CLINIC.whatsapp}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-border px-9 py-4 text-kicker text-foreground transition-silk hover:bg-accent"
          >
            Chamar no WhatsApp
          </a>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
