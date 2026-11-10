# EGM — Etapa 9: prontidão de implementação

**Alvo:** [Sistema de notificações clínicas](docs/designs/sistema-de-notificacoes-clinicas.md). Escopo original: linhas 293–446.

## Rodada 1

| Revisor | Estado | Blocker | Major | Nit |
| --- | --- | --- | --- | --- |
| `egm_stage9_readiness_r1` | completed | 0 | 3 | 0 |
| `egm_stage9_codebase_r1` | completed | 0 | 3 | 0 |
| `egm_stage9_style_r1` | completed | 0 | 0 | 0 |

Rodada não limpa, antes de qualquer correção. Os seis achados brutos correspondem a cinco ações, com sobreposição na persistência do motivo do cancelamento.

### readiness-1-1 — Major — contratos de schema e RPC

Linhas 303–309, 325, 335–345: faltam tipos, nulabilidade, defaults, constraints, nomes/assinaturas e resultados das RPCs, projeção pública e persistência do ciclo de monitor. O motivo do cancelamento não tem parâmetro/campo definidos. A descrição conceitual obriga o implementador a escolher contratos. Definir schema e interfaces, preservando as notas existentes.

### readiness-1-2 — Major — contrato do rate limit

Linhas 323, 335, 340: escolher janela, contadores separados de leitura/ação, consumo atômico, origem confiável, comportamento na ausência da origem, expiração e retorno público. Acrescentar testes de fronteira de janela e concorrência.

### readiness-1-3 — Major — recuperação da fila e erros do provedor

Linhas 305, 315–317, 368–369: definir transições para erros, resultado incerto, reserva vencida e fim das tentativas. Diferenciar `409 concurrent_idempotent_requests`, recuperável, de `409 invalid_idempotent_request`, que exige intervenção. Especificar o comportamento após interrupção entre início do envio e persistência do resultado.

### codebase-1-1 — Major — motivo do cancelamento e observações

Linhas 309, 335, 351: o código atual recebe `reason`, limitado a 500 caracteres, passa `p_reason` à RPC e no fallback sobrescreve `appointments.notes`. O plano precisa escolher armazenamento específico e manter as observações preexistentes. Esta ação é atendida junto de readiness-1-1, sem alterar a severidade original.

### codebase-1-2 — Major — envio com horário editado mas não salvo

Linhas 352, 313 e 391: `AppointmentSheet` mantém data e hora locais e compõe o lembrete antes do botão separado que salva. A emissão no servidor deve ser posterior ao commit correto; definir bloqueio do envio com alterações pendentes e testar a sequência de salvar, revogar e emitir.

### codebase-1-3 — Major — origem e identidade dos avisos do painel

Linhas 345 e 353: o hook não deve inferir origem por status nem depender de `old.status`, mas os eventos com identidade/origem estão em tabela interna. Definir canal/consulta autorizada, projeção, deduplicação e recuperação na reconexão. A assinatura atual de appointments não fornece esses dados.

## Resolução escolhida

Todos os achados Major foram classificados PROPOSE FIX. A orientação do autor de seguir a opção recomendada autoriza completar os contratos no documento e reavaliar; não autoriza implementar ou ativar serviços. O revisor de estilo não apresentou achados.

## Evidência e limites

Os três revisores foram executados em contextos novos com `fork_turns: none`, leram as respectivas personas e o alvo, contexto aprovado e seis referências técnicas. Prontidão e detalhes de código aplicaram `implementation-readiness-standard.md`; estilo não recebeu padrão adicional. Comparação direta com fontes e infraestrutura de testes; nenhum índice de grafo utilizável. Não foram executados builds, testes, ações remotas ou alterações de produção. Verificações de plano, deployment e recursos disponíveis continuam condições de ativação, não defeitos por ausência de implementação.

## Rodada 2

| Revisor | Estado | Blocker | Major | Nit |
| --- | --- | --- | --- | --- |
| `egm_stage9_readiness_r2` | completed | 0 | 2 | 0 |
| `egm_stage9_codebase_r2` | completed | 0 | 0 | 0 |
| `egm_stage9_style_r2` | completed | 0 | 0 | 1 |

Rodada não limpa, decidida antes das correções. Os contratos anteriores resolveram os achados do comparador de código; surgiram as lacunas adicionais abaixo.

* **readiness-2-1 — Major — linhas 321, 365, 404, 414:** definir cabeçalho/formato do segredo, corpo, limite de bytes, códigos de validação e contagens de resposta do endpoint, mais timeout explícito do `pg_net`, cujo padrão documentado é 2 segundos e não comporta o orçamento de 20 segundos do processador.
* **readiness-2-2 — Major — linhas 325, 343, 360–362, 380–387, 412, 440:** definir precedência e critérios objetivos para `healthy/delayed/failed`, tradução a check-ins Sentry, resultado incerto sem próximo horário, erros de configuração/banco, leases vencidas e esperas legítimas.
* **style-2-1 — Nit — linha 393 — CALIBRATE:** esclarecer que o limite de três avisos se refere à rodada de busca, não à consulta clínica.

Classificação de resolução: PROPOSE FIX para os três. Autorização documental pela orientação de seguir o recomendado. As referências de leitura passaram a incluir a captura de cabeçalhos Vercel; todos os revisores confirmaram leitura das sete fontes e suas personas. Mantêm-se os limites estáticos.

## Rodada 3

Escopo atualizado: linhas 293–540.

| Revisor | Estado | Blocker | Major | Nit |
| --- | --- | --- | --- | --- |
| `egm_stage9_readiness_r3` | completed | 0 | 0 | 0 |
| `egm_stage9_codebase_r3` | completed | 0 | 0 | 0 |
| `egm_stage9_style_r3` | completed após uma nova tentativa | 0 | 0 | 0 |

Prontidão e detalhes de código concluíram sem novos achados, após ler personas, padrão, alvo, fontes e sete referências. O revisor de estilo falhou por limite de uso antes de entregar relatório; essa falha não conta como revisão limpa nem como zero achados. Foi solicitada uma única nova tentativa conforme a regra do EGM. A nova tentativa concluiu a leitura e retornou zero achados acionáveis. Os limites de escopo e execução continuam os mesmos. Rodada 3 limpa: primeira rodada limpa da etapa 9; falta a segunda consecutiva para declarar convergência.

## Rodada 4

Escopo relido: linhas 293–540.

| Revisor | Estado | Blocker | Major | Nit |
| --- | --- | --- | --- | --- |
| `egm_stage9_readiness_r4` | completed | 0 | 0 | 0 |
| `egm_stage9_codebase_r4` | completed | 0 | 0 | 0 |
| `egm_stage9_style_r4` | completed | 0 | 0 | 0 |

Três novos contextos `fork_turns: none` concluíram os escopos, personas e padrões aplicáveis, com fontes e sete referências aprovadas. Nenhum achado acionável foi retornado. A verificação de código incluiu consumidores dos tokens/helpers, autenticação, schema, configuração, testes e telemetria; não foram confundidos arquivos futuros com referências existentes.

**Convergência:** rodadas 3 e 4 consecutivas limpas, com todos os revisores concluídos, dentro do limite de cinco rodadas. Etapa 9 concluída em quatro rodadas. Os achados das rodadas 1 e 2 foram corrigidos no desenho e não reapareceram. Não há achado Blocker/Major/Nit aberto ao encerrar esta etapa.

O resultado é prontidão documental no escopo inspecionado, não validação do software. Schema publicado, compatibilidade do build, aplicação de migrações, cotas, domínio, monitor e recebimento móvel permanecem verificações futuras. Nenhum teste executável ou serviço de produção foi acionado nesta revisão.
