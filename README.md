# Dra. Michelle Tiago — Sistema de Gestão Clínica Odontológica

Plataforma integrada de agendamentos, prontuários, gestão de estoque, controle financeiro e confirmações automatizadas desenvolvida sob medida para o consultório da **Dra. Michelle Barbosa Tiago** (Cirurgiã-Dentista · CRO-AP 596 · Macapá/AP).

---

## 1. Visão Geral da Aplicação

O sistema combina uma presença web pública de alta conversão para apresentação da clínica e solicitação de consultas com um painel administrativo completo (`/painel`) para a gestão diária do consultório odontológico.

### Principais Pilares:

- **Agendamento Inteligente & Autoatendimento:** Pacientes solicitam horários pela web e confirmam/cancelam presença via links seguros individuais enviados por WhatsApp.
- **Notificações Híbridas:** Lembretes disparados em 1 clique pela recepção via WhatsApp Web e alertas instantâneos de confirmação/cancelamento encaminhados por e-mail transacional (ativando push nativo no smartphone da dentista).
- **Gestão Clínica Completa:** Prontuário, anamnese, odontograma, relacionamento e retornos preventivos (CRC).
- **Gestão Operacional & Estoque:** Controle de entradas/saídas de materiais clínicos, cálculo de consumo e alertas visuais de reposição mínima.
- **Controle Financeiro:** Faturamento diário/mensal, orçamentos, recibos e exportação para PDF e planilhas Excel.

---

## 2. Stack Tecnológica

| Camada                       | Tecnologia                                                                                    | Descrição                                                            |
| :--------------------------- | :-------------------------------------------------------------------------------------------- | :------------------------------------------------------------------- |
| **Framework Full-Stack**     | [TanStack Start](https://tanstack.com/start) + [Vite 8](https://vitejs.dev/)                  | SSR nativo, Server Functions seguras e renderização híbrida rápida.  |
| **Roteamento & Estado**      | [TanStack Router](https://tanstack.com/router) + [TanStack Query](https://tanstack.com/query) | Roteamento type-safe baseado em arquivos e cache assíncrono.         |
| **Interface & Estilo**       | [React 19](https://react.dev/), [Tailwind CSS v4](https://tailwindcss.com/)                   | Design tokens elegantes, Radix UI primitives e Lucide Icons.         |
| **Backend & Banco de Dados** | [Supabase](https://supabase.com/) (PostgreSQL)                                                | Auth, Row Level Security (RLS), Realtime WebSockets e RPCs.          |
| **Geração de Documentos**    | `jspdf`, `jspdf-autotable`, `xlsx`                                                            | Emissão de recibos clínicos, orçamentos e relatórios em PDF e Excel. |
| **Testes & Qualidade**       | [Vitest](https://vitest.dev/), Happy DOM, ESLint 9, Prettier                                  | Testes unitários e de integração com cobertura de regras de negócio. |

---

## 3. Estrutura de Rotas

```
src/routes/
├── __root.tsx                      # Layout base, providers globais e tags de metadados
├── index.tsx                       # Página inicial institucional da clínica
├── sobre.tsx                       # Apresentação da Dra. Michelle, CRO e trajetória
├── tratamentos.tsx                 # Catálogo detalhado de procedimentos odontológicos
├── contato.tsx                     # Endereço, horários, mapa e canais de contato
├── agendar.tsx                     # Formulário público de solicitação de agendamento
├── auth.tsx                        # Tela de autenticação da equipe médica/recepção
├── confirmar/
│   └── $token.tsx                  # Confirmação segura de presença com validação em 2 etapas
├── cancelar/
│   └── $token.tsx                  # Cancelamento seguro com registro do motivo
└── _authenticated/
    ├── route.tsx                   # Middleware de proteção por autenticação (Supabase)
    └── painel.tsx                  # Painel central unificado (Agenda, Prontuário, Estoque, Financeiro)
```

---

## 4. Módulos do Sistema Clínico

### 4.1. Agenda & Gestão de Consultas

- Visualização por dia, semana e lista.
- Detecção e prevenção automática de conflitos de horário.
- Bloqueio de intervalos operacionais e cirúrgicos.
- Status do agendamento: `Agendado (Pendente)`, `Confirmado`, `Concluído` e `Cancelado`.

### 4.2. Sistema de Notificações & Confirmações

- **Envio Assistido (WhatsApp Web):** Disparo de mensagens padronizadas em 1 clique sem custo de API e sem risco de banimento de número.
- **Links com Token Único:** Rotas `/confirmar/<token>` e `/cancelar/<token>` blindadas contra crawlers automáticos (mutação exclusivamente via `POST`).
- **Alertas Imediatos na Tela de Bloqueio:** E-mail transacional com assunto _front-loaded_ (`[CONFIRMADA] Paciente — Horário`) disparado para `dramichellebarbosatiago@gmail.com`.
- **Sincronização em Tempo Real:** Atualização instantânea da recepção via Supabase Realtime com avisos sonoros e toasts visuais.

### 4.3. Prontuário, Pacientes & CRC

- Cadastro completo de fichas com histórico clínico e anamnese.
- Acompanhamento pós-atendimento e retornos periódicos de prevenção (6 em 6 meses).
- Filtro inteligente de aniversariantes do mês para ações de relacionamento.

### 4.4. Controle de Estoque Odontológico

- Cadastro de insumos (resinas, anestésicos, luvas, fios de sutura, brocas, etc.).
- Categorização clínica e rastreamento de lote e data de validade.
- Alerta visual para itens abaixo da quantidade mínima recomendada.

### 4.5. Gestão Financeira & Faturamento

- Acompanhamento de fluxo de caixa (entradas recebidas vs. pendentes).
- Emissão de recibos odontológicos padronizados com logo e dados do CRO.
- Exportação de faturamento detalhado em planilhas Excel (`.xlsx`) e relatórios PDF.

---

## 5. Arquitetura de Dados (Supabase PostgreSQL)

- **`appointments`**: Registro das consultas (data, horário, paciente, procedimento, status, canal de lembrete e observações).
- **`patients`**: Base central de pacientes (nome, CPF, contato, data de nascimento, histórico clínico).
- **`inventory_items`**: Itens de estoque com controle de estoque mínimo e unidade de medida.
- **`financial_transactions`**: Entradas, orçamentos, formas de pagamento e status de liquidação.
- **Funções de Segurança (RPCs):**
  - `confirm_appointment_by_id(p_appointment_id uuid)` (`SECURITY DEFINER`)
  - `cancel_appointment_by_id(p_appointment_id uuid, p_reason text)` (`SECURITY DEFINER`)

---

## 6. Configuração e Execução Local

### Pré-requisitos:

- Node.js 20+ ou 22 LTS
- NPM 10+

### Instalação:

```bash
git clone https://github.com/SEU_USUARIO/dramichelletiago.git
cd dramichelletiago
npm install
```

### Variáveis de Ambiente (`.env`):

```ini
# Supabase (Banco de Dados e Autenticação)
VITE_SUPABASE_URL="https://seu-projeto.supabase.co"
VITE_SUPABASE_ANON_KEY="sb_publishable_..."
SUPABASE_SERVICE_ROLE_KEY="sb_secret_..."

# E-mail Transacional
RESEND_API_KEY="re_..."
```

### Comandos de Desenvolvimento:

```bash
# Iniciar servidor de desenvolvimento (porta 3000)
npm run dev

# Executar bateria de testes unitários
npm test

# Executar testes em modo único (CI)
npm run test:run

# Validar tipagem e linting
npm run lint

# Formatar código com Prettier
npm run format

# Gerar build de produção para Vercel
npm run build
```

---

## 7. Documentos Técnicos e RFCs

- [docs/CONFIRMATION_SYSTEM.md](docs/CONFIRMATION_SYSTEM.md): Especificação do fluxo de confirmação e disparo via WhatsApp.
- [docs/EXPORT_SYSTEM.md](docs/EXPORT_SYSTEM.md): Arquitetura de exportação de dados para relatórios.
- [docs/designs/sistema-de-notificacoes-clinicas.md](docs/designs/sistema-de-notificacoes-clinicas.md): RFC de arquitetura híbrida de notificações e push móvel para a dentista.
