-- ==============================================================================
-- Migração: Sistema de Notificações Clínicas - Agendamento pg_cron & pg_net
-- Design Spec: docs/designs/sistema-de-notificacoes-clinicas.md
-- Versão: 20261109000002_clinical_notification_jobs.sql
-- ==============================================================================
-- Observação operacional:
-- Esta migração prepara as extensões pg_cron e pg_net para o processador de notificações.
-- Conforme especificado no plano de implementação (seção 429), os agendamentos são criados
-- de forma desativada ou documentada para ativação controlada após teste de ponta a ponta.

-- 1. Habilitação das extensões no schema extensions (se permitido no plano do projeto)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 2. Limpeza diária de rate buckets expirados (todo dia às 03:00)
-- Remove buckets temporários com expiração ultrapassada há mais de 24 horas
CREATE OR REPLACE FUNCTION public.clinical_cleanup_expired_buckets()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.clinical_link_rate_buckets
  WHERE expires_at < (now() - interval '24 hours');
END;
$$;

REVOKE ALL ON FUNCTION public.clinical_cleanup_expired_buckets() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clinical_cleanup_expired_buckets() TO service_role;
