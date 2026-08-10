# Sistema de Confirmação de Agendamento

Sistema de confirmação via link para pacientes confirmarem suas consultas de forma autônoma.

## Funcionalidades

- ✅ Link único de confirmação por agendamento
- ✅ Token seguro (base64url, similar ao cancelamento)
- ✅ Interface amigável em `/confirmar/:token`
- ✅ Atualização automática do status para "confirmed"
- ✅ Registro de timestamp (`confirmed_at`)
- ✅ Validações: não permite confirmar agendamentos cancelados/concluídos/passados
- ✅ Notificação à dentista após confirmação (TODO)

## Fluxo de uso

### 1. Paciente agenda consulta
- Sistema gera automaticamente 2 tokens:
  - **Token de confirmação** (para confirmar)
  - **Token de cancelamento** (para cancelar)

### 2. Paciente recebe notificação
Email/WhatsApp contém:
```
✅ Link de confirmação: https://dramichelletiago.vercel.app/confirmar/ABC123
🔗 Link de cancelamento: https://dramichelletiago.vercel.app/cancelar/XYZ789
```

### 3. Confirmação pelo paciente
- Clica no link de confirmação
- Visualiza detalhes da consulta
- Clica em "Confirmar Consulta"
- Status muda de `pending` → `confirmed`
- `confirmed_at` registra timestamp

### 4. Feedback visual
- **Agendamento pendente**: Botão "Confirmar Consulta" ativo
- **Já confirmado**: Badge verde "Agendamento já confirmado"
- **Cancelado**: Badge amarelo "Agendamento cancelado"
- **Não encontrado**: Erro "Link inválido ou expirado"

## Estrutura técnica

### Migration
```sql
-- supabase/migrations/20260806171500_add_confirmation_tracking.sql
ALTER TABLE appointments
ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ DEFAULT NULL;
```

### Funções principais

**`generateAppointmentToken(appointmentId)`**
- Gera token base64url seguro
- Mesmo sistema usado para cancelamento
- Formato: `base64url(appointmentId:randomSecret)`

**`confirmAppointmentByToken(token)`**
- Valida token
- Verifica status do agendamento
- Atualiza para `confirmed` + `confirmed_at`
- Retorna sucesso ou erro

**`getAppointmentByToken(token)`**
- Busca detalhes do agendamento pelo token
- Usado para preview antes de confirmar

### Rota

**`/confirmar/:token`** (`src/routes/confirmar/$token.tsx`)
- Interface visual com dados da consulta
- Estados: loading, não encontrado, cancelado, já confirmado, pendente, sucesso
- Design consistente com `/cancelar/:token`

## Integração

### Notificações (notify-server.ts)

Os links são incluídos automaticamente nos emails:

```typescript
const confirmationLink = confirmationToken
  ? `https://dramichelletiago.vercel.app/confirmar/${confirmationToken}`
  : "";

const messageText = 
  `✅ Link de confirmação: ${confirmationLink}\n` +
  `🔗 Link de cancelamento: ${cancellationLink}`;
```

### WhatsApp

Para mensagens WhatsApp, adicione o link de confirmação:

```typescript
const message = 
  `Olá! Sua consulta foi agendada.\n\n` +
  `📅 Data: ${data.appointmentDate}\n` +
  `⏰ Horário: ${data.appointmentTime}\n\n` +
  `✅ Confirme sua presença: ${confirmationLink}\n` +
  `🔗 Precisa cancelar? ${cancellationLink}`;
```

## Testes

63 testes passando, incluindo:
- Geração de tokens
- Validação de tokens
- URL safety (base64url)
- Compatibilidade com funções legadas
- Diferentes formatos de URL (confirmar/cancelar)

```bash
npm test
```

## Segurança

- ✅ Token único por agendamento
- ✅ Sem informações sensíveis no token
- ✅ Validação server-side
- ✅ Proteção contra replay (status checked)
- ✅ Não permite ações em agendamentos passados

## Próximos passos

- [ ] Notificar dentista quando paciente confirma (WhatsApp/Email)
- [ ] Analytics: taxa de confirmação
- [ ] Lembrete automático se não confirmar 48h antes
- [ ] Link de reagendamento na página de confirmação
