# Goldfish — decisões e correções do design

**Status:** resolved — correções documentais aplicadas e reavaliadas; etapas 5–9 concluídas sem achados abertos no escopo da revisão.

**Alvo:** [Sistema de notificações clínicas](docs/designs/sistema-de-notificacoes-clinicas.md), documento completo.

**Autorização:** o autor orientou seguir sempre a opção recomendada. As correções abaixo se limitam à documentação e preservam a necessidade de autorização para custo, envio ou alteração em produção.

## ZO-01 — egm-zoom-out — Major

- **Escopo original:** linhas 130–142 e 348.
- **Discrepância:** substituir o gerador sem modificar os avisos existentes continua distribuindo as credenciais pelos serviços antigos, em conflito com a fronteira descrita no documento.
- **AI Suggestion:** PROPOSE FIX.
- **Justificativa:** a leitura de `notify-server.ts`, linhas 224–337, confirma a inclusão de links no texto e nos payloads dos canais existentes.
- **Alteração:** a recepção autorizada emite o link para envio assistido ao paciente. O fluxo de novo agendamento deixa de gerar e transmitir links de ação nos serviços auxiliares; preserva o aviso de novo agendamento e o acesso autenticado ao painel. Esclarecer que o WhatsApp destinado ao paciente é um canal deliberado de distribuição, distinto de telemetria e retransmissão auxiliar. Atualizar contratos, lista de arquivos, testes e ativação.

## ZO-02 — egm-zoom-out — Nit

- **Escopo original:** linhas 197, 325, 336, 347 e 382.
- **Discrepância:** economia não quantificada de chamadas ociosas adiciona job, endpoint e segredo de saúde.
- **AI Suggestion:** PROPOSE FIX.
- **Justificativa:** os check-ins podem integrar o próprio processamento periódico; o detector de ausência continua no Sentry, fora do processo observado.
- **Alteração:** executar o processador a cada 30 segundos inclusive com fila vazia; nele consultar a saúde da fila e emitir check-ins. Remover do plano o job, endpoint e segredo exclusivos de saúde. Manter validação de cotas e teste de ausência do executor. O custo aceito é maior número de invocações ociosas, ainda por verificar no ambiente.

## Resultado do revisor inventive-catalyst

Nenhum falso compromisso identificado; não há correção proposta por esse revisor.

## Execução

Correções propostas aceitas por delegação do autor. Aplicação documental e reavaliação independente da etapa 5 serão registradas a seguir. Nenhuma implementação autorizada por este relatório.

## C06-01 — compreensão — Nit

**AI Suggestion:** PROPOSE FIX. A seta do cron apontava para a persistência do evento e a explicação conservava uma decisão como pendente. Correção aplicada: cron aponta ao executor; texto distingue a transação que grava o evento do processamento posterior. Status: resolved.

## style-1-1 — especificação — Nit

**AI Suggestion:** PROPOSE FIX (DROP). A ressalva genérica ao fim da alternativa WhatsApp repetia um limite já explicitado no local de decisão. Removida a frase final, preservados o motivo da rejeição e as verificações operacionais. Status: resolved.

## Etapa 9 — rodada 1 — contratos fechados

**AI Suggestion:** PROPOSE FIX para os seis achados Major, agrupados em cinco ações. Aplicados schema e assinaturas/resultados das RPCs, campo específico de motivo que preserva notas, estado compartilhado do monitor, janela fixa e consumo atômico do limite público, origem confiável e retorno em falhas, tabela de estados da recuperação, bloqueio de emissão durante edição não salva e projeção autorizada de eventos para deduplicação no painel.

A referência primária adicional de cabeçalhos Vercel foi capturada para resolver o contrato de origem, seguindo a orientação de escolher as verificações recomendadas. Nenhuma configuração externa foi alterada. As correções foram submetidas às rodadas independentes seguintes; a etapa 9 convergiu nas rodadas 3 e 4. Isso não é prova de funcionamento do software.

## Etapa 9 — rodada 2

**readiness-2-1 / readiness-2-2 — Major; style-2-1 — Nit: PROPOSE FIX.** Completar protocolo HTTP/timeout e classificação de saúde com recuperação humana registrada; esclarecer o limite de avisos por rodada de busca. Aplicação documental pela delegação do autor, seguida de novos revisores. Nenhuma alteração de implementação ou produção.

## Encerramento

Revisão concluída após resultados reais de todos os revisores solicitados. Etapa 7 convergiu em duas rodadas; etapa 9 em quatro, com as duas últimas limpas. Todos os PROPOSE FIX foram aplicados apenas ao design e sua cópia de elaboração. Nenhum item foi escalado ou dispensado como risco sem registro. Verificações operacionais do ambiente permanecem requisitos de implementação/ativação.
