import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { BookingModal } from "@/components/BookingModal";
import { CLINIC } from "@/lib/clinic";
import { Sparkles, MapPin, Clock, Phone } from "lucide-react";

export const Route = createFileRoute("/agendar")({
  head: () => ({
    meta: [
      { title: "Agendar Consulta — Dra. Michelle Barbosa Tiago" },
      {
        name: "description",
        content:
          "Agende sua consulta odontológica online com a Dra. Michelle Barbosa Tiago em Macapá, AP. Atendimento para crianças e adultos.",
      },
      { property: "og:title", content: "Agendar Consulta — Dra. Michelle Tiago" },
      {
        property: "og:description",
        content: "Escolha seu horário online. Dra. Michelle Barbosa Tiago · CRO-AP 596.",
      },
      {
        property: "og:image",
        content: "https://dramichelletiago.com.br/assets/dra-michelle.jpg",
      },
    ],
    links: [{ rel: "canonical", href: "https://dramichelletiago.com.br/agendar" }],
  }),
  component: Agendar,
});

function Agendar() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main className="mx-auto max-w-4xl px-4 py-8 sm:py-16">
        <div className="text-center space-y-3 mb-6 sm:mb-10">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3.5 py-1 text-xs font-semibold uppercase tracking-widest text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Agendamento Direto
          </span>
          <h1 className="font-display text-4xl sm:text-5xl text-foreground">
            Reserve sua <span className="font-script text-primary">Consulta</span>
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base max-w-xl mx-auto">
            Escolha o melhor dia e horário abaixo. Os horários disponíveis são atualizados em tempo
            real conforme a agenda do consultório.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 pt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 text-primary" /> Macapá - AP
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 text-primary" /> {CLINIC.hours}
            </span>
            <span className="flex items-center gap-1">
              <Phone className="h-3.5 w-3.5 text-primary" /> {CLINIC.phone}
            </span>
          </div>
        </div>

        {/* Embedded Interactive Booking Card */}
        <div className="w-full">
          <BookingModal inline />
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
