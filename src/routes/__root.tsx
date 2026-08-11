import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  useLocation,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { SchemaOrgJsonLd } from "@/components/SchemaOrg";
import { WhatsAppFloat } from "@/components/WhatsAppFloat";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <p className="text-kicker text-primary-soft">Erro 404</p>
        <h1 className="mt-5 font-display text-4xl text-foreground">Página não encontrada</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          O endereço que você procura não existe ou foi movido.
        </p>
        <div className="mt-8">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-full bg-primary px-7 py-3 text-kicker text-primary-foreground transition-silk hover:bg-primary-deep"
          >
            Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <p className="text-kicker text-primary-soft">Ops</p>
        <h1 className="mt-5 font-display text-3xl text-foreground">Esta página não carregou</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Algo deu errado do nosso lado. Tente novamente ou volte ao início.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-full bg-primary px-7 py-3 text-kicker text-primary-foreground transition-silk hover:bg-primary-deep"
          >
            Tentar de novo
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-full border border-border px-7 py-3 text-kicker text-foreground transition-silk hover:bg-accent"
          >
            Início
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "author", content: "Dra. Michelle Barbosa Tiago" },
      { name: "google-site-verification", content: "w_nz5anSp2Wxq1zPKnmNGUe8SJaDDA57RxPcSJ3SZnU" },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "pt_BR" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: "#8a4a52" },
      { title: "Dra. Michelle Barbosa Tiago — Odontologia estética em Macapá" },
      {
        property: "og:title",
        content: "Dra. Michelle Barbosa Tiago — Odontologia estética em Macapá",
      },
      {
        name: "twitter:title",
        content: "Dra. Michelle Barbosa Tiago — Odontologia estética em Macapá",
      },
      {
        name: "description",
        content:
          "Agende sua consulta com a Dra. Michelle Barbosa Tiago. Especialista em transformar sorrisos com Esthetic Aligner, Clareamento, Facetas em Resina, HOF e Laserterapia. Atendimento para adultos e crianças em Macapá, Amapá.",
      },
      {
        property: "og:description",
        content:
          "Agende sua consulta com a Dra. Michelle Barbosa Tiago. Especialista em transformar sorrisos com Esthetic Aligner, Clareamento, Facetas em Resina, HOF e Laserterapia. Atendimento para adultos e crianças em Macapá, Amapá.",
      },
      {
        name: "twitter:description",
        content:
          "Agende sua consulta com a Dra. Michelle Barbosa Tiago. Especialista em transformar sorrisos com Esthetic Aligner, Clareamento, Facetas em Resina, HOF e Laserterapia. Atendimento para adultos e crianças em Macapá, Amapá.",
      },
      {
        property: "og:image",
        content:
          "https://dramichelletiago.com.br/assets/dra-michelle.jpg",
      },
      {
        name: "twitter:image",
        content:
          "https://dramichelletiago.com.br/assets/dra-michelle.jpg",
      },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Jost:wght@200;300;400;500&family=Montserrat:wght@300;400;500;600;700&family=Parisienne&family=Playfair+Display:ital,wght@0,500;0,600;1,400&display=swap",
      },
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "apple-touch-icon", href: "/favicon.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "canonical", href: "https://dramichelletiago.com.br" },
      { rel: "sitemap", href: "https://dramichelletiago.com.br/sitemap.xml" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
        <SchemaOrgJsonLd />
      </head>
      <body suppressHydrationWarning={true}>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith("/auth") || location.pathname.startsWith("/painel");

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") {
        return;
      }
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => data.subscription.unsubscribe();
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <Toaster position="top-center" />
      {!isAdminRoute && <WhatsAppFloat />}
    </QueryClientProvider>
  );
}
