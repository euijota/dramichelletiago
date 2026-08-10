import { createFileRoute } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade — Dra. Michelle Barbosa Tiago" },
      {
        name: "description",
        content:
          "Política de privacidade e tratamento de dados pessoais do consultório da Dra. Michelle Barbosa Tiago.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Privacidade,
});

function Privacidade() {
  const lastUpdated = "10 de agosto de 2026";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 bg-background/85 backdrop-blur-xl sticky top-0 z-40">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-6">
          <Logo className="h-8" />
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-16">
        <article className="prose prose-neutral dark:prose-invert max-w-none">
          <h1 className="font-display text-4xl text-foreground mb-2">Política de Privacidade</h1>
          <p className="text-muted-foreground mb-8">Última atualização: {lastUpdated}</p>

          <section className="mb-8">
            <h2 className="font-display text-2xl text-foreground mb-4">1. Controladora</h2>
            <p>
              <strong>Dra. Michelle Barbosa Tiago</strong>, Cirurgiã-Dentista inscrita sob o registro
              profissional <strong>CRO-AP 596</strong>, com consultório na Travessa Joaquim Pinheiro Borges, 964 — Alvorada,
              Macapá/AP, e-mail:{" "}
              <a href="mailto:dramichellebarbosatiago@gmail.com" className="underline">
                dramichellebarbosatiago@gmail.com
              </a>
              .
            </p>
          </section>

          <section className="mb-8">
            <h2 className="font-display text-2xl text-foreground mb-4">2. Dados coletados</h2>
            <p>Ao solicitar agendamento pelo site, coletamos:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>
                <strong>Nome completo</strong> — identificação do paciente
              </li>
              <li>
                <strong>Telefone/WhatsApp</strong> — contato para confirmação, lembretes e
                comunicação
              </li>
              <li>
                <strong>E-mail (opcional)</strong> — confirmação por e-mail, se informado
              </li>
              <li>
                <strong>Tipo de atendimento</strong> — particular ou convênio (e qual plano)
              </li>
              <li>
                <strong>Observações</strong> — motivo da consulta, se informado
              </li>
              <li>
                <strong>Data e horário escolhidos</strong> — para agendamento
              </li>
              <li>
                <strong>Protocolo gerado</strong> — identificação única da solicitação
              </li>
            </ul>
            <p className="mt-2">
              Não coletamos dados sensíveis de saúde (histórico clínico, diagnósticos, exames) pelo
              formulário do site.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="font-display text-2xl text-foreground mb-4">
              3. Finalidade e base legal (LGPD)
            </h2>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-2 font-semibold">Finalidade</th>
                  <th className="text-left p-2 font-semibold">Base legal (Art. 7º LGPD)</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border">
                  <td className="p-2">Agendar consulta odontológica</td>
                  <td className="p-2">
                    Execução de contrato / procedimentos preliminares (Art. 7º, V)
                  </td>
                </tr>
                <tr className="border-b border-border">
                  <td className="p-2">Enviar confirmação e lembretes (WhatsApp, e-mail)</td>
                  <td className="p-2">Legítimo interesse / consentimento (Art. 7º, I e IX)</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="p-2">Criar evento no Google Agenda da profissional</td>
                  <td className="p-2">Execução de contrato (Art. 7º, V)</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="p-2">Notificar a profissional sobre novo agendamento</td>
                  <td className="p-2">Legítimo interesse (Art. 7º, IX)</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="mb-8">
            <h2 className="font-display text-2xl text-foreground mb-4">4. Compartilhamento</h2>
            <p>
              Os dados{" "}
              <strong>
                não são vendidos, alugados ou compartilhados com terceiros para fins comerciais
              </strong>
              .
            </p>
            <p>Compartilhamos estritamente com:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>
                <strong>Google Calendar (Google LLC)</strong> — para criar o evento na agenda da
                profissional (processador de dados)
              </li>
              <li>
                <strong>Formspree (Formspree Inc.)</strong> — para envio de e-mail de notificação à
                profissional
              </li>
              <li>
                <strong>WhatsApp (Meta Platforms)</strong> — apenas quando o paciente clica no botão
                "Enviar Confirmação" ou "Agendar via WhatsApp", abrindo o app com a mensagem
                pré-preenchida
              </li>
            </ul>
            <p className="mt-2">
              Todos os processadores acima possuem cláusulas contratuais padrão de proteção de dados
              (DPA/SCC).
            </p>
          </section>

          <section className="mb-8">
            <h2 className="font-display text-2xl text-foreground mb-4">5. Retenção</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>
                Dados de agendamento: mantidos por <strong>5 anos</strong> após a última consulta
                (obrigação legal CFRO/Ética)
              </li>
              <li>
                Logs de acesso ao site: <strong>30 dias</strong>
              </li>
              <li>E-mails de notificação: conforme política do Formspree</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="font-display text-2xl text-foreground mb-4">
              6. Seus direitos (Art. 18 LGPD)
            </h2>
            <p>Você pode, a qualquer momento, solicitar:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Confirmação de tratamento e acesso aos dados</li>
              <li>Correção de dados incompletos, inexatos ou desatualizados</li>
              <li>Anonimização, bloqueio ou eliminação de dados desnecessários/excessivos</li>
              <li>Portabilidade dos dados a outro fornecedor</li>
              <li>
                Eliminação dos dados tratados com consentimento (exceto se houver obrigação legal de
                retenção)
              </li>
              <li>Informação sobre entidades com quem compartilhamos</li>
              <li>Revogação do consentimento (quando aplicável)</li>
            </ul>
            <p className="mt-2">
              Para exercer seus direitos, envie e-mail para{" "}
              <a href="mailto:dramichellebarbosatiago@gmail.com" className="underline">
                dramichellebarbosatiago@gmail.com
              </a>
              com o assunto "LGPD - Direitos do Titular".
            </p>
          </section>

          <section className="mb-8">
            <h2 className="font-display text-2xl text-foreground mb-4">7. Segurança</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>HTTPS/TLS 1.3 em todo o site</li>
              <li>Autenticação no painel administrativo (Supabase Auth + RLS)</li>
              <li>Chaves de API apenas no servidor (server functions), nunca no frontend</li>
              <li>
                Token secreto no Google Apps Script para impedir criação de eventos não autorizados
              </li>
              <li>Rate limiting no endpoint de agendamento (5 req/min por IP)</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="font-display text-2xl text-foreground mb-4">
              8. Cookies e tecnologias similares
            </h2>
            <p>O site usa apenas cookies estritamente necessários:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Sessão de autenticação (Supabase) — apenas para usuários logados no painel</li>
              <li>Preferências de tema/idioma (localStorage)</li>
            </ul>
            <p className="mt-2">
              Não usamos cookies de analytics, marketing ou rastreamento de terceiros.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="font-display text-2xl text-foreground mb-4">
              9. Crianças e adolescentes
            </h2>
            <p>
              Agendamentos para menores de 18 anos devem ser feitos por responsável legal, que
              fornecerá seus próprios dados de contato.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="font-display text-2xl text-foreground mb-4">
              10. Alterações nesta política
            </h2>
            <p>
              Esta política pode ser atualizada. A versão mais recente sempre estará disponível
              nesta URL. Mudanças materiais serão comunicadas via e-mail (se tivermos seu
              consentimento) ou aviso no site.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="font-display text-2xl text-foreground mb-4">
              11. Contato do Encarregado (DPO)
            </h2>
            <p>
              <strong>Dra. Michelle Barbosa Tiago</strong>
              <br />
              E-mail:{" "}
              <a href="mailto:dramichellebarbosatiago@gmail.com" className="underline">
                dramichellebarbosatiago@gmail.com
              </a>
              <br />
              Telefone/WhatsApp:{" "}
              <a href="tel:+5596981111157" className="underline">
                (96) 98111-1157
              </a>
            </p>
          </section>
        </article>
      </main>

      <footer className="border-t border-border/60 bg-background/50 py-8">
        <div className="mx-auto max-w-4xl px-6 text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} Dra. Michelle Barbosa Tiago — CRO-AP 596. Todos os direitos
          reservados.
        </div>
      </footer>
    </div>
  );
}
