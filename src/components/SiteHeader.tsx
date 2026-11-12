import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";
import { CLINIC } from "@/lib/clinic";
import { BookingModal } from "@/components/BookingModal";
import { Menu, X, Phone, MessageSquare } from "lucide-react";

export function SiteHeader() {
  const [bookingOpen, setBookingOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-20 sm:h-24 max-w-6xl items-center justify-between md:justify-start px-6">
          {/* Mobile menu button */}
          <button
            type="button"
            className="md:hidden p-2.5 -ml-2.5 rounded-lg text-muted-foreground hover:bg-accent transition-silk min-h-[44px] min-w-[44px] flex items-center justify-center"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-menu"
            aria-label={mobileMenuOpen ? "Fechar menu" : "Abrir menu"}
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>

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
              className="inline-flex items-center min-h-[44px] rounded-full bg-primary px-5 sm:px-6 py-2 text-xs sm:text-sm text-kicker text-primary-foreground transition-silk hover:bg-primary-deep"
            >
              Agendar
            </Link>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <nav
            id="mobile-menu"
            className="md:hidden border-t border-border/60 bg-background/95 backdrop-blur-xl px-6 pb-6 animate-slide-down"
            aria-label="Menu mobile"
          >
            <ul className="flex flex-col gap-1 pt-6">
              <li>
                <Link
                  to="/sobre"
                  className="flex items-center gap-3 min-h-[44px] text-kicker text-foreground transition-silk hover:text-primary"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Sobre
                </Link>
              </li>
              <li>
                <Link
                  to="/tratamentos"
                  className="flex items-center gap-3 min-h-[44px] text-kicker text-foreground transition-silk hover:text-primary"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Tratamentos
                </Link>
              </li>
              <li>
                <Link
                  to="/contato"
                  className="flex items-center gap-3 min-h-[44px] text-kicker text-foreground transition-silk hover:text-primary"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Contato
                </Link>
              </li>
              <li className="pt-4 border-t border-border/50 flex flex-col gap-3">
                <Link
                  to="/agendar"
                  className="rounded-full bg-primary px-6 py-3 text-kicker text-primary-foreground text-center transition-silk hover:bg-primary-deep"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Agendar consulta
                </Link>
                <a
                  href={`tel:${CLINIC.whatsapp}`}
                  className="flex items-center justify-center gap-2 rounded-full border border-border px-6 py-3 text-kicker text-foreground transition-silk hover:bg-accent"
                >
                  <Phone className="h-5 w-5" />
                  Ligar: {CLINIC.phone}
                </a>
                <a
                  href={`https://wa.me/${CLINIC.whatsapp}?text=${encodeURIComponent("Oi Dra. Michelle, vim pelo site e queria agendar")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-2 rounded-full bg-green-600 px-6 py-3 text-kicker text-white transition-silk hover:bg-green-700"
                >
                  <MessageSquare className="h-5 w-5" />
                  WhatsApp
                </a>
              </li>
            </ul>
          </nav>
        )}
      </header>

      <BookingModal open={bookingOpen} onOpenChange={setBookingOpen} />
    </>
  );
}
