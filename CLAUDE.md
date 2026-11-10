# CLAUDE.md — Regras Obrigatórias (Universal Template)

> **COPIE ESTE ARQUIVO PARA A RAIZ DE CADA NOVO PROJETO.**
> A IA **NÃO PODE ESCREVER CÓDIGO** antes de preencher a seção `## CONTEXTO DO PROJETO` abaixo.

---

## ⚡ 6 REGRAS INEGOCIÁVEIS (Skills Codificadas)

### 01. GRILL ME — Alinhamento Antes de Código

- **NUNCA** inicie implementação sem: objetivo claro, restrições, decisões pendentes, definição de "pronto".
- Se algo estiver vago → **pare e pergunte**. Use `/grill-me` ou faça as perguntas diretamente.
- Regra: _Mais vale 15 min de perguntas que 4h de refator._

### 02. FRONTEND DESIGN — Zero "AI Slop"

- Proibido: dashboards cinzentos, Tailwind default sem personalização, componentes genéricos.
- Obrigatório: identidade visual (cores, tipografia, espaçamento), hierarquia clara, microinterações, estados (hover, focus, loading, error, empty).
- Se não houver design system → a IA **propõe um** (tokens de cor, type scale, spacing scale) e pede aprovação.

### 03. SYSTEMATIC DEBUGGING — Causa Raiz ou Nada

- **NUNCA** altere código para "testar se conserta".
- Fluxo obrigatório: reproduza → leia stack trace/logs → hipótese única → teste isolado → valide → commit.
- Um commit = uma hipótese testada.

### 04. WEBAPP TESTING — Navegador Real

- Testes unitários **não substituem** teste no browser.
- Use Puppeteer/Playwright (via MCP) para: abrir URL, clicar, preencher, checar console, screenshot.
- "Funciona na minha máquina" = screenshots + logs de console limpos.

### 05. WEB QUALITY AUDIT — Não-Funcionais São Requisitos

- Toda entrega passa por: LCP/CLS/INP (Core Web Vitals), A11y (axe/WCAG 2.1 AA), SEO básico, mobile real (375px/414px).
- Falha em qualquer um = **bloqueia entrega**.

### 06. VERIFICATION BEFORE COMPLETION — Evidências > Promessas

- A IA **não pode declarar "pronto"** sem apresentar:
  - ✅ Testes passando (unit + e2e)
  - ✅ Diff validado (git diff --stat)
  - ✅ Screenshots/vídeo do fluxo funcionando
  - ✅ Console limpo (zero errors/warnings)
  - ✅ Auditoria rápida (Lighthouse/A11y) — score ≥ 90

---

## 📋 CONTEXTO DO PROJETO — **PREENCHA ANTES DE COMEÇAR**

> **A IA DEVE RECUSAR-SE A CODAR SE ALGUM CAMPO ABAIXO ESTIVER VAZIO.**
> Use perguntas diretas para preencher.

| Campo                     | Valor                                                                                                                                                                                                       | Status        |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| **Cliente / Projeto**     | `Dra. Michelle Tiago`                                                                                                                                                                                       | ✅ Preenchido |
| **Tipo de App**           | `SaaS / Dashboard`                                                                                                                                                                                          | ✅ Preenchido |
| **Stack Principal**       | `TypeScript / React 18 / Vite / TanStack (Query, Router)`                                                                                                                                                   | ✅ Preenchido |
| **Banco de Dados**        | `Supabase (Postgres)`                                                                                                                                                                                       | ✅ Preenchido |
| **Auth**                  | `Supabase Auth`                                                                                                                                                                                             | ✅ Preenchido |
| **Deploy / Infra**        | `Vercel`                                                                                                                                                                                                    | ✅ Preenchido |
| **Design System**         | `Tailwind + Tokens / Shadcn UI`                                                                                                                                                                             | ✅ Preenchido |
| **Testes**                | `Vitest (+ Playwright para e2e)`                                                                                                                                                                            | ✅ Preenchido |
| **Prazo / Escopo**        | `MVP em 3 semanas — apenas agendamentos (criar/editar/cancelar, visualização semana/dia, conflitos, notificações)`                                                                                          | ✅ Preenchido |
| **Definição de "Pronto"** | `Deploy preview Vercel + testes unit/e2e verdes + Lighthouse > 90 + console limpo`                                                                                                                          | ✅ Preenchido |
| **Restrições Técnicas**   | `LGPD obrigatório / Sem IE11 / Lovable connected (não reescrever history)`                                                                                                                                  | ✅ Preenchido |
| **Decisões Já Tomadas**   | `TanStack Query para server state, TanStack Router, Supabase client, Shadcn UI, Zod validação`                                                                                                              | ✅ Preenchido |
| **Decisões Pendentes**    | `Charts library (provavelmente desnecessário p/ agenda pura), ORM (Drizzle vs Prisma vs raw Supabase), Component strategy: Shadcn + uiverse.io para componentes de agenda (calendário, slot picker, toast)` | ✅ Preenchido |

---

## 🎯 FLUXO OBRIGATÓRIO PARA QUALQUER TAREFA

```
1. LEIA este CLAUDE.md por completo
2. SE "CONTEXTO DO PROJETO" tem ⬜ Pendente → PERGUNTE ao usuário (Grill Me)
3. ESCREVA SPEC.md (1 pág: o quê, por que, critérios de aceite)
4. QUEBRE em tasks/ (atômicas, uma por commit)
5. IMPLEMENTE seguindo: Systematic Debugging → Webapp Testing → Web Quality Audit
6. ANTES DE DIZER "PRONTO": rode Verification Checklist (abaixo)
7. ATUALIZE memory/decisions.md com decisões tomadas
```

---

## ✅ VERIFICATION CHECKLIST (Copy-paste no final de cada task)

```markdown
## Verification — Task: [nome da task]

- [ ] Testes unitários passam (`npm test`)
- [ ] Testes e2e passam (`npm run test:e2e`)
- [ ] `git diff --stat` revisto — sem lixo, sem console.log
- [ ] Screenshot/Vídeo do fluxo funcionando anexado
- [ ] Console do browser: **0 errors, 0 warnings**
- [ ] Lighthouse (Performance/A11y/Best Practices/SEO) ≥ 90
- [ ] A11y: axe-core sem violations críticas
- [ ] Mobile real testado (375px / 414px) — sem overflow, toque ok
- [ ] `memory/decisions.md` atualizado se houver decisão nova
```

---

## 📁 ESTRUTURA MÍNIMA ESPERADA

```
project-root/
├── CLAUDE.md           ← ESTE ARQUIVO (preenchido)
├── SPEC.md             ← Especificação da feature atual
├── tasks/              ← tasks/001-nome.md, tasks/002-...
├── memory/
│   ├── decisions.md    ← Log de decisões técnicas (data, o quê, por que)
│   └── architecture.md ← Visão geral da arquitetura
├── standards/
│   ├── coding.md       ← Convenções de código (naming, imports, errors)
│   ├── git.md          ← Commit messages, branch strategy, PR template
│   ├── review.md       ← Checklist de code review
│   └── frontend.md     ← **Tokens, componentes, uiverse.io, A11y**
└── src/                ← Código fonte
```

---

## 🎨 FRONTEND STANDARDS (Resumo — veja `standards/frontend.md`)

### Fonte de Componentes (Ordem de Prioridade)

1. **uiverse.io** — HTML/CSS/JS puros, MIT, sem dependências, customizáveis via CSS variables
2. **shadcn/ui / Radix / Headless UI** — Composição React complexa, acessíveis por default
3. **Criar do zero** — Só se não existir nada adequado nas acima

### Regra de Ouro

> **NUNCA** use componente "genérico Tailwind default" sem personalização.
> Se for do uiverse → **adapte os tokens** (cores, spacing, radius) pro design system do projeto via CSS variables.

### Checklist Rápido por Componente

- [ ] Estados: default, hover, focus, active, disabled, loading, error
- [ ] A11y: ARIA labels, focus-visible, contraste WCAG AA, teclado navegável
- [ ] Tokens: cores/spacing/radius/typography via `var(--token)` — zero hardcode
- [ ] Mobile-first: testado 375px / 414px real (não só devtools)
- [ ] Performance: sem layout shift, animações `transform/opacity` only

---

## 🔧 COMO USAR EM CADA NOVO PROJETO

1. `cp /path/to/this/CLAUDE.md ./CLAUDE.md`
2. Abra no editor → **preencha a tabela "CONTEXTO DO PROJETO"**
3. Se travar em algum campo → **pergunte ao cliente** (Grill Me)
4. Só então inicie: `opencode` / `antigravity` / `codex` → "Leia o CLAUDE.md e comece pela SPEC.md"

---

## 📌 NOTA PARA A IA

> **SEU PRIMEIRO PASSO EM QUALQUER SESSÃO:**
>
> 1. Leia `CLAUDE.md` e `SPEC.md` (se existir)
> 2. Verifique se `CONTEXTO DO PROJETO` está 100% preenchido
> 3. Se **qualquer campo** estiver `⬜ Pendente` → **PARE** e pergunte ao usuário
> 4. Só prossiga após confirmação do usuário
>
> **Não há exceção.** Isso evita retrabalho massivo.
