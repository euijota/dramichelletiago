import { Link } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";
import { CLINIC } from "@/lib/clinic";

export function SiteFooter() {
  return (
    <footer className="bg-gradient-wine text-primary-foreground">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid gap-14 md:grid-cols-3">
          <div>
            <Logo onWine />
            <p className="mt-6 max-w-[34ch] text-sm leading-relaxed text-primary-foreground/70">
              {CLINIC.role}. Odontologia estética e reabilitadora com um cuidado
              atento a cada detalhe.
            </p>
          </div>

          <div className="space-y-4">
            <p className="text-kicker text-primary-foreground/50">Atendimento</p>
            <p className="font-display text-2xl">{CLINIC.phone}</p>
            <p className="text-sm text-primary-foreground/70">{CLINIC.hours}</p>
            <p className="text-sm text-primary-foreground/70">{CLINIC.address}</p>
          </div>

          <div className="space-y-4">
            <p className="text-kicker text-primary-foreground/50">Navegação</p>
            <div className="flex flex-col items-start gap-3 text-sm">
              <Link to="/sobre" className="transition-silk hover:opacity-70">
                Sobre a Dra. Michelle
              </Link>
              <Link to="/tratamentos" className="transition-silk hover:opacity-70">
                Tratamentos
              </Link>
              <Link to="/contato" className="transition-silk hover:opacity-70">
                Contato
              </Link>
              <Link to="/agendar" className="transition-silk hover:opacity-70">
                Agendar consulta
              </Link>
              <Link to="/auth" className="transition-silk hover:opacity-70">
                Área da Dra.
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-16 border-t border-primary-foreground/15 pt-8 text-kicker text-primary-foreground/40">
          © {new Date().getFullYear()} {CLINIC.name}
        </div>
      </div>
    </footer>
  );
}
