# Sistema de Notificações Clínicas — Dra. Michelle Tiago

- **Author:** ij
- **Date:** 2026-11-09

## Overview

Este documento define a especificação conceitual e técnica do sistema de notificações clínicas do consultório da Dra. Michelle Barbosa Tiago, estruturado a partir da síntese multi-lente de arquitetura e requisitos operacionais da clínica.

O sistema resolve o ciclo completo de comunicação entre clínica e paciente com custo zero de infraestrutura e zero risco operacional através de uma arquitetura híbrida de dois canais:

1. **Lembretes e convites enviados aos pacientes:** Modelo assistido de 1 clique no painel da clínica (`/painel`) que gera o link seguro (`/confirmar/<token>`) e abre o WhatsApp Web do consultório com a mensagem formatada para envio humano.
2. **Alertas instantâneos para a Dra. Michelle:** Disparo de e-mail transacional imediato para `dramichellebarbosatiago@gmail.com` quando o paciente confirma ou cancela a consulta pelo link, acionando o alerta nativo de push notification na tela de bloqueio do celular da dentista, em conjunto com toasts visuais e sonoros em tempo real no painel administrativo via Supabase Realtime.

---

## Analysis

### 1. UX e Ergonomia de Notificação Móvel (`design_critic`)

- **Problema de Truncamento na Tela de Bloqueio:** Aplicativos móveis de e-mail (Gmail/Apple Mail no iOS e Android) cortam o assunto da notificação entre 35 e 42 caracteres. Assuntos prolixos (ex.: _"Notificação do Sistema de Agendamento da Clínica: O paciente João Silva confirmou..."_) ocultam o dado mais crítico na notificação push.
- **Solução (Front-Loading):** Padronização rigorosa do assunto com as informações vitais nos primeiros 35 caracteres:
  - **Confirmação:** `[CONFIRMADA] João Silva — Seg 15h`
  - **Cancelamento:** `[CANCELADA] Maria Santos — Ter 10h (Desistência)`
  - **Reagendamento Solicitado:** `[REAGENDAR] Carlos Lima — Qua 16h`
- **Corpo do E-mail Orientado à Ação:** O e-mail contém os dados completos do procedimento, histórico de observações e um botão de ação com link direto para o WhatsApp do paciente (`https://wa.me/55...`), permitindo que a doutora tire dúvidas com um único toque caso necessário.

### 2. Integração e Isolamento no Backend (`codebase_details` & `structural`)

- **Ponto de Acoplamento:** As funções de servidor em `src/lib/cancellation.ts` (`confirmAppointmentByToken` e `cancelAppointmentByToken`) centralizam a validação da requisição e a transação no banco Supabase (`appointments`).
- **Isolamento de Falha (Non-Blocking Try/Catch):** O disparo de e-mail deve ocorrer imediatamente após a atualização no banco de dados, mas dentro de um bloco isolado `try...catch`. Falhas de rede ou indisponibilidade temporária do serviço de e-mail **nunca** devem reverter a confirmação do paciente nem retornar erro 500 na interface web. A falha deve ser registrada no console/Sentry e o paciente recebe confirmação de sucesso com integridade.
- **Módulo Dedicado de Envio:** Implementação em arquivo isolado de servidor (`src/lib/email.server.ts`) utilizando chamada HTTP nativa `fetch` para a API do Resend, eliminando dependências pesadas de bibliotecas SMTP ou clientes externos no bundle do cliente.

### 3. Avaliação Arquitetural & Minimalismo YAGNI (`zoom_out`)

- **Rejeição de Robôs Autônomos de WhatsApp (Z-API / Evolution API):**
  - Gateways autônomos de WhatsApp exigem manutenção constante de servidores VPS (Docker, Node, Chromium headless), pagamento de mensalidades recorrentes (R$ 80 a R$ 200/mês) e impõem risco severo de banimento do número telefônico da clínica por envio não-oficial em massa.
  - O envio assistido no WhatsApp Web somado ao push notification nativo via e-mail no celular da dentista atinge o mesmo objetivo operacional com custo financeiro zero e risco zero de bloqueio de linha.
- **Rejeição de Web Push / Service Workers PWA no Celular:**
  - Notificações PWA no iOS Safari impõem barreiras de adoção (exigem que a usuária adicione o site à tela de início manualmente, conceda permissões manuais de push e dependem de ciclo de vida instável de Service Workers que o iOS suspende em segundo plano).
  - O aplicativo do Gmail / Apple Mail já está permanentemente instalado no smartphone, possui canal de push em segundo plano mantido pelo sistema operacional e oferece entrega instantânea.

### 4. Proteção Contra Crawlers e Casos de Borda (`comprehension`)

- **Imunidade a Link Crawlers:** WhatsApp, antivírus corporativos e clientes de mensagens disparam requisições `GET` automáticas para gerar prévias de páginas (OpenGraph metadata). Se a rota de confirmação executasse mutação no `GET`, consultas seriam confirmadas ou canceladas automaticamente pelo robô do WhatsApp.
  - _Garantia:_ A arquitetura em duas etapas já implementada em `src/routes/confirmar/$token.tsx` e `src/routes/cancelar/$token.tsx` faz apenas leitura de dados no `GET` e restringe toda mutação ao clique explícito do paciente em um botão `POST`.
- **Idempotência e Recliques:** Se o paciente clicar novamente no link após já ter confirmado ou cancelado, a interface não exibe tela de erro, mas sim o estado consolidado: _"Esta consulta já foi confirmada anteriormente. Estamos te aguardando!"_, evitando reenvios repetidos de e-mail para a Dra. Michelle.
- **Token com Validade e Assinatura:** O token em base64url deve receber assinatura HMAC ou TTL para evitar manipulação de identificadores e expirar 48h após a data da consulta agendada.

### 5. Resoluções Inventivas TRIZ (`inventive_catalyst`)

- **Contradição 1: Notificação Imediata vs. Custo e Manutenção de Servidor**
  - _Resolução (Princípios TRIZ #25 - Auto-serviço e #28 - Substituição de Sistema Mecânico):_ Utilizar o canal de e-mail existente no sistema operacional do smartphone para disparar a notificação push nativa, dispensando a necessidade de servidores dedicados de mensageria.
- **Contradição 2: Riqueza de Dados Clínicos vs. Truncamento da Tela de Bloqueio**
  - _Resolução (Princípio TRIZ #10 - Ação Prévia / Front-Loading):_ Reestruturação semântica do cabeçalho do assunto, condensando status, nome do paciente e horário nos primeiros 35 caracteres para consumo instantâneo no relógio inteligente ou na tela de descanso do celular.
- **Contradição 3: Automação vs. Risco de Banimento no WhatsApp**
  - _Resolução (Princípio TRIZ #24 - Mediador):_ O envio assistido com 1 clique coloca a secretária/recepcionista como mediadora humana legítima, mantendo o tráfego 100% aderente aos termos de serviço do WhatsApp Web.

---

## Goals vs. Non-Goals

### In-Scope Goals

- Implementar o serviço de e-mail transacional de servidor (`src/lib/email.server.ts`) via API Resend (tier gratuito com até 3.000 envios/mês).
- Configurar template HTML e Plaintext com assuntos padronizados e front-loaded (`[CONFIRMADA]`, `[CANCELADA]`).
- Conectar o disparo às server functions de confirmação e cancelamento (`src/lib/cancellation.ts`) de forma não-bloqueante (`try...catch`).
- Incluir botão de 1 clique para WhatsApp do paciente no corpo do e-mail recebido pela Dra. Michelle.
- Preservar os avisos sonoros e visuais em tempo real no painel administrativo via Supabase Realtime quando o painel estiver aberto.
- Manter o fluxo assistido de 1 clique para disparo de lembretes no WhatsApp Web a partir do painel.

### Out-of-Scope Non-Goals

- Integração com gateways autônomos de WhatsApp pagos (Z-API, Twilio, Evolution API).
- Disparo de notificações de marketing, newsletter ou cobrança em massa.
- Implementação de Web Push PWA com Service Workers para dispositivos móveis.
- Robôs de inteligência artificial para conversar e negociar horários de agendamento no WhatsApp.

---

## Alternatives Weighed

- **Alternativa A: Robô de WhatsApp Autônomo para Notificar a Dra. Michelle**
  - _Motivo da rejeição:_ Rejeitado por impor custo fixo mensal (R$ 80 a R$ 200/mês), risco de queda de conexão que exige leitura periódica de QR Code e risco de bloqueio do chip da clínica. O e-mail transacional entrega o alerta móvel equivalente com zero custo e 99.9% de uptime.
- **Alternativa B: Web Push Notifications via Navegador (PWA)**
  - _Motivo da rejeição:_ Rejeitado pela fricção de instalação no iOS Safari (obrigatoriedade de adicionar à tela inicial, permissões manuais de sistema e encerramento de tarefas em background pelo iOS).
- **Alternativa C: Database Webhooks do Supabase diretamente para a API do Resend**
  - _Motivo da rejeição:_ Exigiria gerenciar triggers e edge functions externas no painel do Supabase com segredos duplicados, distanciando a lógica de negócios do repositório de código e dificultando testes locais com Vitest. O envio direto nas server functions do TanStack Start mantém todo o ciclo sob controle de versão.

---

## Key Decisions & Staging for Next Steps

- **Decisão 1:** A Dra. Michelle receberá alertas imediatos via e-mail em `dramichellebarbosatiago@gmail.com` a cada confirmação ou cancelamento realizado pelos pacientes.
- **Decisão 2:** Os assuntos dos e-mails seguirão o padrão front-loaded para leitura direta na tela de bloqueio e smartwatches sem necessidade de abrir a mensagem.
- **Decisão 3:** O disparo do e-mail será não-bloqueante; qualquer falha na API de envio não compromete o agendamento do paciente no banco de dados.
- **Decisão 4:** O painel de atendimento (`/painel`) continuará recebendo atualizações imediatas em tempo real via Supabase Realtime para a equipe da recepção.
- **Decisão 5:** O envio de lembretes e links para os pacientes continuará ocorrendo de forma assistida em 1 clique via WhatsApp Web.
