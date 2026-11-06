"use client";

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { X, Phone, MessageSquare } from "lucide-react";
import { Drawer } from "vaul";
import { CLINIC, BOOKING_URL } from "@/lib/clinic";

export function MobileMenu() {
  const [open, setOpen] = useState(false);

  return (
    <Drawer.Root open={open} onOpenChange={setOpen} direction="right">
      <Drawer.Trigger asChild>
        <button
          type="button"
          className="md:hidden p-2 rounded-lg text-muted-foreground hover:bg-accent transition-silk"
          aria-expanded={open}
          aria-controls="mobile-drawer"
          aria-label={open ? "Fechar menu" : "Abrir menu"}
        >
          <X className="h-6 w-6" />
        </button>
      </Drawer.Trigger>

      <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50" />

      <Drawer.Portal>
        <Drawer.Content className="fixed right-0 top-0 bottom-0 z-50 w-full sm:max-w-sm bg-background shadow-xl outline-none flex flex-col">
          <Drawer.Handle className="mx-auto w-12 h-1.5 bg-muted-foreground/30 rounded-full mt-4 mb-6" />

          <div className="flex items-center justify-between px-6 mb-4">
            <h3 className="text-lg font-semibold">Menu</h3>
            <Drawer.Close asChild>
              <button
                className="p-1 rounded-lg hover:bg-accent transition-silk"
                aria-label="Fechar menu"
              >
                <X className="h-5 w-5" />
              </button>
            </Drawer.Close>
          </div>

          <nav className="px-6 pb-6 flex-1 overflow-y-auto" aria-label="Menu mobile">
            <ul className="flex flex-col gap-4">
              <li>
                <Link
                  to="/sobre"
                  className="flex items-center gap-3 text-kicker text-foreground transition-silk hover:text-primary"
                  onClick={() => setOpen(false)}
                >
                  Sobre
                </Link>
              </li>
              <li>
                <Link
                  to="/tratamentos"
                  className="flex items-center gap-3 text-kicker text-foreground transition-silk hover:text-primary"
                  onClick={() => setOpen(false)}
                >
                  Tratamentos
                </Link>
              </li>
              <li>
                <Link
                  to="/contato"
                  className="flex items-center gap-3 text-kicker text-foreground transition-silk hover:text-primary"
                  onClick={() => setOpen(false)}
                >
                  Contato
                </Link>
              </li>
              <li className="pt-4 border-t border-border/50 flex flex-col gap-3">
                <Link
                  to="/agendar"
                  className="rounded-full bg-primary px-6 py-3 text-kicker text-primary-foreground text-center transition-silk hover:bg-primary-deep"
                  onClick={() => setOpen(false)}
                >
                  Agendar consulta
                </Link>
                <a
                  href={`tel:${CLINIC.whatsapp}`}
                  className="flex items-center justify-center gap-2 rounded-full border border-border px-6 py-3 text-kicker text-foreground transition-silk hover:bg-accent"
                  onClick={() => setOpen(false)}
                >
                  <Phone className="h-5 w-5" />
                  Ligar: {CLINIC.phone}
                </a>
                <a
                  href={`https://wa.me/${CLINIC.whatsapp}?text=${encodeURIComponent("Oi Dra. Michelle, vim pelo site e queria agendar")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-2 rounded-full bg-green-600 px-6 py-3 text-kicker text-white transition-silk hover:bg-green-700"
                  onClick={() => setOpen(false)}
                >
                  <MessageSquare className="h-5 w-5" />
                  WhatsApp
                </a>
              </li>
            </ul>
          </nav>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
