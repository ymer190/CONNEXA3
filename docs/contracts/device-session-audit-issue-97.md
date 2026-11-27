# Dispositivos, sessões e auditoria — Issue #97

**Ambiente de desenvolvimento:** Supabase `connexa-dev`.
**Escopo acadêmico simplificado:** não será criado um projeto Supabase SQA independente nesta entrega. Os controles avançados de chamados, bootstrap protegido e revalidação em massa de dispositivos legados ficam adiados. Os testes dinâmicos que dependem de SQA são pendentes, não aprovados.

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
| Liberar dispositivo | `admin_approve_device` | `platform_admin`, sessão/dispositivo autorizado e justificativa obrigatória |
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

## Funcionalidades avançadas adiadas

As migrations `20261126010200_issue_97_sqa_gates.sql` e `20261126010300_issue_97_revalidate_legacy_devices.sql` permanecem fora da execução no DEV e Production. Elas concentram regras avançadas de ticket, bootstrap de administrador e revalidação em massa de dispositivos legados, adiadas para depois da entrega acadêmica.

A tela administrativa foi alinhada ao contrato atualmente instalado no DEV: `admin_approve_device(p_device_id, p_justification)`. A liberação exige perfil `platform_admin`, sessão/dispositivo autorizado e justificativa; o banco registra a operação na auditoria. A referência de chamado e a validação de ticket da migration SQA não são exigidas no fluxo básico atual.

O workflow `.github/workflows/supabase-dev.yml` continua falhando fechado quando encontra as migrations `10200`/`10300` no diretório executável. A documentação oficial do Supabase descreve `db push` como aplicação de todas as migrations locais ainda pendentes; não foi identificado um parâmetro suportado para excluir arquivos individuais. Por isso, não removemos nem movemos migrations e não alteramos o workflow para contornar o gate. O deploy automático de schema DEV fica temporariamente bloqueado até que as migrations adiadas sejam tratadas de forma consistente com o histórico remoto. Nenhuma migration foi aplicada nesta revisão.

O workflow `CI` e o workflow separado `Issue 97 SQA evidence` permanecem no repositório. Como não haverá projeto SQA independente nesta etapa, os testes dinâmicos que dependem desse ambiente ficam **PENDENTES / NÃO EXECUTADOS**; isso não representa aprovação SQA. A validação estática do contrato RPC pode rodar no CI comum, mas não substitui testes autenticados reais.

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

## Contrato RPC de aprovação de dispositivo — revisão

**Diferença identificada:** `src/app/admin/dispositivos/actions.ts` chama `admin_approve_device` com `p_device_id`, `p_justification` e `p_ticket_reference`. A migration inicial `20261126005001` instalada em `connexa-dev` define apenas `(p_device_id uuid, p_justification text)`. O PostgREST seleciona RPCs pela combinação de nomes/assinaturas; portanto, a chamada de três argumentos não corresponde ao contrato disponível no DEV e a aprovação pela interface falha até uma migration compatível ser aplicada.

**Correção aplicada no código da branch:** a action e a interface agora enviam somente `p_device_id` e `p_justification`, compatíveis com a RPC de dois argumentos atualmente instalada no DEV. A autorização server-side existente exige usuário autenticado, dispositivo/sessão autorizados e papel `platform_admin`; a justificativa é obrigatória e auditada. O requisito avançado de ticket permanece adiado com a migration SQA.

**Teste de contrato atualizado:** `node --test scripts/device-approval-rpc-contract.test.cjs` verifica que o Front-end envia os dois argumentos compatíveis com a migration inicial do DEV e não depende do campo de ticket. O teste é estático; não substitui teste PostgREST autenticado.

**Concluído nesta revisão:** alinhamento da interface e da server action com a assinatura RPC ativa no DEV; removida a dependência de ticket do fluxo básico. Nenhuma mudança de comportamento do banco foi executada.

**Pendente:** execução do CI após os commits desta revisão e teste dinâmico autenticado no DEV. Não é necessário provisionar projeto SQA nesta etapa. Não alterei secrets.

**Dependente de etapa futura:** se o fluxo de ticket e a revalidação de dispositivos legados forem retomados, revisar as migrations `10200`/`10300` em separado e planejar sua aplicação com histórico consistente. Por ora, a tela básica está alinhada ao DEV. Não aplicar essas migrations em DEV ou Production.
