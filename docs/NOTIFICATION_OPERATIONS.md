# Operação das notificações clínicas

## Estado desta entrega

O processador está ativo no projeto Supabase `risylusxvpsvrpqsefor` e chama a Vercel a cada 30 segundos. A limpeza roda diariamente às 03h15 no horário de Belém. Os testes automáticos de confirmação e cancelamento chegaram ao Gmail da clínica às 21h44 de 10/11/2026.

## Ordem de implantação

1. Revisar e aplicar as migrações pendentes em ambiente de homologação, incluindo o core `20261109000001`, os jobs `20261109000002` e o complemento `20261110000001_integrate_clinical_notification_flow.sql`. O complemento preserva o histórico de migrações e substitui somente as RPCs da fila. Payloads antigos incompletos ficam em `uncertain`, com `payload_requires_review`, sem reenvio automático.
2. Implantar a aplicação com processamento desativado. Emitir um novo link de teste: credenciais HMAC antigas não são aceitas. Verificar revogação, confirmação, cancelamento e evento persistido. Validar também concorrência entre sessões no PostgreSQL do ambiente.
3. Configurar os segredos no servidor: credenciais Supabase já existentes, `RESEND_API_KEY`, `CLINICAL_EMAIL_FROM`, `CLINICAL_EMAIL_TO` e `CLINICAL_PROCESS_SECRET`. Este último deve conter 32 bytes aleatórios codificados em base64url, independente das chaves privilegiadas. Nenhum valor real deve ser versionado. Os aliases legados `CLINICAL_FROM_EMAIL` e `CLINICAL_ALERT_EMAIL` ainda são aceitos; preferir os nomes canônicos. Na ausência de destinatário explícito, aplica-se o e-mail da clínica em `clinic.ts`.
4. Após autorização para alterações remotas e envio, configurar o job para POST HTTPS à origem canônica em `/api/internal/clinical-notifications/process`, com `Authorization: Bearer <segredo>`, `Content-Type: application/json` e corpo `{}`. Não enviar identificador de evento, endereço ou conteúdo. A migração de jobs existente não agenda essa chamada: configurar e verificar o agendamento continua pendente.
5. Ativar a variável de processamento e verificar uma notificação de teste até a caixa destinatária. Resposta `accepted` comprova aceitação pelo provedor, não entrega. Validar cotas, frequência, ausência de executor e alertas antes de anunciar a meta de um minuto.

## Recuperação

Cada evento tem uma reserva de 90 segundos. O worker limita a reserva a dez eventos, processa dois por vez e para de iniciar grupos após dez segundos; cada chamada HTTP tem timeout de dez segundos. Reservas não iniciadas são liberadas. Falhas ao reservar, iniciar, finalizar ou liberar não retornam falso sucesso.

As tentativas usam o payload congelado e a mesma chave `clinical-status/<evento>`. Timeout ou resposta sem identificador ficam incertos. Repetições usam backoff, no máximo cinco intenções e janela máxima de 24 horas desde a primeira intenção. Após essa janela, ou com payload legado incompatível, inspecionar o histórico e o provedor antes de qualquer intervenção; não limpar o payload ou gerar outra chave para forçar reenvio.

Para interromper novos processamentos, desativar o job e `CLINICAL_NOTIFICATIONS_ENABLED`; conservar a fila. Chamadas que já chegaram ao provedor não podem ser desfeitas dessa forma. Ações do paciente ainda gravam os eventos para recuperação posterior.

## Pendências operacionais do design completo

O painel administrativo mostra a fila e permite marcar falhas terminais como revisadas. O monitor interno registra os ciclos, e o código emite check-ins quando encontra um DSN do Sentry. Ainda falta confirmar a regra de ausência no painel do Sentry e o recebimento do alerta.

## Validação local

Executar `npm run test:run`, `npx tsc --noEmit`, `npm run lint` e `npm run build`. O SQL é executado pelo teste `clinical-notifications.integration.test.ts` em banco isolado, sem credenciais ou envio externo. O transporte HTTP do provedor é simulado nos testes.

## Publicação em 2026-11-10

Deployment de produção: `dpl_68NFKXr41q6f4FnV3tYeWMgPZ3LU` (`https://dramichelletiago-qcm48xhzv-dramih.vercel.app`). Origem local: HEAD `0aa4d44` mais as alterações locais desta integração, sem novo commit. Migrações remotas registradas: `20261110200352` (integração), `20261110200408` (preparação dos jobs) e `20261110200530` (restrição legada).

Na primeira publicação, a Vercel ainda não tinha as variáveis do provedor de e-mail ou do processador. Nessa fase, o endpoint respondia HTTP 503 e a fila já persistia as ações. A leitura de configuração confirmou o projeto ativo, e `supabase/config.toml` foi corrigido localmente para substituir o ID do projeto antigo inativo.

Durante a publicação, a auditoria identificou DOMPurify `3.4.13` com vulnerabilidade crítica. O lockfile foi atualizado para `3.4.17`; nova auditoria de produção: zero críticas e cinco altas remanescentes. A atualização pontual passou pelos 181 testes, TypeScript e lint; as demais dependências precisam de tratamento separado.

Publicação final confirmada: deployment READY e promovido; os aliases `dramichelletiago.com.br` e `www.dramichelletiago.com.br` apontam para a versão final. A origem canônica respondeu HTTP 200. No deployment, início e rota de confirmação responderam 200; endpoint de processamento respondeu 503 por ausência de configuração. Consulta dos logs de erro da versão final (janela de dez minutos, até 30 registros) não retornou ocorrências. Isso não comprova o fluxo autenticado completo ou entrega de e-mail.


## Operação verificada em 10/11/2026

- A versão `dpl_4jw73E2C4MuAnHPLh3njSygvzYxA` foi promovida em `dramichelletiago.com.br`. A rota de agenda carregou no viewport móvel e a rota de confirmação respondeu com `Cache-Control: no-store` e `Referrer-Policy: no-referrer`.
- Uma confirmação e um cancelamento fictícios foram feitos pelos links públicos. O início das tentativas ocorreu em 9,7 s e 20,6 s. O Resend aceitou cada evento na primeira tentativa, a repetição de ambas as ações devolveu `already_applied`, e o destinatário confirmou o recebimento às 21h44. A resolução disponível é de um minuto, insuficiente para medir a latência exata de chegada. Os registros de teste foram removidos.
- Os links públicos usam HMAC do endereço de origem com `CLINICAL_RATE_LIMIT_SECRET` e os limites persistidos de 30 leituras e 10 ações por minuto. A Vercel e o Vault compartilham o segredo do processador. Para parar novos ciclos imediatamente, desative `clinical-notifications-process` em Supabase Cron. Alterações na variável da Vercel exigem novo deploy para chegar ao runtime.
- O job `clinical-notifications-retention` roda às 06h15 UTC. Aplica retenção de 30 dias aos links expirados ou revogados e aos eventos terminais. Consultas e registros clínicos ficam fora da limpeza. O SQL foi testado com dados fictícios e a verificação inicial de elegibilidade em produção retornou zero.
- As tabelas de agenda, pacientes, prontuários, estoque e odontogramas estão restritas a administradores autenticados. A disponibilidade pública usa somente data e hora. A revisão verificou os privilégios e políticas sem consultar dados clínicos. Ela não determinou se houve acesso indevido antes da correção.
- Agendamentos públicos ficam sem vínculo automático com prontuário. A anamnese pública é registrada em cadastro isolado para verificação pela recepção. O novo token usa `ANAMNESIS_TOKEN_SECRET` e identifica somente a consulta. Para links anteriores, use o acesso por protocolo.

- A concorrência foi validada em um schema privado temporário no PostgreSQL do projeto, com dados fictícios e duas sessões distintas. Duas confirmações simultâneas geraram um evento. Dois processadores reservaram eventos e concessões diferentes. O schema foi removido.
