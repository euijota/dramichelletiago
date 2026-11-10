# Frontend Standards — Design System & Componentes

> Este arquivo deve ser copiado para `project-root/standards/frontend.md` e adaptado por projeto.

---

## 1. Design Tokens (Obrigatório)

Defina **uma vez** no `:root` ou CSS-in-JS theme. Nunca hardcode valores em componentes.

```css
:root {
  /* Color Primitives */
  --color-primary-50: #eff6ff;
  --color-primary-100: #dbeafe;
  --color-primary-500: #3b82f6;
  --color-primary-600: #2563eb;
  --color-primary-700: #1d4ed8;
  --color-primary-900: #1e3a8a;

  --color-neutral-0: #ffffff;
  --color-neutral-50: #fafafa;
  --color-neutral-100: #f5f5f5;
  --color-neutral-500: #737373;
  --color-neutral-900: #171717;

  --color-success: #16a34a;
  --color-warning: #f59e0b;
  --color-error: #dc2626;

  /* Semantic Colors (o que componentes usam) */
  --color-bg: var(--color-neutral-0);
  --color-bg-muted: var(--color-neutral-50);
  --color-text: var(--color-neutral-900);
  --color-text-muted: var(--color-neutral-500);
  --color-border: var(--color-neutral-200);
  --color-border-focus: var(--color-primary-500);

  --color-primary: var(--color-primary-600);
  --color-primary-hover: var(--color-primary-700);
  --color-primary-text: var(--color-neutral-0);

  /* Spacing Scale (base 4px) */
  --space-1: 0.25rem; /* 4px */
  --space-2: 0.5rem; /* 8px */
  --space-3: 0.75rem; /* 12px */
  --space-4: 1rem; /* 16px */
  --space-5: 1.25rem; /* 20px */
  --space-6: 1.5rem; /* 24px */
  --space-8: 2rem; /* 32px */
  --space-10: 2.5rem; /* 40px */
  --space-12: 3rem; /* 48px */

  /* Radius */
  --radius-sm: 0.25rem; /* 4px */
  --radius-md: 0.375rem; /* 6px */
  --radius-lg: 0.5rem; /* 8px */
  --radius-xl: 0.75rem; /* 12px */
  --radius-full: 9999px;

  /* Typography */
  --font-sans: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, "Fira Code", monospace;

  --text-xs: 0.75rem; /* 12px */
  --text-sm: 0.875rem; /* 14px */
  --text-base: 1rem; /* 16px */
  --text-lg: 1.125rem; /* 18px */
  --text-xl: 1.25rem; /* 20px */
  --text-2xl: 1.5rem; /* 24px */
  --text-3xl: 1.875rem; /* 30px */

  --font-normal: 400;
  --font-medium: 500;
  --font-semibold: 600;
  --font-bold: 700;

  /* Shadows */
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);

  /* Transitions */
  --transition-fast: 150ms ease;
  --transition-base: 200ms ease;
  --transition-slow: 300ms ease;

  /* Z-index */
  --z-dropdown: 100;
  --z-sticky: 200;
  --z-modal: 300;
  --z-popover: 400;
  --z-tooltip: 500;
}
```

---

## 2. Como Adaptar Componentes do uiverse.io

### Passo a Passo

1. **Copie** o HTML/CSS do componente no uiverse.io
2. **Substitua** todos os valores hardcoded por `var(--seu-token)`
3. **Prefixe** classes com namespace do projeto (ex: `.app-btn`, `.app-card`)
4. **Teste** estados: hover, focus, active, disabled, loading
5. **Valide** A11y (axe) + mobile real

### Exemplo: Botão do uiverse → Seu Design System

```html
<!-- ANTES (uiverse original) -->
<button class="uiverse-btn">Clique</button>
<style>
  .uiverse-btn {
    background: #2563eb;
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    border: none;
    cursor: pointer;
  }
  .uiverse-btn:hover {
    background: #1d4ed8;
  }
</style>

<!-- DEPOIS (adaptado) -->
<button class="app-btn app-btn--primary">Clique</button>
<style>
  .app-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-5);
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    line-height: 1.5;
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    transition:
      background var(--transition-fast),
      box-shadow var(--transition-fast);
  }
  .app-btn:focus-visible {
    outline: 2px solid var(--color-border-focus);
    outline-offset: 2px;
  }
  .app-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Variants */
  .app-btn--primary {
    background: var(--color-primary);
    color: var(--color-primary-text);
  }
  .app-btn--primary:hover:not(:disabled) {
    background: var(--color-primary-hover);
  }
  .app-btn--secondary {
    background: var(--color-bg-muted);
    color: var(--color-text);
    border: 1px solid var(--color-border);
  }
  .app-btn--secondary:hover:not(:disabled) {
    background: var(--color-neutral-100);
  }
</style>
```

---

## 3. Checklist por Componente (Copy-paste no PR)

```markdown
## Component Checklist: [Nome do Componente]

### Estados Implementados

- [ ] Default
- [ ] Hover
- [ ] Focus (focus-visible)
- [ ] Active/Pressed
- [ ] Disabled
- [ ] Loading (se async)
- [ ] Error (se input)

### Acessibilidade

- [ ] Semântica HTML correta (button, input, nav, etc.)
- [ ] ARIA labels/describedby onde necessário
- [ ] Contraste WCAG AA (4.5:1 texto, 3:1 UI)
- [ ] Navegação 100% por teclado
- [ ] focus-visible visível e consistente
- [ ] Screen reader testado (NVDA/VoiceOver)

### Tokens & Consistência

- [ ] Zero hardcode (cores, spacing, radius, font, shadow)
- [ ] Usa tokens semânticos (--color-primary, não --color-primary-600)
- [ ] Espaçamento na scale (--space-*)
- [ ] Tipografia na scale (--text-*)

### Responsivo & Performance

- [ ] Mobile-first (375px/414px testado real)
- [ ] Sem layout shift (CLS = 0)
- [ ] Animações só transform/opacity
- [ ] Sem dependências desnecessárias

### Qualidade

- [ ] Console limpo (0 errors, 0 warnings)
- [ ] Lighthouse A11y ≥ 90
- [ ] Código revisado (self-review + pair se crítico)
```

---

## 4. Estrutura de Pastas Sugerida

```
src/
├── components/
│   ├── ui/              # Componentes base (Button, Input, Card, Modal)
│   │   ├── Button/
│   │   │   ├── Button.tsx
│   │   │   ├── Button.css      # ou .module.css / styled-components
│   │   │   ├── Button.stories.tsx
│   │   │   └── index.ts
│   │   └── ...
│   ├── forms/           # Composições de formulário
│   ├── layout/          # Header, Footer, Sidebar, Container
│   └── feedback/        # Toast, Alert, Skeleton, Spinner
├── styles/
│   ├── tokens.css       # Design tokens (import global)
│   ├── globals.css      # Reset, base, utilities
│   └── themes/          # dark.css, light.css, brand-a.css
└── hooks/
    └── useMediaQuery.ts
```

---

## 5. Referências Rápidas

- **uiverse.io** — Componentes prontos para adaptar
- **WCAG 2.1 AA Checklist** — https://www.w3.org/WAI/WCAG21/quickref/
- **axe-core** — `npx @axe-core/cli http://localhost:3000`
- **Lighthouse CI** — `npm i -D @lhci/cli && lhci autorun`
- **CSS Variables Guide** — https://developer.mozilla.org/en-US/docs/Web/CSS/Using_CSS_custom_properties
