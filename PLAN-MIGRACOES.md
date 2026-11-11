# Plano: alinhamento do histórico de migrações Supabase (clínica)

Projeto: `risylusxvpsvrpqsefor` (link em `supabase/config.toml`). Database **compartilhado** com um app de personal trainer (tabelas `clients`, `trainers`, `workouts`, `payments`, etc. no mesmo `public`).

**Regra de ouro: as Fases 1–4 não escrevem nada no banco remoto.** A única escrita é o `db push` da Fase 5, com checkpoint humano.

---

## Contexto verificado (evidência, 2026-11-11)

Histórico remoto (`supabase_migrations.schema_migrations`) tem **exatamente 12 migrações**. As 16 da era Lovable **não estão registradas** — alguns objetos delas foram criados no projeto antigo/dashboard (ex.: `idx_appointments_unique_active_slot`, políticas de `profiles`).

| Versão remota | Nome | Arquivo local | Estado |
|---|---|---|---|
| 20261106154859 | baseline_own_supabase_schema | 20260814201748_... | **DIFF**: remoto (3.403c) é subconjunto do local (7.861c) — faltam handle_new_user, índices, triggers, GRANTs, políticas |
| 20261106154912 | create_patients_and_clinical_records | 20261106124500_... | **DIFF**: local tem 4 políticas a mais (supersedadas por `restrict_*`) |
| 20261107091336 | add_clinicorp_patient_fields_and_funnel | — | **só no remoto** (1.260c) |
| 20261107100510 | add_clinicorp_id_to_patients | — | **só no remoto** (158c) |
| 20261110191957 | clinical_notification_core | 20261109000001_... | byte-idêntico |
| 20261110200352 | integrate_clinical_notification_flow | 20261110000001_... | byte-idêntico |
| 20261110200408 | clinical_notification_jobs | 20261109000002_... | byte-idêntico |
| 20261110200530 | restrict_legacy_appointment_actions | 20261110200600_... | byte-idêntico |
| 20261110235403 | restrict_clinical_table_access | 20261111000002_... | byte-idêntico |
| 20261110235523 | restrict_odontogram_access | 20261111000003_... | byte-idêntico |
| 20261111004050 | clinical_notification_operations | 20261111000001_... | byte-idêntico |
| 20261111004349 | remove_legacy_public_appointment_read | 20261111000004_... | byte-idêntico |

Nunca aplicadas no remoto (locais órfãs): **16 da era Lovable** (`20260730*`, `202608*`) + **3 pendentes** (`20260814201811_migrate_lovable_services`, `20260814202756_harden_role_checks_and_rls`, `20260814203116_split_anon_authenticated_rls`).

Estado real de produção (via `pg_policies` / `pg_indexes` / `information_schema`):
- `appointments`: só `clinical_staff_admin_only` (authenticated ALL via `public.has_role`). **Anon sem acesso** — agendamento público usa `get_public_occupied_slots()` (SECURITY DEFINER). Última migração removeu a leitura anônima de propósito.
- `profiles`, `user_roles`, `services`: políticas da era Lovable existem em prod (fora do histórico).
- `message_templates`: RLS ON, **zero políticas** (9 linhas; leitura só via service_role — o código confirma: `src/lib/message-templates-server.ts` usa `supabaseAdmin`).
- `appointments` em prod tem 3 colunas fora das migrações: `patient_id uuid`, `legacy_patient_id integer`, `cancellation_reason text` (+ `idx_appointments_patient_id`).
- `services` está **vazio** (0 linhas) em prod.
- `public.has_role` existe em prod e é usado por 8 políticas; sem grants de `service_role` além do que `restrict_odontogram_access` emitiu.
- Triggers `updated_at` **não existem** em nenhuma tabela clínica em prod (só no app fitness).

## Decisões registradas

1. **Sem `migration repair`** — os arquivos serão renomeados para casar com os timestamps do remoto; o histórico já bate por construção.
2. **Sem política anon em `message_templates`** — não há consumidor; o relatório anterior se contradizia ao propô-la.
3. **`handle_new_user`/trigger NÃO entram** — nenhum código faz `signUp` nem lê `profiles`; decisão registrada em comentário na migração consolidada. (Se o time discordar, é incluir as 2 blocos idempotentes do baseline arquivado.)
4. **Sem `private.has_role`** — a consolidada recria `public.has_role` hardenada (`search_path = ''`), preservando a assinatura usada pelas 8 políticas.
5. **Nunca usar `db pull`** neste projeto — puxaria as tabelas do app fitness. Fluxo de schema é 100% migrações manuais.
6. **`db diff` sempre com `-s public`** e sabendo que as tabelas fitness vão aparecer como diferença esperada.

---

## Fase 0 — Pré-requisitos (local, zero risco)

**O que fazer:**
```bash
brew install supabase/tap/supabase   # CLI não está instalado
cd /Users/ij/dramichelletiago
supabase link --project-ref risylusxvpsvrpqsefor
# SUPABASE_ACCESS_TOKEN já está no ambiente
```

**Verificação:**
- [ ] `supabase --version` responde (CLI v3+).
- [ ] `supabase migration list` mostra as 12 versões remotas e TODAS as locais pendentes (divergência esperada nesta fase).

**Anti-padrões:** não rodar `db push`, `db reset --remote`, `db pull` nesta fase.

---

## Fase 1 — Alinhar arquivos ao histórico remoto (só arquivos, zero banco)

Trabalhar em `supabase/migrations/`. Criar `supabase/migrations_archive/` para os órfãos.

**1.1 Extrair o SQL das 4 migrações divergentes/ausentes do histórico remoto** (fonte da verdade):
```bash
curl -s -X POST "https://api.supabase.com/v1/projects/risylusxvpsvrpqsefor/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  --data-binary '{"query":"select version, name, statements from supabase_migrations.schema_migrations order by version"}' \
  > /tmp/remote_full.json
```
Gerar de cada item o arquivo `<version>_<name>.sql` com `statements.join('\n')`:
- `20261106154859_baseline_own_supabase_schema.sql`
- `20261106154912_create_patients_and_clinical_records.sql`
- `20261107091336_add_clinicorp_patient_fields_and_funnel.sql`
- `20261107100510_add_clinicorp_id_to_patients.sql`

**1.2 Renomear os 8 byte-idênticos** (conteúdo NÃO muda, só o timestamp no nome):

| De | Para |
|---|---|
| 20261109000001_clinical_notification_core.sql | 20261110191957_... |
| 20261110000001_integrate_clinical_notification_flow.sql | 20261110200352_... |
| 20261109000002_clinical_notification_jobs.sql | 20261110200408_... |
| 20261110200600_restrict_legacy_appointment_actions.sql | 20261110200530_... |
| 20261111000002_restrict_clinical_table_access.sql | 20261110235403_... |
| 20261111000003_restrict_odontogram_access.sql | 20261110235523_... |
| 20261111000001_clinical_notification_operations.sql | 20261111004050_... |
| 20261111000004_remove_legacy_public_appointment_read.sql | 20261111004349_... |

**1.3 Arquivar 19 arquivos** em `supabase/migrations_archive/` (16 Lovable + `20260814201748_baseline...` + as 3 pendentes `20260814201811`, `20260814202756`, `20260814203116`). O baseline antigo fica arquivado como referência para a Fase 2.

**Verificação:**
- [ ] `ls supabase/migrations` tem exatamente os 12 arquivos gerados em 1.1/1.2 (timestamps casam com a tabela de contexto).
- [ ] `supabase migration list` → as 12 linhas com LOCAL e REMOTE iguais, colunas vazias nas duas pontas.
- [ ] `grep -r "DROP FUNCTION public.has_role" supabase/migrations/` → **zero resultados**.
- [ ] Commit único documentado ("alinha filenames ao histórico remoto, sem mudança de SQL").

**Anti-padrões:**
- Não editar o SQL dos 8 byte-idênticos.
- Não "consertar" conteúdo dos 4 divergentes — usar o SQL remoto literal.
- Os 3 arquivos perigosos arquivados **nunca** voltam ao diretório ativo (`harden` termina com `DROP FUNCTION public.has_role`; `split` recria INSERT anônimo em `appointments`).

---

## Fase 2 — Migração consolidada idempotente (arquivo novo, ainda sem push)

Criar `supabase/migrations/20261111200000_align_with_remote_state.sql`. Cabeçalho com as decisões 2–4 documentadas. Tudo idempotente (segunda execução = no-op). Seções:

**a) `public.has_role` hardenada** (copiar corpo de `migrations_archive/20260814202756_harden_role_checks_and_rls.sql` linhas 5–17, mas no schema `public` e com `search_path = ''`):
```sql
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
```
(Assinatura idêntica à do baseline remoto — o `CREATE OR REPLACE` só troca o corpo.)

**b) Colunas/índices ausentes no remoto** (os dashboard-era que o código e o `types.ts` já usam):
```sql
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS patient_id uuid;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS legacy_patient_id integer;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS cancellation_reason text;
CREATE INDEX IF NOT EXISTS idx_appointments_patient_id ON public.appointments (patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON public.appointments (appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_service_id ON public.appointments (service_id);
CREATE INDEX IF NOT EXISTS idx_appointments_reminder_lookup ON public.appointments (appointment_date, appointment_time, reminder_sent_at);
CREATE INDEX IF NOT EXISTS idx_appointments_confirmation ON public.appointments (confirmed_at);
```
(Conferir definição exata dos 2 índices de reminder/confirmation no baseline arquivado antes de colar.)

**c) Triggers `updated_at`** para as tabelas que têm a coluna em prod: `profiles`, `services`, `appointments`, `message_templates`, `patients`, `odontograms`, `inventory_products`. A função `update_updated_at_column()` já existe (baseline remoto); criar triggers via `DO $$ ... IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = ...) $$` — o nome no local era `update_<tabela>_updated_at`.

**d) Políticas (drop if exists + create), espelhando o que existe em prod:**
- `profiles`: "Users can view/insert/update own profile" — `TO authenticated USING ((SELECT auth.uid()) = user_id)`.
- `user_roles`: "Users can view own roles" — **repara o caminho primário morto do `useSession.ts`** (hoje ele vive só do fallback server).
- `services`: "Anyone can view active services" (`is_active = true OR has_role`) + "Admins can manage services" (authenticated, has_role).
- `message_templates`: apenas "Admins can manage message templates" (authenticated, has_role). **Sem política anon** (decisão 2).

**e) Seed de `services`** — copiar os 11 INSERTs de `migrations_archive/20260814201811_migrate_lovable_services.sql` (IDs fixos e timestamps preservados) e acrescentar `ON CONFLICT (id) DO NOTHING`. Idempotente de verdade por causa dos IDs literais.

**Verificação (100% local):**
- [ ] `supabase db reset` aplica os 13 arquivos sem erro.
- [ ] Aplicar o arquivo da consolidada **2x** via psql no local → sem erro, `select count(*) from services` continua 11.
- [ ] `select count(*) from pg_policies where schemaname='public' and tablename in ('profiles','user_roles','services','message_templates')` → 3+1+2+1 = 7.
- [ ] `grep "private.has_role" supabase/migrations/20261111200000*.sql` → zero.

**Anti-padrões:** não usar `CREATE POLICY IF NOT EXISTS` (não existe em Postgres) — sempre drop+create; não criar `private.has_role`; não dropar `public.has_role`.

---

## Fase 3 — Paridade com produção (local vs remoto)

**O que fazer:**
```bash
supabase db dump --remote -f /tmp/prod_schema.sql -s public   # schema-only
supabase db reset                                             # local = 13 migrações
supabase db diff -s public -f /tmp/diff.sql
```

**Verificação:**
- [ ] `/tmp/diff.sql` contém **apenas**: tabelas/policies do app fitness (`clients`, `trainers`, ...) que existem só no remoto — esperado e documentado.
- [ ] Nenhuma tabela/policy/índice clínico aparece no diff (se aparecer, a consolidada ficou incompleta → corrigir a Fase 2).
- [ ] (Opcional, para dev local) dump data-only de `message_templates` filtrado manualmente para o seed local.

**Anti-padrões:** não "consertar" o diff aplicando-o (ele tentaria dropar o app fitness). Não usar `db pull` (decisão 5).

---

## Fase 4 — Smoke test de RLS no local

Com o local rodando (`supabase start`):
- [ ] **Anon**: `select` em `appointments` → 0 linhas; `insert` → erro de RLS; `select` em `message_templates` → 0 linhas; `select` em `services` ativos → 11 linhas.
- [ ] **Anon + SECURITY DEFINER**: `select * from get_public_occupied_slots()` → retorna horários.
- [ ] **Usuário autenticado sem papel**: `select` em `user_roles` → só as próprias linhas (0 para ele); `select` em `patients` → 0 linhas.
- [ ] **Usuário com `user_roles` admin**: enxerga `patients`, `appointments`, `clinical_records` via JWT (sem service_role) — valida que `public.has_role` hardenada funciona com as políticas.
- [ ] Fluxo do app: agendar pelo site (código server), painel lista consultas.

---

## Fase 5 — Aplicar em produção (única escrita; checkpoint humano)

1. **Checkpoint**: apresentar o resumo e pedir aprovação explícita.
2. `supabase db push --dry-run` → deve listar **apenas** `20261111200000`.
3. `supabase db push` (aplica só a consolidada; nada é destruído — tudo é CREATE OR REPLACE / IF NOT EXISTS / seed).
4. Pós-push (consultas de verificação no remoto):
   - `migration list` → 13 linhas alinhadas.
   - `pg_policies` → message_templates tem 1 policy; user_roles/profiles/services inalteradas.
   - Índices e triggers clínicos presentes; `services` = 11 linhas.
   - `has_role`: `GRANT EXECUTE ... TO service_role` confirmado via `information_schema.role_routine_grants`/`pg_proc.proacl`.
5. **Rollback** (se algo falhar): a única mutação in-place é o corpo de `has_role`; reverter com o SQL antigo (baseline remoto, `search_path = public`) — guardado em `migrations_archive/20260814201748_*.sql` linhas 48–57. Demais objetos são adicionais: dropar por nome.

**Anti-padrões:** nunca `db reset --remote`; nunca push com `--include-all`.

---

---

## Log de execução (2026-11-11)

- **Fase 0 ✅** — CLI 3.1.0 instalado, projeto vinculado. `migration list` inicial: 100% divergente, como previsto.
- **Fase 1 ✅** — 8 renomeados, 4 gerados do histórico, 20 arquivados. `migration list`: 12/12 alinhadas. Commit `0048c3a`. Commit extra `9764fc1` (`.temp` ignorado).
- **Fase 2 ✅** — `20261111200000_align_with_remote_state.sql` (seções a–i). `db reset` aplica 13 migrações sem erro; arquivo aplicado 2x = zero erros, `services` continua 11.
- **Fase 3 ✅** — Paridade objeto a objeto (tabelas/colunas/policies/índices/triggers/funções): as únicas diferenças clínicas restantes são os objetos que o push criará em produção e a política combinada de `services` que será substituída pela dividida.
- **Fase 4 ✅** — Smoke RLS: anon bloqueado em appointments/templates; 11 services ativos visíveis; `get_public_occupied_slots()` OK; authenticated sem papel = 0; admin via JWT = acesso total; 7 triggers + 6 índices + event trigger `ensure_rls` + `inventory_*` + `cancel/confirm_appointment_by_id` criados.
- **Fase 5 ✅** — `db push --remote --yes` autorizado pelo usuário (2026-11-11). Aplicada apenas `20261111200000`. Verificação pós-push: `migration list` 13/13; `services` = 11 linhas; políticas de services divididas (anon/authenticated/admin) e templates só admin; 7 índices em appointments; event trigger `ensure_rls`; `inventory_*` criadas; `has_role` com EXECUTE para authenticated/service_role/supabase_admin (anon revogado). Teste vivo via PostgREST: anon em `services` → **HTTP 200** (antes causava segfault); anon em `appointments` → HTTP 401; anon em `message_templates` → lista vazia.

### Achado crítico durante a execução (alterou o conteúdo da migração)

Na build local (Supabase PG 17.6), um `anon` tocando uma função SECURITY DEFINER sem EXECUTE não recebe "permission denied" — **provoca segfault no backend**, que derruba e reinicia o cluster inteiro. A política "Anyone can view active services" (`TO anon, authenticated`) original chamava `public.has_role` sem EXECUTE para anon → crash reproduzível com um SELECT simples.

Correção aplicada na Fase 2: a política de `services` foi **dividida por papel** — branch anon só testa `is_active = true` (nunca chama `has_role`); o branch authenticated mantém `has_role` (tem EXECUTE). O push substituirá a política combinada em produção, eliminando essa mina também lá. `has_role` continua com EXECUTE apenas para `authenticated` e `service_role` (decisão de menor privilégio em vez de conceder EXECUTE a anon).

## Fora de escopo (próximos passos sugeridos)

- Registrar num ADR/README: este banco é compartilhado; `db pull/diff` exigem cuidado; migrations são a única fonte de schema.
- Avaliar mover o app da clínica para um projeto Supabase próprio (elimina todos esses riscos).
- Renomear índices locais (ex. `unique_active_appointment_slot` vs `idx_appointments_unique_active_slot` em prod) num momento futuro de baixo tráfego, se desejado.
