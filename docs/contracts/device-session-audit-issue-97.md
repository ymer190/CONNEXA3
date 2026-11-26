# Dispositivos, sessões e auditoria — Issue #97

**Ambiente:** Supabase `connexa-dev`

**Migrations already applied in DEV:** `20261126005001_issue_97_device_session_audit.sql`, `20261126005334_issue_97_harden_audit_access.sql`, `20261126005741_issue_97_redact_device_metadata.sql`, `20261126005949_issue_97_protect_audit_truncation.sql`
**Migrations prepared for review only:** `20261126010200_issue_97_sqa_gates.sql`, `20261126010300_issue_97_revalidate_legacy_devices.sql`

## Fluxo de dispositivo

- No login, o servidor gera um UUID aleatório para o dispositivo e um segredo aleatório de 256 bits quando ainda não há credencial local. O identificador não usa fingerprint do navegador.
- ID e segredo ficam em cookies `HttpOnly`, `SameSite=Strict`; o cookie do segredo é `Secure` em produção. O banco persiste somente o SHA-256 do segredo.
- `register_device_session` vincula a sessão Auth atual ao dispositivo. Novo dispositivo fica `pending`; sessão nova em dispositivo aprovado é vinculada automaticamente. Um dispositivo revogado não pode ser reutilizado; a nova tentativa cria outro pedido de autorização.
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

As RPCs administrativas de departamentos também verificam o vínculo dispositivo/sessão e escrevem os eventos de administração na trilha central. As políticas restritivas RLS aplicam a mesma verificação às tabelas de perfil, organização, vínculo e papel da plataforma. O gate também recusa sessão Auth banida/expirada e vínculo organizacional suspenso. O contrato completo de conta bloqueada/desativada e neutralização atômica de todas as sessões depende da #94, que continua aberta; essa integração não está concluída por esta entrega.

## Gate SQA para sessões legadas

A migration `20261126010200_issue_97_sqa_gates.sql` corrige as RPCs e o gate, mas não deve ser aplicada ao DEV antes da revisão formal do fluxo e dos testes com JWT real. Ela também oferece `bootstrap_approve_admin_device`, uma RPC exclusiva de `service_role`, serializada e de uso único enquanto nenhum administrador tem sessão aprovada, para recuperação inicial. O operador deve fornecer um ator platform_admin distinto do alvo, chamado ativo e justificativa; cada chamada grava auditoria. A migration `20261126010300_issue_97_revalidate_legacy_devices.sql` está preparada separadamente e preserva IDs e linhas, altera os pares de dispositivo/sessão legados para `pending` e grava um evento por dispositivo. Não aplicar qualquer uma delas antes do review SQA/Tech Lead, da execução da matriz JWT, das contagens pré/pós e da aprovação do plano de rollback.

## Exposição das RPCs `SECURITY DEFINER`

- `device_session_is_authorized` é executável por `authenticated` porque as políticas RLS precisam avaliar o predicado; ela retorna apenas booleano e valida sessão/dispositivo no banco.
- `register_device_session` é executável por `authenticated` para vincular a sessão atual; valida `auth.uid()`, `session_id`, posse do segredo e estado do dispositivo. Não aceita identidade do ator do cliente.
- RPCs `admin_*` são executáveis por `authenticated` para uso do portal, mas todas repetem o gate de dispositivo e conferem `platform_users.role` no banco; nenhuma concede acesso direto às tabelas.
- RPCs `support_*` são executáveis por `authenticated` para os fluxos de chamado; conferem ticket ativo, agente atribuído, atribuição de suporte ativa e organização/alvo do ticket.
- `bootstrap_approve_admin_device` é executável somente por `service_role` e serve à recuperação inicial após a transição legada; nunca é chamado pelo navegador.
- Helpers de sanitização e triggers append-only não são executáveis por papéis de cliente.

Essas justificativas não substituem os testes de execução exigidos pelo Tech Lead/SQA. A matriz inclui usuário comum, platform_admin, it_support, autoaprovação, ticket ausente/inativo, cross-organization, revogação, conta suspensa, acesso direto, rollback e leitura auditada. Sem fixtures e JWTs autorizados, esses casos permanecem não verificados.
