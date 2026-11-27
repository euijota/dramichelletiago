# SPEC — Assinatura eletrônica de documentos pelo paciente

> **Status:** aprovado em 2026-11-27 (seção 8 respondida: WhatsApp, TCLE + plano + orçamento, rubrica opcional). Tasks 1 a 7 feitas (a página do paciente e a conclusão com PDF final foram entregues juntas). E2E: `npm run test:e2e` com `supabase start`. Falta a aplicação em produção.
> **Fora do MVP de agenda** (ver `SPEC.md`). É uma feature nova do módulo clínico.
> **Não é parecer jurídico.** Validar o texto dos termos com advogado/CRO-AP antes de ir pra produção.

---

## 1. O quê e por quê

**Problema:** TCLE, plano de tratamento e orçamento são assinados em papel. Isso dá retrabalho (escanear, arquivar) e não deixa prova de *quando* e *qual versão* o paciente aceitou.

**Solução:** o paciente assina pelo celular, de dois jeitos:

- **Remoto:** link com token enviado por WhatsApp/e-mail.
- **Presencial:** QR code mostrado na tela do consultório, escaneado pelo celular do próprio paciente.

Todo PDF assinado sai com um **QR de verificação**, que qualquer pessoa pode usar pra conferir se o documento é autêntico.

**Nível jurídico:** assinatura eletrônica **avançada** (Lei 14.063/2020, art. 4º, II; MP 2.200-2/2001, art. 10 §2º).
Assinatura ICP-Brasil da Dra. Michelle (necessária pra dispensar o prontuário em papel) **fica fora deste escopo**.

---

## 2. Fluxo

```
Painel (Dra.)                    Servidor                         Celular (paciente)
─────────────                    ────────                         ──────────────────
Gera documento (jsPDF)  ──PDF──▶ grava em bucket privado
                                 calcula SHA-256 (congela)
                                 cria signature_request
                                 emite token (hash no banco)
[Enviar link] ou [QR na tela] ◀─ devolve URL /assinar/<token>
                                                         ───────▶ abre /assinar/<token>
                                 valida token + rate limit ◀───── pede verificação
                                 envia código 6 dígitos ────────▶ (WhatsApp/SMS)
                                 confere código ◀──────────────── digita código
                                 libera visualização ───────────▶ lê PDF, marca "li e concordo",
                                                                  rubrica opcional (canvas)
                                 grava evidência (imutável) ◀──── [Assinar]
                                 gera PDF final + manifesto + QR
Painel atualiza (Realtime) ◀──── status = signed
```

---

## 3. Modelo de dados (migration nova)

**Reaproveita o padrão de `appointment_link_tokens`:** token aleatório de 32 bytes, só o hash SHA-256 fica no banco, RLS sem política pra `anon`/`authenticated` e acesso só via `service_role`/RPC.

```sql
signature_requests
  id uuid pk
  patient_id uuid fk patients
  document_type text  check in ('tcle','plano_tratamento','orcamento','anamnese')
  document_path text          -- storage: signatures/<id>/original.pdf (bucket privado)
  document_sha256 text        -- check ~ '^[0-9a-f]{64}$'
  token_hash text unique      -- check ~ '^[0-9a-f]{64}$'
  channel text check in ('link','qr')
  expires_at timestamptz      -- link: 72h | qr: 15min
  otp_hash text, otp_expires_at timestamptz, otp_attempts int default 0
  status text check in ('pending','signed','expired','revoked')
  verify_code text unique     -- código curto público p/ /verificar (não é o token)
  created_by uuid, created_at timestamptz

signature_evidence           -- APPEND-ONLY: sem UPDATE/DELETE (trigger bloqueia)
  id uuid pk
  request_id uuid fk unique
  signed_at timestamptz
  document_sha256 text        -- repetido de propósito: prova o que foi assinado
  signed_pdf_path text, signed_pdf_sha256 text
  ip inet, user_agent text
  verification_method text    -- 'otp_whatsapp' | 'otp_sms' | 'otp_email'
  verified_phone_masked text  -- (96) 9****-1234
  consent_text_version text
  rubric_png_path text null
```

---

## 4. Rotas

| Rota | Acesso | Mostra |
|---|---|---|
| `/assinar/$token` | pública, só com token válido | só aquele documento; dados do paciente mascarados |
| `/verificar/$code` | pública | válido/inválido, data e hora, hash, nome mascarado. **Nenhum conteúdo clínico.** |
| painel → aba Documentos | autenticado (admin) | gerar, enviar link, mostrar QR, status, baixar assinado, revogar |

---

## 5. Critérios de aceite

| ID | Critério |
|---|---|
| S1 | Gerar documento no painel cria `signature_request` com o SHA-256 calculado **no servidor** |
| S2 | "Enviar link" manda a URL por WhatsApp/e-mail usando o `notify-server.ts` existente; token vale 72h |
| S3 | "Assinar agora" mostra QR na tela; token vale 15 min, o QR some ao ser escaneado ou ao expirar |
| S4 | Token sozinho **não** assina: exige código de 6 dígitos, validade de 10 min, no máximo 5 tentativas e depois bloqueio |
| S5 | Token é de uso único; depois de assinar, o link mostra "documento já assinado" |
| S6 | Se o hash do PDF guardado não bater com `document_sha256`, a assinatura é recusada |
| S7 | O PDF final tem uma página de manifesto (data e hora, IP, método, hash original) e um QR que aponta pra `/verificar/<code>` |
| S8 | `signature_evidence` rejeita UPDATE/DELETE, inclusive do admin (teste de trigger) |
| S9 | O painel mostra "✓ Assinado às HH:MM" sem precisar recarregar (Supabase Realtime) |
| S10 | A doutora pode revogar um pedido pendente; o token revogado mostra mensagem neutra |
| S11 | Mobile 375/414px: leitura do PDF, checkbox e botão com área de toque ≥ 44px; a11y sem violações críticas |
| S12 | Nenhum dado pessoal na URL; CPF e telefone mascarados em tela e em log |

---

## 6. LGPD

- **Base legal:** tutela da saúde (art. 11, II, "f") pra guardar; a assinatura registra a **ciência** do paciente, não um consentimento para tratar dados.
- **Retenção:** 20 anos (Lei 13.787/2018). Pedido de exclusão pelo titular **não apaga** prontuário nem evidência (art. 16, I).
- **Minimização:** a evidência guarda IP e user-agent, sem geolocalização e sem foto.
- **Storage:** bucket `signatures` privado; download só por URL assinada de 60s.
- Atualizar `/privacidade` com um parágrafo sobre assinatura eletrônica.

---

## 7. Tasks (uma por commit)

1. Migration: tabelas, RLS, trigger append-only, bucket privado e RPCs de emitir/validar
2. Server fns (`src/lib/signature.ts`): criar pedido (upload + hash), revogar, abrir pelo token, enviar e conferir o código. Exige a env `SIGNATURE_OTP_SECRET` (≥ 32 caracteres)
3. `/assinar/$token`: verificação → leitura → assinatura (mobile-first)
4. Concluir a assinatura (`completeSignature`: confere o hash, grava a evidência) + PDF final com manifesto e QR (`pdf-lib` + `qrcode`, só no servidor)
5. `/verificar/$code`
6. Painel: aba Documentos, modal do QR, status via Realtime, revogar
7. Testes: unit (token, OTP, hash) + e2e Playwright (fluxo link e QR em 375px)

---

## 8. Decisões pendentes (preciso de resposta)

1. **Canal do código:** WhatsApp pelo `WHATSAPP_WEBHOOK_URL` que já existe (sem custo extra) ou SMS (custo por envio)? *Sugestão: WhatsApp, com e-mail como reserva.*
2. **Documentos da v1:** quais entram primeiro? *Sugestão: TCLE + plano de tratamento/orçamento.*
3. **Menor de idade:** quem assina é o responsável legal; precisa de campo de responsável no cadastro do paciente?
4. **Rubrica desenhada:** obrigatória ou opcional? *Sugestão: opcional; quem dá o valor jurídico é o código + a trilha de evidências.*
