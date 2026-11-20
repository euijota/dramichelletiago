# Feriados da agenda

A agenda respeita automaticamente os feriados do **consultório em Macapá/AP**
(CEP 68906-666). A lógica vive em `src/lib/holidays.ts` e é usada em:

- **Agendamento público** (`src/components/BookingModal.tsx`) — dias de feriado
  aparecem riscados com o rótulo **Feriado** e não podem ser selecionados;
  o "primeiro horário disponível" nunca cai em feriado.
- **Novo agendamento no painel** (`src/components/clinical/NewAppointmentModal.tsx`)
  — data de feriado mostra aviso vermelho e o botão **Salvar Agendamento**
  fica bloqueado até marcar **"Agendar mesmo assim (feriado)"** (exceção
  para urgências). O modo **Bloquear Horário** funciona normalmente.

## Feriados bloqueados

**Nacionais** — 01/01, Sexta-feira Santa, 21/04, 01/05, 07/09, 12/10,
02/11, 15/11, 20/11 (Consciência Negra), 25/12.

**Estaduais (AP)** — 19/03 (São José), 15/05 (Cabralzinho), 13/09 (Criação do
Território), 30/11 (Dia do Evangélico).

**Municipais (Macapá)** — 04/02 (Aniversário de Macapá), 08/12 (N. Sra. da
Conceição, Lei 128/80).

**Pontos facultativos** — Carnaval (segunda e terça) e Corpus Christi.

As datas móveis (Carnaval, Sexta-feira Santa, Corpus Christi) são calculadas
pela Páscoa, portanto valem para qualquer ano.

## Manutenção

- Feriado novo ou estadual/municipal que a prefeitura decretar no ano:
  adicionar uma linha em `getHolidays()` no `src/lib/holidays.ts`.
- Há testes em `src/lib/holidays.test.ts` cobrindo as datas de 2026 e 2027.
- Datas móveis conferidas: 2026 — Carnaval 17/02, Sexta-feira Santa 03/04,
  Corpus Christi 04/06.
