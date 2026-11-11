# Supabase — regras de governança

Projeto: `risylusxvpsvrpqsefor` (produção: `risylusxvpsvrpqsefor.supabase.co`).

## Banco limpo (2026-11-11)

Este projeto Supabase **abrigava** um app de personal trainer da era Lovable
(`clients`, `trainers`, `workouts`, `payments`, `messages`, etc.). O esqueleto
(16 tabelas vazias, 2 funções, 2 usuários de auth órfãos: `joao@email.com` e
`kirlian@fitpro.com`) foi removido em 2026-11-11 após inventário confirmar
0 linhas em todas as tabelas. Backup completo do DDL:
`migrations_archive/20261111_backup_fitness_skeleton.sql`.

Restam apenas os objetos clínicos da Dra. Michelle (15 tabelas, 1 usuário de
auth — `dramichellebarbosatiago@gmail.com`, admin).

## Regras obrigatórias

1. **Fonte de schema = migrações em `supabase/migrations/`, exclusivamente.**
   `db pull` pode distorcer o histórico (recria objetos como migração única) —
   usar apenas em caso extremo, com revisão manual.
2. **`db diff` deve ser interpretado com cuidado** — saída grande demais
   normalmente indica drift; investigar antes de aplicar.
3. **Nunca rodar os arquivos de `supabase/migrations_archive/`** — são migrações
   órfãs da era Lovable e três delas são perigosas (`harden_role_checks_and_rls`
   termina com `DROP FUNCTION public.has_role`; `split_anon_authenticated_rls`
   reabre INSERT anônimo em `appointments`).
4. **Políticas RLS que chamam `public.has_role` devem ser `TO authenticated`**
   apenas. O branch anon de qualquer política NÃO pode chamar `has_role` (anon
   não tem EXECUTE; na build Supabase PG 17.6 isso causa **segfault no backend**
   e reinicia o cluster inteiro — ver achado de 2026-11-11).
5. Migrações novas: sempre idempotentes (`IF NOT EXISTS`, `ON CONFLICT`,
   drop+create de policies), pois o histórico local é replayado no `db reset`.
6. `handle_new_user`/`on_auth_user_created` está deliberadamente ausente
   (nenhum código faz `signUp`; nada lê `profiles`). Ver cabeçalho da migração
   `20261111200000_align_with_remote_state.sql`.

## Estrutura

- `migrations/` — as 13 migrações alinhadas ao histórico remoto
  (`migration list` = 13/13).
- `migrations_archive/` — 20 arquivos órfãos (era Lovable + 3 pendentes
  perigosas + baseline local antigo). **Referência apenas.**
- `PLAN-MIGRACOES.md` — plano completo e log de execução da reconciliação de
  2026-11-11 (inclui o achado do segfault e o rollback documentado).

## Fluxo de mudança de schema

```bash
supabase migration new <nome>   # cria arquivo com timestamp
# editar o SQL (idempotente!)
supabase db reset               # valida replay local do zero
supabase db push --dry-run --remote   # conferir o que será aplicado
supabase db push --remote --yes # após aprovação
```
