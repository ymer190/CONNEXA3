# Runbook proposto — reconciliação de provisionamento (#92)

**Status:** proposta operacional; não executar em produção nem no Supabase DEV.
**Escopo:** orientar a futura operação manual quando a integração Auth/PostgreSQL não puder determinar com segurança o resultado do provisionamento.
**Pré-requisitos para uso:** revisão Tech Lead do SQL draft, migration gerada e aprovada, RPCs aplicadas no Supabase DEV, caminho privilegiado server-side de recuperação implementado e validado, variáveis de criptografia/Resend configuradas e CI verde. O projeto SQA adicional não é requisito para continuar o desenvolvimento.

> Este documento não autoriza convites, exclusões de usuários, alterações de dados ou aplicação de migrations. Os adapters e a rota estão versionados na PR #152, mas a persistência ainda está somente em SQL draft; portanto, os passos abaixo continuam não executáveis.

## 1. Regras invariáveis

1. Nunca repetir convite quando o resultado da chamada Auth for desconhecido.
2. Nunca localizar ou excluir uma identidade apenas por igualdade de e-mail.
3. Nunca excluir identidade cuja criação pela operação não esteja comprovada por identificador/correlação persistente.
4. Nunca excluir identidade se o convite já foi aceito ou se o estado de aceite não puder ser confirmado.
5. Nunca compensar quando o resultado da transação PostgreSQL for desconhecido.
6. Nunca marcar uma operação como concluída sem confirmação do commit de perfil, vínculo e auditoria na mesma transação.
7. Nunca considerar reconciliação registrada sem confirmação da persistência do estado correspondente.
8. Não alterar registros históricos ou executar limpeza em massa para resolver uma operação individual.

## 2. Classificação dos cenários

| Cenário observado | Tratamento obrigatório |
|---|---|
| Operação já completed e mesma chave/hash | Retornar replay; não chamar Auth novamente |
| Mesma chave com hash diferente | Retornar conflito; preservar operação original |
| Outra requisição mantém claim válido | Retornar em andamento; não executar efeitos colaterais |
| Auth retorna resultado desconhecido/timeout | manual_reconciliation_required; não repetir convite |
| Auth criou identidade, mas persistência do auth_user_id falhou | Não iniciar gravações de domínio; reconciliar a identidade por correlação comprovada |
| RPC PostgreSQL confirmou rollback | Avaliar compensação somente se a identidade for comprovadamente criada pela operação e o convite não tiver sido aceito |
| RPC PostgreSQL teve resultado desconhecido | Não excluir identidade; verificar o estado transacional antes de qualquer retomada |
| Auditoria falhou dentro da transação | Exigir rollback integral de perfil e vínculo; não concluir operação |
| Exclusão Auth teve resultado desconhecido ou inseguro | Manter reconciliação manual; não repetir exclusão cegamente |
| Persistência do estado terminal falhou | Não declarar sucesso/compensação; manter reconciliação manual |

## 3. Evidências mínimas para análise

O futuro adapter deverá permitir consultar, sem expor PII desnecessária:

- identificador imutável da operação e chave de correlação;
- estado atual, hash do payload, tentativas e timestamps;
- ator administrativo que iniciou a operação;
- auth_user_id, quando já persistido, somente em ferramenta interna server-side privilegiada;
- resultado conhecido da chamada Auth e da RPC PostgreSQL, somente em ferramenta interna server-side privilegiada;
- `email_provider_message_id` retornado pelo Resend, quando a entrega foi confirmada, somente em ferramenta interna server-side privilegiada;
- estado de aceite do convite;
- prova de que a identidade Auth foi criada por aquela operação;
- existência de perfil, vínculo organizacional e evento de auditoria correspondentes.

O e-mail e o link de convite usados para reconciliação devem permanecer cifrados com AES-256-GCM, com AADs distintos. A RPC/rota de status acessível ao administrador retorna somente status, fase, indicadores booleanos e código sanitizado; nunca retorna Auth ID, envelopes cifrados ou recibo do provedor. Uma eventual recuperação dos envelopes deve ocorrer exclusivamente por caminho backend privilegiado, sem RPC acessível a `authenticated` e sem exposição via PostgREST. A descriptografia ocorre exclusivamente no servidor. Logs e comentários de incidentes não devem conter e-mail em texto puro, tokens, links de convite, chaves ou credenciais.

## 4. Sequência de decisão manual

1. Identificar a operação pelo ID imutável, nunca por busca aproximada de e-mail.
2. Consultar o estado persistido e coletar as evidências mínimas acima.
3. Se o estado Auth ou PostgreSQL continuar ambíguo, manter bloqueio e escalar para o Tech Lead; não executar retry, exclusão ou alteração manual. Revisão SQA adicional não é pré-requisito para o escopo básico aprovado.
4. Se o commit de domínio e auditoria estiver confirmado, reconciliar apenas o estado operacional para completed por mecanismo autorizado e idempotente.
5. Se o rollback estiver confirmado, verificar propriedade da identidade e não aceite do convite. Somente com ambas as provas poderá ser considerada a compensação Auth.
6. Se o convite tiver sido aceito, ou se a propriedade/aceite não puderem ser provados, não excluir a identidade; encaminhar para decisão administrativa específica.
7. Registrar a decisão e sua evidência na auditoria central aprovada, sem criar log paralelo.
8. Revalidar que perfil, vínculo, auditoria e estado operacional ficaram consistentes antes de liberar nova tentativa.

## 5. Critérios para encerrar a reconciliação

Uma operação só pode sair de reconciliação quando houver uma destas conclusões comprovadas:

- **Concluída:** identidade e convite válidos, perfil e vínculo corretos, auditoria confirmada e estado operacional completed.
- **Compensada:** rollback confirmado, identidade criada pela própria operação, convite não aceito, exclusão confirmada e estado compensated.
- **Pendente de decisão:** qualquer evidência ausente, ambígua ou contraditória. Manter manual_reconciliation_required e não permitir retry automático.

## 6. Testes obrigatórios antes de habilitar o procedimento

- Timeout Auth antes e depois de criação da identidade.
- Falha ao persistir auth_user_id.
- Timeout/resultado desconhecido da RPC PostgreSQL.
- Rollback confirmado por falha de auditoria.
- Convite já aceito antes de uma tentativa de compensação.
- Identidade preexistente com mesmo e-mail, mas sem prova de propriedade pela operação.
- Exclusão Auth com resultado desconhecido.
- Falha ao persistir cada estado terminal.
- Duas requisições concorrentes com a mesma chave e payload.
- Repetição da reconciliação sem duplicar convite, vínculo ou evento de auditoria.

**Gate de liberação:** este runbook só passa a ser operacional após revisão do Tech Lead, migration funcional versionada e aprovada, RPCs aplicadas no Supabase DEV em janela autorizada, caminho privilegiado server-side implementado e validado, configuração das variáveis Resend/criptografia e CI geral verde. Projeto SQA adicional não é requisito do escopo básico aprovado. Não aplicar no Supabase Production.


## 7. Estado atual

A implementação da rota e dos adapters está em andamento na PR #152. O SQL da tabela operacional/RPC está em `docs/contracts/employee-provisioning-issue-92-migration-draft.sql`, ainda não é uma migration aplicada. A RPC acessível ao administrador foi reduzida a status-only; não há consulta PostgREST que retorne Auth ID, e-mail/link cifrados ou recibo do provedor. A recuperação operacional privilegiada ainda não foi implementada. O envio só deve ser habilitado depois de a RPC registrar o recibo do Resend (`email_provider_message_id`) e a operação passar para `completed`. Até lá, não executar provisionamentos reais.
