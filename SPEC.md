# SPEC.md — MVP Agenda Dra. Michelle Tiago

> **Escopo:** Apenas agendamentos — criar/editar/cancelar, visualização semana/dia, conflitos, notificações
> **Prazo:** 3 semanas
> **Definição de Pronto:** Deploy preview Vercel + testes unit/e2e verdes + Lighthouse > 90 + console limpo

---

## 1. Visão Geral

**Problema:** Profissionais de saúde precisam de agenda simples, confiável e rápida para gerenciar consultas.

**Solução:** Web app (SaaS) focado 100% em agendamento — sem faturamento, sem prontuário, sem extras.

**Usuários:**

- Admin (dono da agenda): CRUD completo, configurações
- Paciente (futuro): self-booking via link público (fora do MVP)

---

## 2. Funcionalidades (MVP)

### 2.1 Autenticação & Acesso

| ID  | Feature                                              | Critério de Aceite                            |
| --- | ---------------------------------------------------- | --------------------------------------------- |
| A1  | Login/Register via Supabase Auth (email + senha)     | Usuário autenticado → redirect para `/agenda` |
| A2  | Sessão persistente (refresh token)                   | Refresh automático, logout apenas explícito   |
| A3  | Rota protegida (`/agenda/*`)                         | Não autenticado → redirect `/login`           |
| A4  | Perfil do profissional (nome, especialidade, avatar) | Edição em `/configuracoes`                    |

### 2.2 Visualização da Agenda

| ID  | Feature                                                | Critério de Aceite                               |
| --- | ------------------------------------------------------ | ------------------------------------------------ |
| V1  | Visualização **Semana** (7 dias, horas 07h-20h)        | Grid responsivo, scroll vertical, hoje destacado |
| V2  | Visualização **Dia** (horas 07h-20h, 30min slots)      | Lista vertical, altura proporcional à duração    |
| V3  | Navegação: semana anterior/próxima, hoje, jump to date | Keyboard (←/→) + buttons                         |
| V4  | Filtro por profissional (se multi-profissional)        | Select no header, persiste em localStorage       |
| V5  | Indicadores visuais: ocupado, livre, conflito          | Cores semânticas (tokens), tooltip com detalhes  |

### 2.3 Gestão de Agendamentos (CRUD)

| ID  | Feature                                                           | Critério de Aceite                                             |
| --- | ----------------------------------------------------------------- | -------------------------------------------------------------- |
| C1  | **Criar**: click em slot livre → modal (paciente, duração, notas) | Validação Zod, conflito detectado → bloqueia + avisa           |
| C2  | **Editar**: click em agendamento → modal pré-preenchido           | Permite mover (drag-drop opcional v2), mudar duração, paciente |
| C3  | **Cancelar**: botão no modal → confirmação → status `cancelado`   | Soft delete, mantém histórico, libera slot                     |
| C4  | **Conflito**: não permitir sobreposição mesmo profissional        | Validação server-side (Supabase RLS/trigger) + client-side     |
| C5  | **Duração**: 15/30/45/60 min (configurável por profissional)      | Select no modal, default 30min                                 |

### 2.4 Pacientes (Mínimo)

| ID  | Feature                                                          | Critério de Aceite                            |
| --- | ---------------------------------------------------------------- | --------------------------------------------- |
| P1  | Seleção de paciente existente (autocomplete busca nome/telefone) | Debounce 300ms, cria novo se não existe       |
| P2  | Cadastro rápido inline (nome, telefone, email, convênio)         | Modal lateral, salva e vincula ao agendamento |

### 2.5 Notificações (MVP: Toast + Email)

| ID  | Feature                                                                  | Critério de Aceite                                           |
| --- | ------------------------------------------------------------------------ | ------------------------------------------------------------ |
| N1  | Toast local: sucesso/erro/create/update/delete                           | uiverse.io toast component, auto-dismiss 4s                  |
| N2  | Email confirmação agendamento (Supabase Edge Function + Resend/SendGrid) | Template HTML, variáveis: paciente, data, hora, profissional |
| N3  | Email lembrete 24h antes (cron job Supabase pg_cron)                     | Job diário 08h, envia para agendamentos do dia seguinte      |

### 2.6 Configurações do Profissional

| ID  | Feature                                                            | Critério de Aceite                      |
| --- | ------------------------------------------------------------------ | --------------------------------------- |
| S1  | Horário de trabalho (dias da semana, início/fim, intervalo almoço) | Gera slots disponíveis automaticamente  |
| S2  | Duração padrão de consulta                                         | Usado no modal de criação               |
| S3  | Buffer entre consultas (0/5/10/15 min)                             | Bloqueia slots adjacentes               |
| S4  | Fuso horário (IANA)                                                | Persiste no profile, usado em all dates |

---

## 3. Não-Funcionais

| Categoria           | Requisito                                                                  | Validação              |
| ------------------- | -------------------------------------------------------------------------- | ---------------------- |
| **Performance**     | LCP < 2.5s, CLS < 0.1, INP < 200ms                                         | Lighthouse CI no PR    |
| **Acessibilidade**  | WCAG 2.1 AA (contraste, foco, ARIA, teclado)                               | axe-core zero critical |
| **Mobile**          | 375px/414px real — touch targets ≥ 44px, sem overflow                      | Teste device real      |
| **Segurança**       | RLS no Supabase (usuário só vê seus dados), LGPD (consentimento, exclusão) | Testes de autorização  |
| **Confiabilidade**  | Transações atômicas (agendamento + notificação), retry/fallback email      | Testes integração      |
| **Observabilidade** | Console limpo, erros no Sentry (opcional v2)                               | Verification checklist |

---

## 4. Modelo de Dados (Supabase/Postgres)

```sql
-- Perfil do profissional (extends auth.users via trigger)
create table professional_profiles (
  user_id uuid primary key references auth.users(id),
  full_name text not null,
  specialty text,
  avatar_url text,
  timezone text default 'America/Sao_Paulo',
  default_duration_min int default 30,
  buffer_min int default 0,
  working_hours jsonb not null default '{
    "monday":    {"start": "08:00", "end": "18:00", "break_start": "12:00", "break_end": "13:00"},
    "tuesday":   {"start": "08:00", "end": "18:00", "break_start": "12:00", "break_end": "13:00"},
    "wednesday": {"start": "08:00", "end": "18:00", "break_start": "12:00", "break_end": "13:00"},
    "thursday":  {"start": "08:00", "end": "18:00", "break_start": "12:00", "break_end": "13:00"},
    "friday":    {"start": "08:00", "end": "17:00", "break_start": "12:00", "break_end": "13:00"},
    "saturday":  null,
    "sunday":    null
  }'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Pacientes
create table patients (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references professional_profiles(user_id),
  full_name text not null,
  phone text,
  email text,
  insurance text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Agendamentos
create table appointments (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references professional_profiles(user_id),
  patient_id uuid not null references patients(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null check (status in ('scheduled', 'completed', 'cancelled', 'no_show')) default 'scheduled',
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  -- Constraint: sem sobreposição para mesmo profissional
  exclude using gist (
    professional_id with =,
    tsrange(starts_at, ends_at) with &&
  ) where (status = 'scheduled')
);

-- RLS
alter table professional_profiles enable row level security;
alter table patients enable row level security;
alter table appointments enable row level security;

create policy "own_data" on professional_profiles for all using (auth.uid() = user_id);
create policy "own_patients" on patients for all using (professional_id = auth.uid());
create policy "own_appointments" on appointments for all using (professional_id = auth.uid());
```

---

## 5. Telas / Rotas

| Rota                | Descrição                                           | Auth      |
| ------------------- | --------------------------------------------------- | --------- |
| `/login`            | Login/Register                                      | Público   |
| `/agenda`           | Redirect → `/agenda/semana`                         | Protegida |
| `/agenda/semana`    | Grid semana (default)                               | Protegida |
| `/agenda/dia`       | Visualização dia                                    | Protegida |
| `/agendamento/novo` | Modal create (query param `?slot=2024-01-15T10:00`) | Protegida |
| `/agendamento/:id`  | Modal edit/view                                     | Protegida |
| `/pacientes`        | Lista + busca + novo                                | Protegida |
| `/configuracoes`    | Perfil, horários, duração, buffer, timezone         | Protegida |

---

## 6. Componentes-Chave (Frontend)

| Componente            | Fonte                                        | Adaptação                                    |
| --------------------- | -------------------------------------------- | -------------------------------------------- |
| `CalendarWeekView`    | Custom (uiverse.io calendar base)            | Tokens, slots 30min, drag-drop v2            |
| `CalendarDayView`     | Custom                                       | Lista virtualizada, height proporcional      |
| `AppointmentModal`    | Shadcn Dialog + Form (React Hook Form + Zod) | Validação cliente + server                   |
| `SlotPicker`          | uiverse.io time picker                       | Tokens, step 15min                           |
| `PatientAutocomplete` | Shadcn Combobox + TanStack Query             | Debounce, create inline                      |
| `Toast`               | uiverse.io toast                             | Tokens, 4 tipos (success/error/warning/info) |
| `ConflictBanner`      | Custom                                       | Inline no modal, cor `--color-error`         |
| `SettingsForm`        | Shadcn Form                                  | Sections: perfil, horários, preferências     |

---

## 7. Tasks Iniciais (Sugestão de Breakdown)

```
tasks/
├── 001-auth-setup.md              # Supabase Auth + RLS + profile trigger
├── 002-db-schema.md               # Migrations: profiles, patients, appointments
├── 003-calendar-week-view.md      # Grid semana + navegação + tokens
├── 004-calendar-day-view.md       # Lista dia + navegação
├── 005-appointment-crud.md        # Create/Edit/Cancel modal + validação conflito
├── 006-patient-management.md      # Autocomplete + create inline
├── 007-notifications-toast.md     # uiverse.io toast + hook useToast
├── 008-email-confirmation.md      # Edge Function + Resend template
├── 009-reminder-cron.md           # pg_cron job 24h antes
├── 010-settings-page.md           # Horários, duração, buffer, timezone
├── 011-design-tokens.md           # standards/frontend.md → tokens da marca
├── 012-e2e-tests.md               # Playwright: fluxos principais
├── 013-a11y-audit.md              # axe + Lighthouse CI
└── 014-deploy-vercel.md           # Preview + env vars + domains
```

---

## 8. Critérios de Aceite do MVP (Definition of Done)

- [ ] Usuário autentica e vê agenda semana/dia vazia
- [ ] Cria agendamento em slot livre → aparece na grade
- [ ] Tenta criar em slot ocupado → erro claro (conflito)
- [ ] Edita agendamento (move, muda duração, paciente)
- [ ] Cancela agendamento → libera slot
- [ ] Pacientes: busca, cria inline, vincula
- [ ] Configurações: horários, duração, buffer, timezone persistem
- [ ] Toast aparece em todas ações (sucesso/erro)
- [ ] Email confirmação enviado (verificar inbox/test)
- [ ] Lighthouse CI > 90 (Perf/A11y/BP/SEO)
- [ ] axe-core zero violations críticas
- [ ] Mobile 375px testado real (touch, scroll, modais)
- [ ] Console zero errors/warnings
- [ ] Testes unitários (utils, hooks) + e2e (fluxos) verdes
- [ ] Deploy preview Vercel funcional

---

## 9. Riscos & Mitigações

| Risco                                         | Prob. | Impacto | Mitigação                                                         |
| --------------------------------------------- | ----- | ------- | ----------------------------------------------------------------- |
| Conflito de agendamento race condition        | Média | Alto    | Constraint `exclude` no PG + validação client                     |
| Email não entrega (spam/bounce)               | Média | Médio   | Resend/SendGrid com webhook bounce, retry logic                   |
| Timezone bugs (DST, viagem)                   | Baixa | Alto    | IANA timezone no profile, sempre UTC no DB, conversão na UI       |
| Performance grid semana (muitos agendamentos) | Baixa | Médio   | Virtualização, paginação por semana, índice PG                    |
| Lovable reescreve history                     | Alta  | Alto    | **Não force push**, commits incrementais, branch `main` protegida |

---

## 10. Decisões Técnicas Registradas

| Data       | Decisão                                     | Justificativa                                         |
| ---------- | ------------------------------------------- | ----------------------------------------------------- |
| 2024-08-19 | TanStack Query + Router                     | Server state + routing type-safe, DX                  |
| 2024-08-19 | Supabase (Auth + Postgres + Edge Functions) | BaaS completo, RLS nativo, custo zero início          |
| 2024-08-19 | Shadcn UI + uiverse.io                      | Acessíveis, customizáveis via tokens, sem vendor lock |
| 2024-08-19 | Drizzle ORM (pendente)                      | Type-safe, leve, migrações SQL nativas                |
| 2024-08-19 | Vitest + Playwright                         | Unit rápido, e2e real browser                         |
| 2024-08-19 | Constraint `exclude` para conflitos         | Garantia no banco, não só app                         |

---

> **Próximo:** Quebrar em `tasks/001-auth-setup.md` etc. e iniciar implementação seguindo o fluxo do CLAUDE.md.
