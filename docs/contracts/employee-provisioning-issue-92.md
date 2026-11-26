# Contrato proposto — provisionamento administrativo (#92)

**Status:** proposta técnica para revisão; não é migration nem autorização para executar operações.
**Branch:** `feature/issue-92-admin-account-provisioning`
**Dependências:** #93 (primeiro acesso — PR #154 integrada à main), #97 (dispositivo/sessão e auditoria central), #95 (vínculo organizacional único).

## 1. Objetivo e limites

Definir as garantias necessárias para tornar o provisionamento idempotente sob concorrência e recuperável após falhas entre Supabase Auth e PostgreSQL.

Esta especificação não cria tabela, RPC, usuário, convite, segredo ou migration. Não autoriza gravações em `connexa-dev` ou produção. Convites reais permanecem bloqueados até a integração e homologação de #93 e dos gates de segurança.

## 2. Entrada confiável

O servidor deve:
1. Revalidar o ator como `platform_admin` e validar sessão/dispositivo conforme o contrato aprovado de #97.
2. Normalizar nome, e-mail e UUID da organização usando o validador existente.
3. Calcular o hash SHA-256 no servidor por serialização canônica de campos em ordem fixa. O hash enviado pelo cliente, se houver, deve ser ignorado.
4. Receber uma chave de idempotência opaca, com limite de tamanho e formato definido no endpoint. A chave não substitui autorização nem hash do payload.

O hash atual implementado em `employee-provisioning-core.ts` é uma primitiva pura; não constitui claim persistente nem proteção contra concorrência por si só.

## 3. Persistência operacional proposta

A tabela operacional `employee_provisioning_operations` deverá ser separada da auditoria central e conter somente metadados operacionais mínimos, por exemplo:

- identificador interno da operação;
- chave de idempotência com restrição UNIQUE;
- hash do payload normalizado;
- estado controlado;
- identificador do ator que iniciou a operação;
- `auth_user_id`, inicialmente nulo;
- contador de tentativas e timestamps;
- lease/claim de execução com identificador e expiração, se necessário ao mecanismo de recuperação;
- código de erro sanitizado, sem credenciais, tokens, senha ou e-mail em texto puro.

O e-mail, quando indispensável à reconciliação, deve permanecer cifrado pelo mecanismo AES-256-GCM já implementado; não duplicar PII em logs ou mensagens de erro.

**Privilégios:** nenhum acesso direto de `anon` ou `authenticated`. Acesso exclusivamente pelo serviço/RPC server-side estritamente necessário. A tabela operacional não é uma trilha de auditoria e não deve substituir a #97.

## 4. Claim atômico e idempotência concorrente

A implementação persistente deverá garantir:

1. A primeira requisição cria/obtém a operação por chave única dentro de transação.
2. Duas requisições simultâneas com a mesma chave não podem ambas adquirir o direito de chamar Supabase Auth.
3. Mesma chave + mesmo hash: devolver estado/resultado existente sem repetir o convite.
4. Mesma chave + hash diferente: recusar com conflito, sem alterar a operação original.
5. Uma operação em andamento só pode ser retomada por claim/lease atômico válido; atualização deve conferir estado, tentativa e proprietário do claim.
6. Operação terminal não pode voltar a executar.
7. Toda retomada deve ser segura após timeout ou interrupção, sem inferir que uma chamada externa falhou apenas porque a resposta não chegou.

A escolha entre `INSERT ... ON CONFLICT`, lock transacional ou atualização condicional deverá ser validada com testes de concorrência no projeto SQA isolado. Não considerar helper em memória como garantia de exclusão mútua.

## 5. Sequência Auth/PostgreSQL e compensação

1. Validar ator, dispositivo, organização, e-mail e chave de idempotência.
2. Obter claim persistente e exclusivo da operação.
3. Consultar duplicidade Auth; falha na consulta deve falhar fechada.
4. Enviar convite usando Supabase Auth Admin exclusivamente server-side e sem senha temporária.
5. Persistir imediatamente o `auth_user_id` associado à operação antes de iniciar a transação de domínio.
6. Chamar uma RPC específica para criar `profiles`, `organization_members` e evento da auditoria central na mesma transação PostgreSQL. Papel inicial fixo: `member`.
7. Marcar a operação como concluída somente após confirmação de todas as etapas.
8. Se PostgreSQL falhar após criação Auth, registrar estado de compensação/reconciliação. Excluir identidade Auth somente quando houver prova inequívoca de que foi criada por esta operação; nunca por igualdade de e-mail.
9. Se o resultado de Auth for ambíguo, não repetir convite cegamente nem excluir identidade; mover para reconciliação manual.

O estado operacional não pode ser marcado como concluído antes do commit da RPC de domínio e auditoria.

## 6. Orquestração isolada e testável

A branch contém `employee-provisioning-orchestrator-core.ts`, uma orquestração pura com dependências injetadas. Ela define a sequência e os limites sem executar chamadas reais ao Supabase:

1. Adquirir claim persistente e exclusivo.
2. Criar convite somente por adaptador que garanta `app_metadata.first_access_pending` antes da entrega do e-mail.
3. Persistir `auth_user_id` na operação.
4. Executar perfil, vínculo e auditoria central em uma única transação PostgreSQL.
5. Marcar a operação como concluída somente após a confirmação da transação.
6. Em rollback PostgreSQL confirmado, compensar somente uma identidade comprovadamente criada pela própria operação e ainda não aceita; resultado de transação ou de exclusão ambíguo segue para reconciliação manual, sem exclusão.

Os testes cobrem replay sem novo convite, conflito de chave, resultado Auth ambíguo, propriedade não comprovada, falha de persistência, rollback/compensação, resultado PostgreSQL ambíguo (sem exclusão) e falha ao concluir. Os adaptadores concretos permanecem deliberadamente ausentes até aprovação dos contratos #97 e do mecanismo de marcador pré-convite.

## 7. Estados e transições

Estados propostos, alinhados aos helpers existentes:

- `pending`
- `completed`
- `compensation_pending`
- `compensated`
- `manual_reconciliation_required`

As transições devem ser condicionais e auditáveis. `completed` e `compensated` são terminais. Falhas ambíguas devem exigir reconciliação manual, não repetição automática insegura. Se a própria gravação do marcador de reconciliação falhar, a orquestração deve retornar `RECONCILIATION_MARKER_FAILED`; não pode afirmar que o estado manual foi persistido.

## 8. Contrato pendente da auditoria #97

A migration inicial da #97 define `administrative_audit_logs.target_type` com uma allowlist que não inclui explicitamente `employee` ou `employee_provisioning`. A auditoria central também exige os campos e sanitização definidos no contrato da #97.

Antes de implementar a RPC de provisionamento, o Tech Lead/SQA deve confirmar a extensão compatível do contrato central (tipo de alvo, ação, target_id, ator, organização e resultado) em migration versionada da própria linha #97. Não criar tabela ou log paralelo, nem reutilizar silenciosamente um tipo de alvo semanticamente incorreto.

A auditoria do provisionamento deve ocorrer dentro da mesma transação que grava perfil e vínculo. Se a escrita do evento falhar, toda a transação PostgreSQL deve sofrer rollback.

## 9. Dependências e gates

- **#95:** preservar a unicidade de `organization_members.user_id`; não criar vínculo em segunda organização.
- **#97:** PR #153 continua sem aprovação SQA final (REQUEST CHANGES); autorização de sessão/dispositivo e contrato de auditoria central não estão liberados. Não executar a RPC antes da aprovação.
- **#93:** PR #154 foi integrada à `main`; a integração da #92 ainda precisa implementar o adaptador que estabelece o marcador antes do envio do convite e validar o fluxo ponta a ponta.
- **SQA:** testes com JWT real, chamadas concorrentes com mesma chave, mesma chave/payload divergente, falhas antes/depois do convite, interrupção após persistir `auth_user_id`, rollback por falha de auditoria, compensação segura e reconciliação manual.
- **Ambientes:** testes integrados somente em Supabase SQA isolado e explicitamente allowlisted. Não aplicar migrations ou executar gravações no DEV/PROD nesta etapa.

## 10. Critérios para retirar este documento de proposta

O documento só poderá ser convertido em implementação quando:
- Tech Lead aprovar o contrato de tabela/claim e recuperação;
- Tech Lead/SQA aprovarem a extensão da auditoria central #97;
- #93 integrada à `main` e adaptador de convite da #92 validado ponta a ponta;
- existir ambiente SQA isolado e gates de CI comprovados.

Até lá, manter a PR #152 Draft e limitar as alterações a código puro, testes unitários e documentação.
