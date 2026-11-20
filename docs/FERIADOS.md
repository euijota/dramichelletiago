# Feriados e recessos da agenda

A agenda respeita automaticamente os feriados do **consultório em Macapá/AP**
(CEP 68906-666) e os **recessos/feriados personalizados** cadastrados pelo painel.

## Onde aparece e como funciona

- **Agendamento público (`/agendar`)** (`src/components/BookingModal.tsx`) —
  dias de feriado ou recesso aparecem riscados com o rótulo **Feriado** ou
  **Recesso** e não podem ser selecionados; o "1º horário disponível" e a troca
  de mês pulam dias bloqueados.
- **Validação no servidor** (`src/lib/notify-server.ts`) —
  `saveAppointmentAndNotify` também bloqueia datas em feriado ou recesso,
  garantindo proteção mesmo contra requisições diretas.
- **Novo agendamento no painel** (`src/components/clinical/NewAppointmentModal.tsx`)
  — data em feriado ou recesso mostra aviso vermelho e o botão **Salvar
  Agendamento** fica bloqueado até marcar **"Agendar mesmo assim"** (exceção
  para urgências). O modo **Bloquear Horário** funciona normalmente.
- **Agenda semanal no painel** (`src/routes/_authenticated/painel.tsx`) —
  colunas de feriado recebem o selo **Feriado** (com tooltip do tipo e nome) e
  fundo rosado; colunas de recesso recebem o selo **Recesso** e fundo
  azul-claro. Quando vazias, exibem o nome do feriado ou recesso em vez de
  "Sem consultas".

## Feriados oficiais (`src/lib/holidays.ts`)

**Nacionais** — 01/01, Sexta-feira Santa, 21/04, 01/05, 07/09, 12/10,
02/11, 15/11, 20/11 (Consciência Negra), 25/12.

**Estaduais (AP)** — 19/03 (São José), 15/05 (Cabralzinho), 13/09 (Criação do
Território), 30/11 (Dia do Evangélico).

**Municipais (Macapá)** — 04/02 (Aniversário de Macapá), 08/12 (N. Sra. da
Conceição, Lei 128/80).

**Pontos facultativos** — Carnaval (segunda e terça) e Corpus Christi.

As datas móveis (Carnaval, Sexta-feira Santa, Corpus Christi) são calculadas
pela Páscoa, portanto valem para qualquer ano.

## Recessos e feriados personalizados

Para cadastrar férias, emendas de feriado, congressos ou dias avulsos sem
precisar alterar código:

1. No painel (`/painel`), clique em **Recesso** / **Recessos** (na barra superior,
   no cabeçalho da agenda semanal ou na busca rápida como **Recessos e Férias**).
2. Informe o **Nome** (ex.: `Recesso de fim de ano`, `Emenda de Corpus Christi`),
   a data de **Início** e de **Fim** (para 1 único dia, mantenha início e fim
   iguais) e salve.
3. É possível **editar** ou **excluir** qualquer registro diretamente pela lista.

Arquivos envolvidos:

- `supabase/migrations/20261120120000_create_clinic_recesses.sql` — tabela `public.clinic_recesses` com RLS para usuários autenticados.
- `src/lib/recess.ts` e `src/lib/recess.test.ts` — lógica pura (`recessFor`, `recessDayCount`, `formatRecessDate`, `formatRecessRange`).
- `src/lib/recesses-server.ts` — server function pública (`getRecesses`) via `supabaseAdmin`.
- `src/components/clinical/RecessManager.tsx` — modal de cadastro, edição e exclusão no painel.

## Manutenção

- Feriado oficial novo ou estadual/municipal permanente: adicionar em
  `getHolidays()` no `src/lib/holidays.ts`.
- Recessos, férias, congressos ou pontos facultativos específicos de um ano:
  gerenciar diretamente pelo painel sem deploy.
- Há testes em `src/lib/holidays.test.ts` e `src/lib/recess.test.ts`.
- Datas móveis conferidas: 2026 — Carnaval 17/02, Sexta-feira Santa 03/04,
  Corpus Christi 04/06.
