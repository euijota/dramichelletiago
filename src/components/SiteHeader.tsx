import { Link } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";
import { CLINIC, BOOKING_URL } from "@/lib/clinic";
import { MobileMenu } from "@/components/MobileMenu";

export function SiteHeader() {
  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-20 sm:h-24 max-w-6xl items-center justify-between md:justify-start px-6">
          {/* Mobile menu - Vaul Drawer */}
          <div className="md:hidden">
            <MobileMenu />
          </div>

          {/* Desktop nav */}
          <nav className="hidden md:flex flex-1 justify-start" aria-label="Navegação principal">
            <ul className="flex items-center gap-9">
              <li>
                <Link
                  to="/sobre"
                  className="apple-nav-link text-kicker text-muted-foreground transition-silk hover:text-primary"
                  activeProps={{
                    className: "apple-nav-link text-kicker text-primary",
                    "data-active": "true",
                  }}
                >
                  Sobre
                </Link>
              </li>
              <li>
                <Link
                  to="/tratamentos"
                  className="apple-nav-link text-kicker text-muted-foreground transition-silk hover:text-primary"
                  activeProps={{
                    className: "apple-nav-link text-kicker text-primary",
                    "data-active": "true",
                  }}
                >
                  Tratamentos
                </Link>
              </li>
              <li>
                <Link
                  to="/contato"
                  className="apple-nav-link text-kicker text-muted-foreground transition-silk hover:text-primary"
                  activeProps={{
                    className: "apple-nav-link text-kicker text-primary",
                    "data-active": "true",
                  }}
                >
                  Contato
                </Link>
              </li>
            </ul>
          </nav>

          {/* Logo */}
          <Link to="/" aria-label={CLINIC.name} className="flex shrink-0 justify-center mx-auto">
            <Logo className="h-10 sm:h-14" />
          </Link>

          {/* CTA */}
          <div className="flex flex-1 justify-end">
            <Link
              to="/agendar"
              className="rounded-full bg-primary px-4 sm:px-6 py-2 text-xs sm:text-sm text-kicker text-primary-foreground transition-silk hover:bg-primary-deep"
            >
              Agendar
            </Link>
          </div>
        </div>
      </header>
    </>
  );
}
