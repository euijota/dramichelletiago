import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Área da Dra. — Michelle Barbosa Tiago" },
      {
        name: "description",
        content:
          "Acesso restrito ao painel de gestão da agenda do consultório da Dra. Michelle Barbosa Tiago.",
      },
      { property: "og:title", content: "Área da Dra. — Michelle Barbosa Tiago" },
      {
        property: "og:description",
        content: "Acesso restrito ao painel de gestão da agenda do consultório.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Auth,
});

const fieldClass =
  "w-full rounded-lg border border-input bg-card px-4 py-3.5 text-sm text-foreground outline-none transition-silk placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-ring/25";

function Auth() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/painel", replace: true });
    });
  }, [navigate]);

  async function handleEmailAuth(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      toast.error("E-mail ou senha incorretos.");
      return;
    }
    navigate({ to: "/painel", replace: true });
  }

  async function handleGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth`,
      },
    });
    if (error) {
      toast.error("Não foi possível entrar com o Google.");
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-blush">
      <div className="px-6 py-8">
        <Link to="/">
          <Logo />
        </Link>
      </div>

      <div className="flex flex-1 items-center justify-center px-6 pb-20">
        <div className="w-full max-w-md rounded-3xl bg-card p-10 shadow-bloom">
          <p className="text-kicker text-primary-soft">Acesso restrito</p>
          <h1 className="mt-5 font-display text-4xl text-foreground">
            Entrar no painel
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Área exclusiva para gestão da agenda do consultório.
          </p>

          <button
            onClick={handleGoogle}
            className="mt-9 w-full rounded-full border border-border bg-background px-6 py-3.5 text-kicker text-foreground transition-silk hover:bg-accent cursor-pointer"
          >
            Continuar com Google
          </button>

          <div className="my-7 flex items-center gap-4">
            <span className="h-px flex-1 bg-border" />
            <span className="text-kicker text-muted-foreground">ou</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleEmailAuth} className="space-y-4">
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="E-mail"
              aria-label="E-mail"
              className={fieldClass}
            />
            <input
              required
              type="password"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Senha"
              aria-label="Senha"
              className={fieldClass}
            />
            <button
              type="submit"
              disabled={busy}
              className={cn(
                "w-full rounded-full bg-primary px-6 py-3.5 text-kicker text-primary-foreground transition-silk hover:bg-primary-deep cursor-pointer",
                busy && "opacity-60",
              )}
            >
              {busy ? "Aguarde…" : "Entrar"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
