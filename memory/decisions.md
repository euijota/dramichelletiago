# Log de decisões

## 2026-11-27 — Assinatura eletrônica do paciente (proposta)

- **O quê:** assinatura eletrônica *avançada* (Lei 14.063/2020) por link com token e por QR presencial, com OTP e trilha de evidências append-only. Spec em `docs/ASSINATURA_DIGITAL.md`.
- **Por quê:** tem validade jurídica para TCLE/plano/orçamento sem exigir certificado ICP do paciente; reaproveita o padrão de token por hash de `appointment_link_tokens`.
- **Fora de escopo:** assinatura ICP-Brasil da profissional (necessária só pra dispensar o prontuário em papel).
- **Status:** aprovado em 2026-11-27. Respostas da seção 8: código por WhatsApp (e-mail de reserva), v1 = TCLE + plano de tratamento + orçamento, rubrica opcional.
- **Menor de idade (sem resposta, padrão adotado):** o pedido guarda `signer_name` + `signer_role` (`paciente` | `responsavel_legal`), sem mexer no cadastro do paciente. Ainda dá pra adicionar um campo de responsável no cadastro depois, se fizer falta.
- **Task 1 (migration `20261127120000_create_patient_signatures.sql`):** OTP guardado como HMAC (6 dígitos com SHA-256 puro é reversível), máx. 3 envios e 5 tentativas (não zeram no reenvio), FK `RESTRICT` para patients, evidência protegida contra UPDATE/DELETE/TRUNCATE por trigger.
