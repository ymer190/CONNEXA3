# Contrato proposto — provisionamento administrativo (#92)

**Status:** escopo básico aprovado pelo Gestor de Tecnologia em 27/11/2026; implementação em andamento. Este contrato não autoriza convites reais nem alterações em Production.
**Branch:** `feature/issue-92-admin-account-provisioning`
**Dependências:** #93 (primeiro acesso — PR #154 integrada à main), #97 (dispositivo/sessão e auditoria central), #95 (vínculo organizacional único).

## 1. Objetivo e limites

Definir as garantias necessárias para tornar o provisionamento idempotente sob concorrência e recuperável após falhas entre Supabase Auth e PostgreSQL.

A implementação básica pode avançar sem projeto SQA adicional. Não aplicar as migrations SQA-only `20261126010200` e `20261126010300`; não alterar Production. Convites reais permanecem bloqueados até a validação ponta a ponta de #93, da entrega de e-mail e da RPC no DEV.

## 2. Entrada confiável

O servidor deve:
1. Revalidar sessão autenticada e papel `platform_admin` no backend. Não confiar em middleware, payload do navegador ou `user_metadata` como autorização.
2. Normalizar nome, e-mail e UUID da organização usando o validador existente.
3. Calcular o hash SHA-256 no servidor por serialização canônica de campos em ordem fixa. O hash enviado pelo cliente, se houver, deve ser ignorado.
4. Receber uma chave de idempotência opaca, com limite de tamanho e formato definido no endpoint. A chave não substitui autorização nem hash do payload.

O hash atual implementado em `employee-provisioning-core.ts` é uma primitiva pura; não constitui claim persistente nem proteção contra concorrência por si só.

A preparação confiável da entrada está implementada em `employee-provisioning-request-core.ts`: valida a chave de idempotência, recebe o ator autenticado como argumento server-side, normaliza os campos e calcula o hash no servidor. Campos `actorUserId`, `payloadHash` ou `idempotencyKey` enviados no corpo pelo navegador são ignorados. A rota definitiva ainda deve obter o ator de `requirePlatformAdmin()`/sessão validada e a chave do cabeçalho HTTP, nunca do corpo.

## 3. Persistência operacional proposta

A tabela operacional `employee_provisioning_operations` deverá ser separada da auditoria central e conter somente metadados operacionais mínimos, por exemplo:

- identificador interno da operação;
- chave de idempotência com restrição UNIQUE;
- hash do payload normalizado;
- estado controlado;
- identificador do ator que iniciou a operação;
- `auth_user_id`, inicialmente nulo;
- contador de tentativas e timestamps;
- identificador de claim imutável para bloquear uma segunda execução concorrente; sem retomada automática de claims interrompidos;
- código de erro sanitizado, sem credenciais, tokens, senha ou e-mail em texto puro.

O e-mail, quando indispensável à reconciliação, deve permanecer cifrado pelo mecanismo AES-256-GCM já implementado; não duplicar PII em logs ou mensagens de erro.

**Privilégios:** nenhum acesso direto de `anon` ou `authenticated`. Acesso exclusivamente pelo serviço/RPC server-side estritamente necessário. A tabela operacional não é uma trilha de auditoria e não deve substituir a #97.

## 4. Claim atômico e idempotência concorrente

A implementação persistente deverá garantir:

1. A primeira requisição cria/obtém a operação por chave única dentro de transação.
2. Duas requisições simultâneas com a mesma chave não podem ambas adquirir o direito de chamar Supabase Auth.
3. Mesma chave + mesmo hash: devolver estado/resultado existente sem repetir o convite.
4. Mesma chave + hash diferente: recusar com conflito, sem alterar a operação original.
5. Claims não expiram automaticamente nesta entrega básica. Uma operação interrompida permanece em andamento/reconciliação manual; nenhuma requisição pode assumir o claim nem repetir Auth por conta própria.
6. Operação terminal não pode voltar a executar.
7. Timeout ou interrupção após o início da chamada Auth exige reconciliação manual; não inferir falha nem repetir a chamada externa sem prova do estado.

A implementação usa `INSERT ... ON CONFLICT` e bloqueio transacional para impedir claims duplicados. A validação deve ocorrer em CI automatizado e no Supabase DEV, sem exigir projeto SQA adicional. Não considerar helper em memória como garantia de exclusão mútua.

## 5. Sequência Auth/PostgreSQL e compensação

1. Validar ator, dispositivo, organização, e-mail e chave de idempotência.
2. Obter claim persistente e exclusivo da operação.
3. Marcar persistentemente a fase `auth_creation_started` antes da chamada externa. Claims interrompidos não são retomados automaticamente; exigem reconciliação manual.
4. Criar a identidade com `auth.admin.createUser({ email, email_confirm: false, app_metadata: { first_access_pending: true, employee_provisioning_operation_id } })`. Não informar senha e não enviar e-mail nesta fase. Confirmar os dois marcadores retornados pelo Auth e persistir o `auth_user_id`.
5. Executar uma RPC transacional que cria `profiles`, `organization_members` com papel fixo `member` e o evento `employee.created` na tabela central `administrative_audit_logs`. Falha em qualquer gravação, inclusive auditoria, implica rollback integral.
6. Somente após confirmação do commit, consultar novamente a identidade e confirmar e-mail ainda não confirmado e os marcadores `app_metadata`. Então gerar o link com `auth.admin.generateLink({ type: 'invite', email })`. O GoTrue permite gerar link de convite para usuário existente ainda não confirmado; a operação retorna o link sem enviar o e-mail.
7. Adaptar o link para o contrato da #93 (`/confirmar-convite#token_hash=...&type=invite`), persistir o link cifrado com AES-256-GCM e só então entregá-lo pelo Resend. Não usar `inviteUserByEmail`, pois envia o e-mail durante a chamada.
8. Persistir o recibo `provider_message_id` do Resend e a fase `email_sent`; marcar a operação `completed` somente após a persistência do recibo.
9. Se a transação PostgreSQL confirmar rollback, compensar a identidade somente com prova de propriedade e confirmação de que o convite ainda não foi aceito. Resultado ambíguo em Auth, PostgreSQL, geração do link ou Resend exige reconciliação manual; nunca repetir cegamente nem excluir identidade com resultado desconhecido.

O estado operacional não pode ser marcado como concluído antes do commit da RPC de domínio/auditoria e da persistência do recibo de entrega.
## 6. Orquestração isolada e testável

A branch contém `employee-provisioning-orchestrator-core.ts`, uma orquestração pura com dependências injetadas. A sequência é:

1. Adquirir claim persistente e exclusivo.
2. Marcar a fase `auth_creation_started` antes do efeito externo.
3. Usar `generateLink({ type: 'invite' })` para criar a identidade e obter o link sem enviá-lo.
4. Atualizar `app_metadata.first_access_pending=true` e `employee_provisioning_operation_id` via Auth Admin.
5. Persistir `auth_user_id` na operação.
6. Executar perfil, vínculo e auditoria central em uma única transação PostgreSQL.
7. Entregar o link pelo Resend somente após commit confirmado.
8. Persistir o recibo `provider_message_id` do Resend e a fase `email_sent`.
9. Marcar operação concluída somente depois da persistência do recibo; falha/resultado ambíguo exige reconciliação, sem duplicar identidade.
9. Em rollback PostgreSQL confirmado, compensar somente identidade comprovadamente criada pela operação e ainda não aceita; resultado ambíguo não autoriza exclusão.

Os testes cobrem replay sem novo convite, conflito de chave, resultado Auth ambíguo, propriedade não comprovada, falha de persistência, rollback/compensação, resultado PostgreSQL ambíguo (sem exclusão), falha ao concluir e a ordem pós-commit do envio. O contrato HTTP está separado em `employee-provisioning-handler.ts`: autoriza antes de processar a entrada, lê `Idempotency-Key` do cabeçalho, deriva ator/hash no servidor e não expõe `auth_user_id` ou dados pessoais. A rota Next.js e a integração dos adapters ainda estão em andamento.

A documentação oficial do Supabase confirma que `generateLink` cria o usuário para os tipos `signup`, `invite` e `magiclink`, além de gerar o link sem enviá-lo. Portanto, não combinar `createUser()` com `generateLink({ type: 'invite' })` para o mesmo e-mail. A implementação usa uma única chamada `generateLink({ type: 'invite' })`, atualiza `app_metadata` por Auth Admin e mantém o link no servidor até o commit PostgreSQL.

## 7. Estados e transições

Estados propostos, alinhados aos helpers existentes:

- `pending`
- `completed`
- `compensation_pending`
- `compensated`
- `manual_reconciliation_required`

As transições devem ser condicionais e auditáveis. `completed` e `compensated` são terminais. Falhas ambíguas devem exigir reconciliação manual, não repetição automática insegura. Se a própria gravação do marcador de reconciliação falhar, a orquestração deve retornar `RECONCILIATION_MARKER_FAILED`; não pode afirmar que o estado manual foi persistido.

## 8. Contrato concreto da auditoria central #97 — conferido no DEV

Consulta somente leitura ao Supabase `connexa-dev` confirmou a tabela `public.administrative_audit_logs` com os campos:

- `actor_user_id uuid`
- `action text`
- `target_type text`
- `target_id text`
- `target_user_id uuid`
- `organization_id uuid`
- `ticket_reference text`
- `justification text`
- `outcome text`
- `occurred_at timestamptz default now()`

Não existe RPC genérica de escrita de auditoria. As RPCs administrativas existentes escrevem diretamente nessa tabela dentro da própria transação. A #92 deve seguir o mesmo padrão: a RPC de provisionamento insere o evento diretamente na tabela central, sem criar RPC/tabela de auditoria paralela.

**Assinatura de leitura existente (não usar para gravar):**
`admin_list_administrative_audit(p_before timestamptz, p_before_id bigint, p_limit integer)`.

**Incompatibilidade confirmada:** a constraint `administrative_audit_logs_target_type_check` permite somente `device`, `session`, `support_ticket`, `it_support_assignment`, `department` e `organization`. O alvo `profile` solicitado pelo contrato de negócio ainda não é aceito. A tabela também não possui coluna `metadata`; não enviar campo inexistente nem criar coluna paralela nesta etapa.

**Evento requerido para #92:**
- `actor_user_id`: derivado de `auth.uid()` dentro da RPC;
- `action`: `employee.created`;
- `target_type`: `profile` (requer extensão mínima e versionada da constraint);
- `target_id`: ID do perfil criado;
- `target_user_id`: ID Auth do colaborador;
- `organization_id`: organização escolhida;
- `justification`: justificativa administrativa sanitizada;
- `outcome`: `allowed`;
- `occurred_at`: default do banco.

A RPC de provisionamento deve inserir esse evento na mesma transação de `profiles` e `organization_members`. Falha de auditoria reverte toda a transação. A migration de extensão da constraint deve depender da fundação #97 já presente no DEV e ser revisada antes da aplicação; não alterar Production.

## 9. Dependências e gates

- **#95:** preservar a unicidade de `organization_members.user_id`; não criar vínculo em segunda organização.
- **#97:** escopo básico de consumo da auditoria central aprovado. PR #153 permanece aberta e fora da `main`; não aplicar migrations SQA-only 10200/10300. A RPC #92 deve usar a tabela central já presente no DEV e requer ajuste mínimo da constraint para `target_type='profile'`.
- **#93:** PR #154 foi integrada à `main`; a integração da #92 ainda precisa implementar o adaptador que estabelece o marcador antes do envio do convite e validar o fluxo ponta a ponta.
- **SQA:** não exigir projeto adicional para continuar o desenvolvimento. Manter testes unitários, CI e validação integrada controlada no DEV após revisão da migration e autorização de execução. A validação não deve depender da criação de um terceiro projeto Supabase.
- **Ambientes:** DEV online é o único alvo de validação autorizado; Production permanece intocado. Não aplicar as migrations SQA-only 10200/10300.

## 10. Critérios para retirar este documento de proposta

O documento só poderá ser convertido em implementação quando:
- Tech Lead aprovar o contrato de tabela/claim e recuperação;
- Tech Lead/SQA aprovarem a extensão da auditoria central #97;
- #93 integrada à `main` e adaptador de convite da #92 validado ponta a ponta;
- Tech Lead revisar a migration gerada e o contrato das RPCs; executar os testes de CI e validação controlada no DEV após autorização explícita. Não é requisito criar projeto SQA adicional.

Até lá, manter a PR #152 Draft e limitar as alterações a código puro, testes unitários e documentação.


### Correção da sequência Auth — documentação oficial

A referência atual do `supabase-js` declara que `generateLink()` trata a criação do usuário para `signup`, `invite` e `magiclink`, e que sua finalidade é gerar links/OTPs para um provedor de e-mail customizado. Logo, a combinação `createUser()` seguida de `generateLink({ type: 'invite' })` não é válida para a mesma identidade. A implementação foi corrigida para usar uma única chamada `generateLink({ type: 'invite' })`, atualizar `app_metadata` por `updateUserById`, persistir o Auth ID e manter o `action_link` somente no servidor até o commit PostgreSQL. A entrega continua pós-commit via Resend.


## 11. Estado da implementação online (27/11/2026)

- Adicionado `src/lib/admin/employee-provisioning-database.ts` com adapters para os contratos RPC do rascunho.
- Adicionada rota `POST /api/admin/employees`, com autorização server-side, pré-validação de variáveis obrigatórias e fail-closed se o ambiente não estiver configurado.
- A criação Auth usa `generateLink({ type: 'invite' })` uma única vez, atualiza `app_metadata` e guarda o link somente no backend até o commit.
- Adicionado identificador `employee_provisioning_operation_id` em `app_metadata` para provar propriedade da identidade antes de eventual compensação.
- Link de primeiro acesso e e-mail passam a ser persistidos apenas como envelopes AES-256-GCM na tabela operacional, para permitir reconciliação sem expor token.
- Corrigida a assertion de teste que esperava o código antigo `INVITE_NOT_CREATED`.
- O SQL continua em rascunho documental; nenhuma migration foi aplicada e as RPCs ainda não existem na branch `main`.
- O endpoint deve permanecer indisponível para provisionamento real até o SQL ser revisado/aprovado, a migration ser gerada/aplicada no DEV e as variáveis Resend/criptografia serem configuradas.
