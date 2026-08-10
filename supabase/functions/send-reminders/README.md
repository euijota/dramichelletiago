# Send Reminders Edge Function

Supabase Edge Function que envia lembretes automáticos 24h antes das consultas agendadas.

## Funcionalidades

- ✅ Consulta agendamentos para o dia seguinte
- ✅ Filtra apenas consultas pendentes/confirmadas sem lembrete enviado
- ✅ Envia notificação por email via Formspree
- ✅ Registra timestamp do envio (`reminder_sent_at`)
- ✅ Logs detalhados de cada processamento

## Configuração

### 1. Deploy da função

```bash
cd dramichelletiago
supabase functions deploy send-reminders
```

### 2. Configurar Cron Job

No dashboard do Supabase (Database → Cron Jobs) ou via SQL:

```sql
-- Executar todos os dias às 09:00 (horário de Brasília UTC-3)
-- Cron roda em UTC, então 12:00 UTC = 09:00 UTC-3
SELECT cron.schedule(
  'send-daily-reminders',
  '0 12 * * *',
  $$
  SELECT
    net.http_post(
      url:='https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-reminders',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
      body:='{}'::jsonb
    ) as request_id;
  $$
);
```

**Ajuste o horário conforme necessário:**
- `0 12 * * *` = 09:00 horário de Macapá (UTC-3)
- `0 9 * * *` = 06:00 horário de Macapá (UTC-3)
- `0 15 * * *` = 12:00 horário de Macapá (UTC-3)

### 3. Testar manualmente

```bash
# Via Supabase CLI
supabase functions invoke send-reminders

# Via curl
curl -X POST \
  'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-reminders' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json'
```

## Resposta da função

```json
{
  "message": "Reminders processed",
  "count": 2,
  "results": [
    {
      "appointment_id": "uuid-here",
      "patient_name": "João Silva",
      "whatsapp_sent": true,
      "email_sent": true,
      "updated": true
    }
  ]
}
```

## Logs e Monitoramento

Ver logs no dashboard do Supabase:
- Edge Functions → send-reminders → Logs
- Ou via CLI: `supabase functions logs send-reminders`

## Integração WhatsApp Business API

⚠️ **Pendente**: O envio via WhatsApp está preparado mas requer integração com:
- [Twilio WhatsApp Business API](https://www.twilio.com/whatsapp)
- [WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api)

Substituir a seção `sendWhatsAppReminder` no `index.ts` com chamada real à API.

## Estrutura da Migration

A tabela `appointments` possui:
- `reminder_sent_at TIMESTAMPTZ` - timestamp do envio do lembrete
- Index otimizado: `idx_appointments_reminder_lookup` para queries eficientes

## Troubleshooting

**Lembretes não estão sendo enviados:**
1. Verificar se o cron job está ativo: `SELECT * FROM cron.job;`
2. Verificar logs da função
3. Confirmar timezone: UTC-3 (Macapá) = UTC-3h
4. Testar manualmente via curl

**Emails não chegam:**
1. Verificar configuração do Formspree
2. Verificar email do paciente no banco de dados
3. Checar spam/lixeira do email de destino
