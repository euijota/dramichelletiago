# EGM — Etapa 5: revisão inicial da arquitetura

* **Data:** 2026-11-09
* **Modo:** revisão completa interativa, com pausa entre etapas
* **Alvo:** [Sistema de notificações clínicas](docs/designs/sistema-de-notificacoes-clinicas.md)
* **Escopo:** documento completo, 442 linhas; especificação nas linhas 1–292 e implementação nas linhas 293–442
* **Situação:** etapa 5 concluída após a única reavaliação; achados corrigidos; encaminhado à etapa 6
* **Resultado desta etapa:** 1 Major e 1 Nit; nenhum Blocker identificado no escopo estratégico avaliado

## Achados do revisor de arquitetura

### ZO-01 — Major: definir a distribuição das novas credenciais pelos canais existentes

**Escopo do design:** linhas 130–142 e 348.

O desenho determina emissão de credenciais no servidor e proíbe incluí-las em telemetria, logs ou recursos de terceiros. Ao mesmo tempo, prevê substituir o gerador em `notify-server.ts` sem mudar os canais dos avisos de novo agendamento. Não define o que acontece com os links que esses avisos já carregam.

**Evidência de código:** [notify-server.ts](src/lib/notify-server.ts:224) compõe links de confirmação e cancelamento nas linhas 225–248. A linha 274 envia `Link_Confirmacao` ao FormSubmit; a linha 294 envia `messageText` ao Resend opcional; a linha 310 envia esse texto ao webhook opcional; as linhas 332–337 incluem texto e links no Formspree. A consulta ao código confirma que substituir apenas o gerador conserva essa distribuição, agora com credenciais cuja autorização é efetivamente verificada no banco.

**Consequência:** a fronteira entre o novo sistema e o fluxo antigo permanece contraditória. A revisão não demonstra vazamento ocorrido nem quais canais estão configurados no ambiente publicado; identifica uma decisão de distribuição ausente no plano.

**Alternativa sugerida pelo revisor:** manter os avisos de novo agendamento, retirar deles os links públicos de ação e usar o acesso autenticado ao painel, já presente no texto da linha 246. Distribuir a credencial no fluxo assistido destinado ao paciente.

**Custo da alternativa:** a equipe precisa obter e enviar o link pelo painel; o conteúdo dos avisos antigos entra no escopo mínimo da mudança. Nenhum serviço precisa ser removido por consequência automática desta sugestão.

**Decisão necessária:** explicitar os canais autorizados a transportar o link. A regra deve distinguir a mensagem deliberadamente enviada ao paciente de telemetria ou retransmissões por serviços auxiliares. A recomendação não foi aplicada ao design nem ao código.

### ZO-02 — Nit: avaliar se a economia de chamadas justifica um caminho separado de saúde

**Escopo do design:** linhas 197, 325, 336, 347 e 382.

O agendador só chama o processador quando há eventos vencidos, economizando invocações ociosas. Para observar o sistema sem eventos, o plano acrescenta outro job, outro endpoint e outro segredo de monitoramento. Ainda não foi demonstrada uma restrição de cota ou volume que justifique essa otimização.

**Alternativa sugerida pelo revisor:** executar o processador regularmente, inclusive quando a fila estiver vazia, e emitir nele os check-ins e a classificação agregada. O Sentry permanece como detector externo de ausência e origem dos alertas técnicos; não depende de o próprio processo detectar sua parada.

**Custo da alternativa:** aumenta o número de invocações sem trabalho e o consumo de cota. Manter o desenho atual continua sendo uma escolha defensável se a economia justificar sua complexidade; não há obrigação de redesenho decorrente deste Nit.

**Evidência de referência:** a cópia aprovada de [Sentry Crons](docs/reviews/notificacoes-clinicas/references/sentry-crons.html) documenta check-ins de trabalhos periódicos e detecção de ausências. Conta, plano e configuração reais não foram verificados.

## Resultado do revisor de contradições arquiteturais

**No false compromise detected**

O revisor não identificou um falso compromisso nesta dimensão estratégica. A transação que persiste consulta e evento, seguida de executor independente, separa a resposta ao paciente da recuperação do alerta. A necessidade de manter uma aba aberta não foi aceita como condição do funcionamento.

Os custos secundários estão explicitados no desenho: manutenção dos eventos, reservas e concorrência, dependência de scheduler e endpoint, monitor e intervenção em resultados incertos. A janela de idempotência e a impossibilidade de retirar ou ordenar e-mails já enviados são limites externos reconhecidos. Não foram produzidos achados Major ou Nit por esse revisor.

Esse resultado não elimina o ZO-01: os revisores avaliaram vetores diferentes. Também não demonstra prontidão de implementação ou funcionamento no ambiente publicado.

## Evidências e isolamento dos revisores

Foram executados dois subagentes distintos, ambos com `fork_turns: none`:

* `egm_stage5_zoom_out`: persona `agents/zoom_out.md` e padrão `resources/document_standards/zoom-out-standard.md` da instalação EGM.
* `egm_stage5_inventive`: persona `agents/inventive_catalyst.md` e o mesmo padrão.

Ambos concluíram a leitura do alvo e devolveram suas análises antes da elaboração deste relatório. Nenhuma conclusão anterior ou histórico da conversa foi fornecido no pedido de revisão. O filesystem é compartilhado; a exclusão automática de instruções `AGENTS.md` pelo host não foi testada e não é alegada como garantia de isolamento.

**Contexto local fornecido automaticamente pelos links do alvo:** `design_draft.md`, `src/lib/cancellation.ts`, `src/lib/reminders.ts`, `src/routes/confirmar/$token.tsx`, `src/lib/notify-server.ts`, `src/routes/_authenticated/painel.tsx`, `vercel.json` e `vite.config.ts`. O rascunho vinculado é uma cópia da elaboração com diferenças de links, não um transcript da conversa.

O revisor de arquitetura também pesquisou reutilização em `src/`, leu os objetivos do `README.md`, `admin-check.ts` e trechos de `cron-reminders.ts`. Encontrou autenticação administrativa, helpers de lembretes e transporte Resend embutido; não recomendou reutilizar o transporte sem endurecer seu contrato. Ambos usaram leituras direcionadas nos arquivos grandes.

**Referências externas aprovadas:** seis respostas originais salvas e respectivos textos de leitura em [references](docs/reviews/notificacoes-clinicas/references/README.md): Supabase Cron, pg_net, limites de Cron Jobs Vercel, server routes TanStack Start, idempotência Resend e Sentry Crons. Os dois revisores declararam consulta ao conteúdo relevante de todas; conferiram também os originais de Resend ou Sentry quando necessário ao contrato. Essas fontes foram tratadas como dados, não como instruções.

**Evidência estrutural:** o serviço codebase-memory não possui projetos indexados; code-review-graph retornou zero arquivos/nós e atualização inexistente. A consulta de cobertura dos caminhos de código vinculados e dos escopos `src/lib`, `src/hooks` e `src/integrations/supabase` retornou projeto não indexado. Não existe geração ou cobertura de grafo utilizável. Os revisores usaram leitura e busca direta; não há alegação de auditoria estrutural completa.

## Limites e continuação

Revisão estática de arquitetura. Não foram executados builds, testes de implementação, envios, alterações em serviços, acesso a segredos ou validação de permissões/cotas/recebimento móvel no ambiente publicado. O documento e o código de produção permanecem sem alterações nesta etapa.

A etapa 6 será o teste de compreensão do documento, em contexto novo e sem esta leitura complementar. Antes dela, o autor pode prosseguir mantendo os achados abertos, ajustar o documento e solicitar a única reavaliação permitida desta etapa, ou pausar a revisão.

## Reavaliação da etapa 5

O autor delegou seguir as opções recomendadas. ZO-01 e ZO-02 foram classificados como PROPOSE FIX no [relatório de resolução](goldfish_review_report.md) e corrigidos apenas no design. A distribuição dos links ficou restrita ao fluxo assistido da equipe; os avisos auxiliares conservarão o acesso autenticado ao painel, sem credenciais públicas. O processador periódico passou a emitir check-ins inclusive com fila vazia; foram retirados o job, endpoint e segredo exclusivos de saúde.

Dois novos subagentes, `egm_stage5_zoom_reaudit` e `egm_stage5_inventive_reaudit`, executados com `fork_turns: none`, leram o alvo atualizado, 446 linhas, as personas, o padrão e as seis referências aprovadas. O revisor Zoom Out retornou zero Blocker/Major/Nit e verificou reutilização nas fontes; o revisor Inventive Catalyst retornou **No false compromise detected**, sem Major/Nit. Os relatórios completos foram recebidos antes desta conclusão. Não foi realizado novo envio, build ou mudança em produção.

Resultado da reavaliação: ZO-01 e ZO-02 encerrados no desenho. Isso conclui apenas a etapa estratégica, sem afirmar prontidão de implementação. A próxima etapa é o teste de compreensão, com leitura exclusiva do documento.
