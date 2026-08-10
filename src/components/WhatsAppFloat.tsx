import { useState, useEffect } from "react";
import { MessageSquare, X } from "lucide-react";
import { CLINIC } from "@/lib/clinic";

const WHATSAPP_URL = `https://wa.me/${CLINIC.whatsapp}?text=${encodeURIComponent("Oi Dra. Michelle, vim pelo site e queria agendar uma consulta")}`;

export function WhatsAppFloat() {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 3000);
    const onScroll = () => setVisible(window.scrollY > 200);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50" role="region" aria-label="Contato rápido">
      {/* Expanded options */}
      <div
        className={`absolute bottom-16 right-0 flex flex-col-reverse gap-3 transition-all duration-300 ease-out ${
          expanded ? "opacity-100 pointer-events-auto translate-y-0" : "opacity-0 pointer-events-none translate-y-2"
        }`}
        role="menu"
      >
        <a
          href={`tel:${CLINIC.whatsapp}`}
          className="flex items-center gap-2 rounded-full bg-background px-4 py-3 shadow-lg border border-border text-kicker text-foreground hover:bg-accent transition-silk whitespace-nowrap"
          role="menuitem"
          aria-label="Ligar para a clínica"
        >
          <span className="hidden sm:inline">Ligar</span>
        </a>
        <a
          href={WHATSAPP_URL}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 rounded-full bg-green-600 px-4 py-3 shadow-lg text-kicker text-white hover:bg-green-700 transition-silk whitespace-nowrap"
          role="menuitem"
          aria-label="Chamar no WhatsApp"
        >
          <span className="hidden sm:inline">WhatsApp</span>
        </a>
      </div>

      {/* Main button */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="relative flex h-14 w-14 items-center justify-center rounded-full bg-green-600 text-white shadow-lg transition-silk hover:bg-green-700 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-green-600/50 focus:ring-offset-2"
        aria-expanded={expanded}
        aria-haspopup="true"
        aria-label={expanded ? "Fechar opções de contato" : "Abrir opções de contato"}
      >
        {expanded ? (
          <X className="h-7 w-7" aria-hidden="true" />
        ) : (
          <MessageSquare className="h-7 w-7" aria-hidden="true" />
        )}
      </button>

      {/* Pulse animation */}
      <div
        className="absolute inset-0 rounded-full bg-green-600 animate-ping opacity-75"
        aria-hidden="true"
      />
    </div>
  );
}