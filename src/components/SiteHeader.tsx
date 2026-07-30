import { Link } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";
import { CLINIC } from "@/lib/clinic";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-6">
        <Link to="/" aria-label={CLINIC.name}>
          <Logo />
        </Link>

        <nav className="hidden items-center gap-9 md:flex">
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
          <Link
            to="/agendar"
            className="rounded-full bg-primary px-6 py-2.5 text-kicker text-primary-foreground transition-silk hover:bg-primary-deep"
          >
            Agendar
          </Link>
        </nav>

        <Link
          to="/agendar"
          className="rounded-full bg-primary px-5 py-2.5 text-kicker text-primary-foreground transition-silk hover:bg-primary-deep md:hidden"
        >
          Agendar
        </Link>
      </div>
    </header>
  );
}
