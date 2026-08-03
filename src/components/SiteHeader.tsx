import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";
import { CLINIC } from "@/lib/clinic";
import { BookingModal } from "@/components/BookingModal";

export function SiteHeader() {
  const [bookingOpen, setBookingOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-24 max-w-6xl items-center px-6">
          <div className="flex flex-1 justify-start">
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
            </nav>
          </div>

          <Link to="/" aria-label={CLINIC.name} className="flex shrink-0 justify-center">
            <Logo className="h-12 w-auto sm:h-14" />
          </Link>

          <div className="flex flex-1 justify-end">
            <button
              type="button"
              onClick={() => setBookingOpen(true)}
              className="rounded-full bg-primary px-6 py-2.5 text-kicker text-primary-foreground transition-silk hover:bg-primary-deep cursor-pointer"
            >
              Agendar
            </button>
          </div>
        </div>
      </header>

      <BookingModal open={bookingOpen} onOpenChange={setBookingOpen} />
    </>
  );
}
