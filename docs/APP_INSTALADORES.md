# Apps instaláveis — Painel desktop (Windows/Mac) e PWA (iOS/Android)

O painel da clínica (`/painel`) pode ser usado como aplicativo nas quatro
plataformas, a partir de **uma única base de código**: o próprio site.

| Destino | Tecnologia | Artefato | Assinatura |
|---|---|---|---|
| macOS | Electron (`desktop/`) | `.dmg` (Apple Silicon + Intel) | Sem assinatura |
| Windows | Electron (`desktop/`) | `.exe` (NSIS) | Sem assinatura |
| iOS | PWA (manifest + SW) | "Adicionar à Tela de Início" | N/A |
| Android | PWA (manifest + SW) | Instalação pelo Chrome | N/A |

## Desktop — como gerar os instaladores

```bash
cd desktop
npm install          # electron + electron-builder
npm run dist         # gera DMG (arm64 + x64) e EXE em desktop/release/
npm run dist:mac     # só macOS
npm run dist:win     # só Windows
```

Artefatos em `desktop/release/`:

- `Painel Dra. Michelle-1.0.1-arm64.dmg` — Macs Apple Silicon (M1…)
- `Painel Dra. Michelle-1.0.1.dmg` — Macs Intel
- `Painel-Dra-Michelle-Setup-1.0.1.exe` — Windows 10/11

### Primeira abertura sem assinatura

Os binários não são assinados (uso interno, sem certificado pago):

- **macOS**: no primeiro abrir, clique com o botão direito no app → **Abrir** →
  **Abrir** (ou Ajustes → Privacidade e Segurança → "Abrir mesmo assim").
- **Windows**: o SmartScreen pode avisar — **Mais informações** → **Executar
  assim mesmo**.

Comprando um certificado de assinatura (Apple Developer US$99/ano; Windows
Code Signing) e configurando `mac.identity` / `win.certificateFile` no
`desktop/electron-builder.yml`, os avisos desaparecem.

### Como funciona o wrapper

- Carrega `https://dramichelletiago.com.br/painel` (autenticação Supabase
  persiste entre sessões — login uma vez só).
- Links externos (WhatsApp `wa.me`, Google Calendar) abrem no navegador do
  sistema, nunca dentro do app. No Windows, links de WhatsApp abrem direto
  no app WhatsApp Desktop (protocolo `whatsapp://`), com fallback para o
  navegador se ele não estiver instalado; no Mac abrem no navegador.
- Instância única (segundo clique traz a janela existente à frente).
- Seguro por padrão: `contextIsolation`, `sandbox`, `nodeIntegration: false`.

## iOS / Android — PWA

O site é um **PWA instalável** (manifest com ícones 192/512 + maskable,
service worker de instalabilidade em `public/sw.js`, metas iOS no root).

- **iPhone/iPad**: abra o site no Safari → Compartilhar → **Adicionar à Tela
  de Início**. O painel abre em tela cheia, sem barra do Safari.
- **Android**: abra no Chrome → menu ⋮ → **Instalar app**. Aparece na gaveta
  de apps como "Dra. Michelle".
- O app não precisa de atualização: o conteúdo é sempre a versão atual do
  site. Só o ícone/manifest mudam com novo deploy.

Atalhos de toque longo (Android/iOS): "Agendar consulta" e "Painel da
clínica" (`manifest.webmanifest` → `shortcuts`).

## Lojas oficiais (futuro, opcional)

- **Play Store**: um TWA (Trusted Web Activity, via Bubblewrap) publica esta
  mesma PWA como app nativo — custo único US$25 de conta.
- **App Store**: exigiria wrapper Capacitor + conta Apple Developer US$99/ano.
  Para uso interno do painel, o "Adicionar à Tela de Início" cobre sem custo.
