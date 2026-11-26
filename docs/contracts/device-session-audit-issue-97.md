# Dispositivos, sessões e auditoria — Issue #97

**Ambiente de desenvolvimento:** Supabase `connexa-dev` (migrations 10200/10300 não aplicadas).
**Ambiente para revalidação:** projeto Supabase SQA independente, ainda não provisionado.

**Migrations already applied in DEV:** the four original #97 migrations plus the function-only migrations `20261126025656_issue_97_fix_device_enrollment_session_id.sql` and the current proof-of-possession fix.
**Migrations prepared for isolated SQA review only:** `20261126010200_issue_97_sqa_gates.sql`, `20261126010300_issue_97_revalidate_legacy_devices.sql`.

## Fluxo de dispositivo

- No login, o servidor gera um UUID aleatório para o dispositivo e um segredo aleatório de 256 bits quando ainda não há credencial local. O identificador não usa fingerprint do navegador.
- ID e segredo ficam em cookies `HttpOnly`, `SameSite=Strict`; o cookie do segredo é `Secure` em produção. O banco persiste somente o SHA-256 do segredo.
- `register_device_session` vincula a sessão Auth atual ao dispositivo. Novo dispositivo fica `pending`; sessão nova em dispositivo aprovado é vinculada automaticamente. Um dispositivo revogado não pode ser reutilizado; a nova tentativa cria outro pedido de autorização.
- O RPC compara o hash do segredo também quando a sessão Auth já está vinculada. Repetir o ID correto com segredo incorreto é negado.
- O middleware envia sessões sem dispositivo liberado para `/dispositivo-pendente`. RLS e RPCs administrativas repetem a checagem no banco, então uma chamada direta com sessão pendente também é negada.
- Os registros das sessões existentes são preservados, mas o estado `approved` atribuído no primeiro rollout não é prova de aprovação humana. A transição desses dispositivos para revalidação permanece pendente até a publicação e revisão do fluxo de bootstrap/recuperação administrativa; nenhuma alteração em massa deve ocorrer antes desse gate.

## Operações administrativas

| Operação | RPC | Autorização |
|---|---|---|
| Consultar dispositivos/sessões | `admin_list_device_sessions` | `platform_admin`, sessão/dispositivo autorizado |
| Liberar dispositivo | `admin_approve_device` | `platform_admin` em dispositivo de outro usuário; ticket ativo da organização e alvo; justificativa obrigatória |
| Revogar dispositivo ou sessão | `admin_revoke_device`, `admin_revoke_session` | `platform_admin`; justificativa obrigatória |
| Atribuir/remover suporte de TI | `admin_assign_it_support`, `admin_revoke_it_support` | `platform_admin`; escopo de organização |
| Abrir/encerrar chamado | `admin_open_it_support_ticket`, `admin_close_it_support_ticket` | `platform_admin` ou agente designado para encerrar |
| Consultar/revogar dentro de chamado | `support_list_device_sessions`, `support_revoke_device`, `support_revoke_session` | agente ativo, chamado ativo e atribuído, associação ativa à organização e colaborador-alvo do chamado |
| Consultar trilha completa | `admin_list_administrative_audit` | somente `platform_admin` |

O suporte recebe somente operações sobre a pessoa e organização registradas no chamado. Cada consulta e revogação pelo suporte exige justificativa, é auditada e não concede leitura da trilha completa. Não há leitura de conteúdo de conversas.

## Auditoria e retenção

`administrative_audit_logs` registra ator, ação, alvo, escopo, chamado, justificativa sanitizada, resultado e timestamp do banco. RLS está habilitado; os papéis de cliente não têm acesso direto. Triggers rejeitam UPDATE, DELETE e TRUNCATE; `service_role` também não tem esses privilégios. Consultas de sessões e da trilha exigem justificativa e geram evento antes de retornar os dados, sem chamar novamente a RPC de leitura. Credenciais do dispositivo são armazenadas somente como hash; tokens e credenciais em texto são removidos de justificativas e metadados antes de persistir.

Aplicar a retenção de cinco anos aprovada para trilhas administrativas e de segurança na #96; preservar além do prazo somente sob retenção legal/investigativa documentada. A migration não cria rotina automática de expurgo: prazo e execução de expurgo seguro/backup ainda dependem da política operacional comum.

## RPCs protegidas preexistentes

As RPCs administrativas de departamentos também verificam o vínculo dispositivo/sessão e escrevem os eventos de administração na trilha central. As políticas restritivas RLS aplicam a mesma verificação às tabelas de perfil, organização, vínculo e papel da plataforma. O gate distingue estado global Auth (`banned_until`, `deleted_at`) do vínculo por organização: exige vínculo ativo para colaborador; permite platform_admin sem vínculo organizacional; rejeita platform_admin que possua vínculo organizacional suspenso. O esquema atual mantém `organization_members.user_id` globalmente único, então um usuário não tem vínculos simultâneos em múltiplas organizações. O modelo global final de bloqueio/desativação e a neutralização atômica de todas as sessões dependem da #94, ainda aberta; a checagem de Auth existente é apenas a defesa disponível até a integração.

## Gate SQA para sessões legadas

A migration `20261126010200_issue_97_sqa_gates.sql` corrige as RPCs e o gate, mas não deve ser aplicada ao DEV antes da revisão formal do fluxo e dos testes com JWT real. Ela oferece `bootstrap_approve_admin_device`, RPC exclusiva de `service_role`, serializada e disponível apenas quando não há sessão aprovada de administrador. A referência nula ou vazia do operador é rejeitada explicitamente. O operador não é informado pelo chamador SQL: a trilha registra ator `NULL` e ação de sistema, correlacionada com a execução do workflow e sua identidade/revisão externas.

O workflow `.github/workflows/device-session-break-glass.yml` só roda em `main` e usa o ambiente GitHub `device-session-break-glass`; esse ambiente deve ter reviewer(s) obrigatórios, prevenção de autoaprovação e secrets exclusivamente do projeto DEV configurados antes de qualquer uso. Esse estado de configuração ainda requer evidência do administrador do repositório. O workflow `.github/workflows/supabase-dev.yml` mantém as variáveis de controle dentro do `env` do job e falha fechado antes de `supabase db push` sempre que as migrations `10200`/`10300` estiverem no repositório. As variáveis de release e referência SQA não liberam essas migrations para `connexa-dev`: por decisão do usuário, continuam exclusivas do SQA. Isso protege o DEV, mas também interrompe esse deploy enquanto os arquivos existirem; é necessário um fluxo explícito de exclusão/seleção de migrations antes de retomar deploys de schema no DEV.

A migration `20261126010300_issue_97_revalidate_legacy_devices.sql` preserva IDs e linhas, altera pares aprovados para `pending`, compara exatamente pares selecionados, dispositivos/sessões atualizados e eventos auditados, e aborta a transação em divergência. O evento por dispositivo guarda os valores históricos de `approved_at`, `approved_by` e `requested_at` antes de limpar os campos de aprovação ativos; não trata o `approved_at` automático como aprovação humana.

O workflow `CI` executa `npm ci`, guard sintético, ESLint, TypeScript, build e smoke da rota protegida sem depender do SQA. O workflow separado `Issue 97 SQA evidence` usa o GitHub Environment `issue-97-sqa`, a variável `ISSUE97_SQA_PROJECT_REF` e os secrets `AUTH_TEST_SUPABASE_URL`, `AUTH_TEST_SUPABASE_DB_URL`, `AUTH_TEST_SUPABASE_PUBLISHABLE_KEY`, `AUTH_TEST_SUPABASE_SERVICE_ROLE_KEY` e credenciais isoladas de usuário/admin. O guard compara allowlist, URL e DB, rejeitando explicitamente DEV e Production antes de qualquer push. Sem configuração completa, o resumo marca **PENDENTE — testes não executados, sem aprovação SQA**; não converte testes ignorados em aprovação. Com SQA configurado, valida a proveniência de 272 pares e zero eventos antes das migrations em atraso e confirma eventos/timestamps depois. A migration smoke usa somente o DB SQA. As migrations `10200`/`10300` permanecem fora do `connexa-dev`; o workflow isolado não as promove para DEV.

O projeto SQA dedicado ainda não foi criado: a organização está no limite de dois projetos ativos gratuitos. A tentativa de criação retornou custo estimado de `$0/mês`, mas foi bloqueada pelo limite do plano; nenhum projeto existente foi pausado/excluído, e nenhum custo/plano foi contratado. Até provisionar o projeto e configurar o GitHub Environment/secrets, validação remota de migrations/JWT/browser está bloqueada.

## Revisão de permissões e RLS

Na inspeção read-only do `connexa-dev`, as tabelas de dispositivos, sessões, tickets de suporte e auditoria têm políticas permissivas explícitas `false` para `anon`/`authenticated`; as políticas de `profiles`, `organizations`, `organization_members` e `platform_users` incluem também o gate de dispositivo como política restritiva, que é combinado com as políticas permissivas existentes e impede bypass por OR. `departments` e `department_members` têm RLS ativo sem policy direta, portanto o Data API falha fechado; as operações usam RPCs administrativas. A consulta de privilégios das RPCs #97 encontrou `EXECUTE` para `authenticated` e proprietário `postgres` nos endpoints examinados, sem concessão a `anon` nos RPCs administrativos.

O Security Advisor registra 20 avisos genéricos para RPCs `SECURITY DEFINER` acessíveis a `authenticated` e dois avisos de RLS sem policy em tabelas departamentais. A exposição das RPCs é intencional, mas depende de autorização dentro da função (usuário autenticado, dispositivo/sessão autorizado e papel/ticket/escopo); os avisos não equivalem a aprovação de segurança. A confirmação dinâmica desses gates, inclusive rollback/auditoria, permanece pendente de JWTs e projeto SQA. A migration `10300` foi revisada estaticamente: mantém IDs/linhas, guarda timestamps e aprovador prévios na auditoria e aborta a transação se as contagens divergirem; não foi aplicada em DEV ou Production.

## Exposição das RPCs `SECURITY DEFINER`

- `device_session_is_authorized` é executável por `authenticated` porque as políticas RLS precisam avaliar o predicado; ela retorna apenas booleano e valida sessão/dispositivo no banco.
- `register_device_session` é executável por `authenticated` para vincular a sessão atual; valida `auth.uid()`, `session_id`, posse do segredo e estado do dispositivo. Não aceita identidade do ator do cliente.
- RPCs `admin_*` são executáveis por `authenticated` para uso do portal, mas todas repetem o gate de dispositivo e conferem `platform_users.role` no banco; nenhuma concede acesso direto às tabelas.
- RPCs `support_*` são executáveis por `authenticated` para os fluxos de chamado; conferem ticket ativo, agente atribuído, atribuição de suporte ativa e organização/alvo do ticket.
- `bootstrap_approve_admin_device` é executável somente por `service_role` e serve à recuperação inicial após a transição legada; registra ator de sistema e referencia evidência externa do workflow protegido, nunca é chamado pelo navegador.
- Helpers de sanitização e triggers append-only não são executáveis por papéis de cliente.

Essas justificativas não substituem os testes de execução exigidos pelo Tech Lead/SQA. A matriz inclui usuário comum, platform_admin, it_support, autoaprovação, ticket ausente/inativo, cross-organization, revogação, conta suspensa, acesso direto, rollback e leitura auditada. Sem fixtures e JWTs autorizados, esses casos permanecem não verificados.
