# Dra. Michelle Barbosa Tiago — Sistema de Gestão Clínica

Documentação consolidada do projeto. Referência de código: commit local `e3b1d50` e configuração operacional verificada em **10/11/2026**, no horário de Belém. Público: equipe da clínica, desenvolvedores e responsáveis pela operação.

| Recurso              | Referência                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| Site público         | [dramichelletiago.com.br](https://dramichelletiago.com.br)                                        |
| Agendamento          | [Solicitar consulta](https://dramichelletiago.com.br/agendar)                                     |
| Administração        | [Painel da clínica](https://dramichelletiago.com.br/painel)                                       |
| Código-fonte         | [euijota/dramichelletiago](https://github.com/euijota/dramichelletiago)                           |
| Hospedagem           | [Projeto Vercel](https://vercel.com/dramih/dramichelletiago)                                      |
| Banco e autenticação | [Projeto Supabase `ij`](https://supabase.com/dashboard/project/risylusxvpsvrpqsefor)              |
| Monitor externo      | [Sentry · clinical-notifications](https://ij-49.sentry.io/monitors/10915874/)                     |
| Alerta operacional   | [Sentry · Avisos clínicos — falha do agendador](https://ij-49.sentry.io/monitors/alerts/6324382/) |

## Produto e fluxos

A plataforma reúne o site institucional e a operação do consultório odontológico da Dra. Michelle Barbosa Tiago, em Macapá/AP. O paciente solicita um horário, pode preencher a anamnese e usa links individuais para confirmar ou cancelar. A equipe administra agenda, pacientes, prontuários, estoque e finanças no painel.

| Módulo                          | Comportamento                                                                                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Site público                    | Apresentação da clínica, tratamentos, contato e política de privacidade.                                                                                                 |
| Agenda                          | Horários disponíveis, criação de consultas, bloqueios, edição e acompanhamento por situação. A consulta pública de disponibilidade retorna somente data e hora ocupadas. |
| Recepção e relacionamento (CRC) | Confirmações pendentes, lembretes assistidos pelo WhatsApp, acompanhamento de retornos e relacionamento.                                                                 |
| Pacientes e prontuário          | Cadastro, registros clínicos, histórico e odontograma no painel autorizado.                                                                                              |
| Anamnese                        | Formulário pré-atendimento. O link identifica a consulta e a submissão pública fica em cadastro isolado, pendente de verificação pela recepção.                          |
| Estoque                         | Cadastro de produtos, movimentações de entrada e saída, lotes, validade, quantidade mínima e exportação.                                                                 |
| Financeiro e documentos         | Acompanhamento financeiro, recibos, orçamentos e relatórios. As exportações disponíveis variam conforme o módulo, incluindo PDF, XLSX e CSV.                             |
| Avisos operacionais             | Registro de confirmações e cancelamentos, envio por e-mail e acompanhamento da fila no painel.                                                                           |

O agendamento público cria uma consulta pendente sem vincular automaticamente um prontuário existente por nome ou telefone. A recepção verifica a identidade antes de associar o cadastro. Links antigos de anamnese podem ser acessados pelo fluxo de protocolo. Os estados de consulta são `pending`, `confirmed`, `completed` e `cancelled`.

## Arquitetura

| Camada            | Implementação                                                                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Interface         | React 19, Tailwind CSS 4, Radix UI, Lucide e Sonner.                                                                                |
| Aplicação         | TanStack Start e Router para SSR, rotas por arquivo e funções de servidor. TanStack Query para consultas e estado assíncrono.       |
| Build             | Vite 8 com Nitro no preset Vercel. A entrada de servidor é `src/server.ts` e a configuração fica em `vite.config.ts`.               |
| Dados             | Supabase PostgreSQL, Auth, RLS, Realtime e RPCs. Tipos em `src/integrations/supabase/types.ts`.                                     |
| Serviços externos | Resend para o e-mail clínico. Supabase Cron, `pg_cron`, `pg_net` e Vault para processamento. Sentry para acompanhamento dos ciclos. |
| Documentos        | jsPDF, AutoTable e SheetJS.                                                                                                         |
| Qualidade         | TypeScript, ESLint, Prettier, Vitest em Node e PGlite para testes SQL isolados.                                                     |

```text
Paciente → site Vercel → funções de servidor → Supabase
Recepção → painel autenticado → Supabase / RLS
Confirmação ou cancelamento → transação → fila de avisos
Supabase Cron → processador autenticado → Resend → caixa da clínica
Processador → check-ins no Sentry → alerta operacional
```

### Rotas e pontos de entrada

| Caminho                                                   | Função                                                                                                   |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `/`, `/sobre`, `/tratamentos`, `/contato`, `/privacidade` | Conteúdo público.                                                                                        |
| `/agendar`                                                | Consulta de disponibilidade e solicitação de horário.                                                    |
| `/anamnese`                                               | Pré-atendimento por link ou protocolo.                                                                   |
| `/confirmar/:token`, `/cancelar/:token`                   | Prévia e ação explícita do paciente.                                                                     |
| `/auth`, `/login`                                         | Login Supabase. A Vercel redireciona `/login` para `/auth`.                                              |
| `/painel`                                                 | Área autenticada com operações administrativas.                                                          |
| `POST /api/internal/clinical-notifications/process`       | Consome eventos persistidos, com segredo Bearer e corpo `{}`.                                            |
| `/api/cron/confirmation-20h`                              | Cron horário (Vercel): envia mensagem de confirmação com link revogável 20h antes de consultas `pending` não confirmadas, protegida por `CRON_SECRET`. Requer `WHATSAPP_WEBHOOK_URL`; sem ele, o envio permanece assistido no CRC. |

### Mapa do repositório

| Local                                                                              | Responsabilidade                                                                                                    |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `src/routes/`                                                                      | Páginas públicas, painel, autenticação e endpoints.                                                                 |
| `src/components/BookingModal.tsx`                                                  | Formulário e seleção de horários.                                                                                   |
| `src/components/clinical/`                                                         | CRC, pacientes, estoque, odontograma, anamnese, documentos e estado dos avisos.                                     |
| `src/lib/notify-server.ts`, `src/lib/ical-server.ts`                               | Criação de consultas públicas e disponibilidade.                                                                    |
| `src/lib/cancellation.ts`, `src/lib/appointment-links.server.ts`                   | Emissão revogável, prévia e ações do paciente.                                                                      |
| `src/lib/anamnesis-server.ts`, `src/lib/clinical-link-limit.server.ts`             | Anamnese, autorização por token e limite persistente.                                                               |
| `src/lib/clinical-notifications.server.ts`, `src/lib/email.server.ts`              | Processamento da fila e transporte por e-mail.                                                                      |
| `src/lib/notification-monitor.server.ts`, `src/lib/clinical-notification-admin.ts` | Saúde operacional, check-ins e revisão administrativa.                                                              |
| `src/integrations/supabase/`                                                       | Clientes de navegador e servidor, tipos e autenticação.                                                             |
| `supabase/migrations/`, `supabase/functions/`                                      | Evolução do banco e funções Supabase. A presença de uma função no repositório não comprova que ela está implantada. |
| `docs/`                                                                            | Desenho técnico, referências e guias de operação.                                                                   |

### Dados principais

| Entidade                                       | Papel                                                                                                 |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `appointments`, `services`                     | Consultas, horários, situação e catálogo de serviços.                                                 |
| `patients`, `clinical_records`                 | Cadastro e registros de atendimento. O painel usa registros clínicos também em consultas financeiras. |
| `odontograms`, `odontogram_procedures`         | Odontogramas e procedimentos associados.                                                              |
| `inventory_products`, `inventory_transactions` | Produtos e movimentos de estoque.                                                                     |
| `profiles`, `user_roles`, `message_templates`  | Perfis, papéis e modelos de mensagem.                                                                 |
| `appointment_link_tokens`                      | Hashes dos tokens, permissões, expiração e revogação.                                                 |
| `clinical_link_rate_buckets`                   | Contadores persistidos por origem protegida e tipo de operação.                                       |
| `clinical_notification_events`                 | Evento, estado, tentativas, reserva, resultado e revisão.                                             |
| `clinical_notification_runtime`                | Estado dos ciclos de monitoramento.                                                                   |

O arquivo de tipos contém outras entidades do projeto Supabase. Sua presença ali não demonstra uso pela clínica. Confirme referências no código antes de alterar tabelas ou funções.

## Confirmação, cancelamento e envio

1. A equipe autorizada emite um link opaco. A emissão registra apenas o hash no banco e substitui o link anterior. Reagendar também revoga credenciais anteriores.
2. A página consulta a prévia do agendamento. O paciente confirma ou cancela por uma função de servidor com mutação via POST.
3. `clinical_apply_patient_action` grava a mudança de situação e o evento na mesma transação. Repetir a ação retorna `already_applied` sem criar outro aviso.
4. O job `clinical-notifications-process` chama a Vercel a cada 30 segundos. O processador reserva até dez eventos, executa dois por vez e limita o tempo de cada envio.
5. O transporte usa o payload congelado e a chave de idempotência `clinical-status/<evento>`. O estado `accepted` indica aceitação pelo provedor. A caixa de entrada confirma a entrega.
6. Falhas recuperáveis seguem backoff, até cinco tentativas e uma janela máxima de 24 horas. Resultados incertos sem nova tentativa exigem conferência do histórico e do provedor antes de reenviar.
7. A recepção consulta o estado no painel e pode marcar falhas terminais como revisadas. A limpeza diária às **03h15 em Belém** remove links expirados ou revogados e eventos terminais após a retenção de 30 dias.

O canal de e-mail clínico é independente dos avisos operacionais do Sentry. O envio assistido por WhatsApp, os avisos de novo agendamento e o cron de lembretes são fluxos separados.

## Segurança e privacidade

- O painel usa sessão Supabase e operações administrativas exigem papel `admin`. RLS restringe agenda, prontuário, pacientes, estoque e odontogramas. A disponibilidade pública é exposta por uma função que retorna somente horários.
- O cliente privilegiado vive no servidor. Chaves `sb_secret_`, credenciais do provedor e segredos de tokens ficam fora do bundle público e do Git.
- Os links públicos têm limites de **30 leituras e 10 ações por minuto**, com HMAC da origem. As rotas de confirmação e cancelamento usam `no-store` e `no-referrer`.
- O endpoint do processador exige segredo dedicado, JSON com corpo vazio e a flag de ativação. O mesmo segredo fica na Vercel e no Supabase Vault.
- As permissões antigas que davam acesso anônimo a dados clínicos foram removidas. A verificação de políticas e privilégios confirma a correção, mas não determina se houve acesso indevido anterior.
- Use dados fictícios para testes e mantenha tokens, dados clínicos, e-mails de pacientes e valores de segredos fora de logs e relatórios de suporte.

## Ambiente e desenvolvimento

Use o Node.js **24** para reproduzir o runtime do deploy validado. Execute na raiz do repositório.

```bash
npm ci
npm run dev

npm run test:run
npx tsc --noEmit
npm run lint
npm run build
npm audit --omit=dev
npm audit
```

`npm run test:coverage` gera cobertura. O Vitest executa testes em Node, com PGlite nos cenários SQL. Use um Supabase de desenvolvimento e mantenha o processamento externo desativado durante mudanças locais. O build produz artefatos para a Vercel. O script `npm run preview` referencia Wrangler e artefatos Cloudflare, portanto não é o procedimento de validação do deploy Vercel.

| Variável                                              | Onde                          | Uso                                                              |
| ----------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`  | Build / navegador             | URL e chave pública do Supabase.                                 |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`            | Servidor                      | Conexão e autenticação dos usuários no servidor.                 |
| `SUPABASE_SERVICE_ROLE_KEY`                           | Segredo de servidor           | Acesso privilegiado. Use a chave de servidor do projeto correto. |
| `CLINICAL_RATE_LIMIT_SECRET`                          | Segredo de servidor           | HMAC para os limites públicos.                                   |
| `ANAMNESIS_TOKEN_SECRET`                              | Segredo de servidor           | Assinatura dos links de anamnese.                                |
| `CLINICAL_NOTIFICATIONS_ENABLED`                      | Servidor                      | Habilita processamento quando igual a `true`.                    |
| `CLINICAL_PROCESS_SECRET`                             | Segredo de servidor + Vault   | Autentica o job de processamento.                                |
| `RESEND_API_KEY`                                      | Segredo de servidor           | Permissão de envio do Resend.                                    |
| `CLINICAL_EMAIL_FROM`, `CLINICAL_EMAIL_TO`            | Servidor                      | Remetente em domínio verificado e caixa autorizada da clínica.   |
| `SENTRY_DSN`                                          | Servidor                      | Projeto de ingestão dos check-ins.                               |
| `VITE_SENTRY_DSN`                                     | Build / navegador, opcional   | Telemetria do navegador.                                         |
| `CRON_SECRET`, `WHATSAPP_WEBHOOK_URL`                 | Servidor, conforme integração | Autenticação e canal do fluxo de lembretes.                      |
| `GOOGLE_APPS_SCRIPT_URL`, `GOOGLE_APPS_SCRIPT_SECRET` | Servidor, conforme integração | Integração opcional de calendário no fluxo de novo agendamento.  |

O código inclui caminhos auxiliares para avisos de novo agendamento, entre eles FormSubmit, Formspree e integrações condicionadas a variáveis. Verifique configuração, destinatários e finalidade antes de tratá-los como canais operacionais. Os nomes canônicos de e-mail clínico são os da tabela. O código reconhece aliases legados para remetente, destinatário e DSN.

## Publicação e recuperação

1. Valide o código, dependências e migrações em homologação. Compare o histórico remoto com os arquivos SQL antes de aplicar alterações. Migrações remotas registradas por ferramenta podem ter timestamps diferentes dos nomes locais.
2. Configure as variáveis no ambiente de destino. Mudanças nas variáveis da Vercel exigem um novo deploy para chegar ao runtime.
3. Gere um deploy protegido, confira a página inicial, o agendamento e os cabeçalhos dos links. Promova o artefato verificado para o domínio principal.
4. Confirme os dois jobs do Supabase, as respostas do processador e os check-ins no Sentry. Envie confirmação e cancelamento fictícios ao destinatário aprovado e confirme a chegada na caixa.
5. Para interromper novos ciclos imediatamente, desative `clinical-notifications-process` no Supabase Cron. A fila continua persistida. Para desabilitar também o processador, publique um deploy com a flag desativada. Ao retomar, inspecione eventos atrasados ou incertos antes de intervir.
6. Para reverter um deploy, escolha uma versão compatível com as migrações e as permissões atuais. A reversão da aplicação não reverte o banco. Evite promover versões que reintroduzam os caminhos de acesso clínico corrigidos.

O [guia de operação](NOTIFICATION_OPERATIONS.md) detalha fila, recuperação e evidências. O [design das notificações](designs/sistema-de-notificacoes-clinicas.md) explica decisões e critérios.

## Estado verificado e limites

| Verificação       | Resultado registrado                                                                                                                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Produção          | Deploy `dpl_3tG5ebMuz8sFuB5VH8hfcyAARn1z` promovido com configuração do Sentry.                                                                                                                                                            |
| Processamento     | Job ativo a cada 30 segundos, limpeza ativa e processador HTTP 200. Último ciclo consultado às **22h24 de 10/11/2026**, saudável, no horário de Belém.                                                                                     |
| E-mail automático | Testes fictícios de confirmação e cancelamento entregues, conforme confirmação da caixa da clínica. Primeira tentativa em **9,7 s** e **20,6 s**, respectivamente. A entrega foi confirmada às 21h44 com precisão de minuto.               |
| Consistência      | Repetição de ações sem evento duplicado. Sessões reais de PostgreSQL testadas com dados fictícios em schema privado temporário. Dois executores reservaram eventos distintos.                                                              |
| Monitor externo   | Check-ins de produção verificados. Uma falha sintética abriu `DRAMICHELLE-3` e os e-mails do Sentry chegaram ao administrador. A detecção de ausência tem tolerância de dois minutos. A interrupção real do agendador ficou fora do teste. |
| Qualidade         | Última validação registrada com 186 testes, TypeScript, lint e build aprovados. A auditoria daquele momento indicou zero alertas em produção e 11 moderados em desenvolvimento. Reexecute antes de uma nova publicação.                    |

## Referências do projeto

- [Fluxo de confirmação e cancelamento](CONFIRMATION_SYSTEM.md)
- [Sistema de exportação](EXPORT_SYSTEM.md)
- [Mapa do site](designs/SITEMAP.md)
- [Operação de notificações](NOTIFICATION_OPERATIONS.md)
- [Design de notificações](designs/sistema-de-notificacoes-clinicas.md)
- [Relatório de revisão e execução](../goldfish_review_report.md)
