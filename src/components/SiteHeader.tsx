import { Link } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";
import { CLINIC } from "@/lib/clinic";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/85 backdrop-blur-xl">
      <div className="mx-auto grid h-24 max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-4 px-6">
        <nav className="hidden items-center gap-9 justify-self-start md:flex">
          <Link
            to="/sobre"
            className="text-kicker text-muted-foreground transition-silk hover:text-primary"
            activeProps={{ className: "text-primary" }}
          >
            Sobre
          </Link>
          <Link
            to="/tratamentos"
            className="text-kicker text-muted-foreground transition-silk hover:text-primary"
            activeProps={{ className: "text-primary" }}
          >
            Tratamentos
          </Link>
          <Link
            to="/contato"
            className="text-kicker text-muted-foreground transition-silk hover:text-primary"
            activeProps={{ className: "text-primary" }}
          >
            Contato
          </Link>
        </nav>
        <span className="hidden md:block" />

        <Link to="/" aria-label={CLINIC.name} className="justify-self-center">
          <Logo className="h-12 w-auto sm:h-14" />
        </Link>

        <Link
          to="/agendar"
          className="justify-self-end rounded-full bg-primary px-6 py-2.5 text-kicker text-primary-foreground transition-silk hover:bg-primary-deep"
        >
          Agendar
        </Link>

        <span className="md:hidden" />
        <span className="md:hidden" />
      </div>
    </header>
  );
}
