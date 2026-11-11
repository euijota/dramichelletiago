# Confirmação e cancelamento por link

O painel e o CRC emitem uma credencial aleatória revogável no clique de envio assistido. A consulta do painel não emite credenciais. O banco armazena somente SHA-256; reemitir ou reagendar revoga o link anterior. Uma credencial permite confirmar e cancelar, respeitando as transições da consulta. Links HMAC antigos deixam de ser aceitos: é necessário emitir novos links no painel.

## Fluxo integrado

1. A recepção autenticada solicita `getSingleAppointmentTokens`, protegido por `requireAdmin`. A RPC `clinical_issue_appointment_link` registra o hash e retorna o retrato atual da consulta usado na mensagem. O lembrete automático já existente usa a mesma emissão quando seu webhook está configurado.
2. `/confirmar/:token` e `/cancelar/:token` fazem a prévia pela RPC `clinical_preview_appointment`, sem renovar o link. A prévia não retorna o identificador da consulta.
3. O POST envia o hash à RPC `clinical_apply_patient_action`. A alteração da consulta e a criação do evento ocorrem na mesma transação. Repetir uma ação já aplicada não cria outro evento. O motivo de cancelamento tem campo próprio e preserva as notas.
4. A resposta ao paciente informa que a ação foi salva e o aviso registrado para envio. Não comprova entrega de e-mail. Esse caminho não chama provedores de notificação.
5. O endpoint interno reserva exclusivamente eventos persistidos. Antes do HTTP, registra a intenção e congela remetente, destinatário e conteúdo. Só conta aceitação após persistir o resultado do provedor.

O fluxo de novo agendamento em `notify-server.ts` não gera nem distribui credenciais de confirmação/cancelamento nos canais auxiliares. O token de anamnese mantém seu fluxo separado.

## Arquivos e verificação

- Emissão: `src/lib/appointment-links.server.ts`.
- Ações e prévia: `src/lib/cancellation.ts`.
- Processador: `src/lib/clinical-notifications.server.ts` e `src/lib/email.server.ts`.
- Migração complementar: `supabase/migrations/20261110000001_integrate_clinical_notification_flow.sql`.
- Operação e limites: [NOTIFICATION_OPERATIONS.md](NOTIFICATION_OPERATIONS.md).

`npm run test:run` executa contratos da aplicação, transporte simulado e SQL das migrações em PostgreSQL isolado com PGlite. Há cenários de revogação, repetição, rollback, reserva individual e evento superado. O teste isolado usa uma conexão; não comprova concorrência entre sessões nem integração com o Supabase remoto ou entrega real.
