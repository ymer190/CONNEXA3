# Contratos de integração — CONNEXA3

**Issue:** [#106](https://github.com/ymer190/CONNEXA3/issues/106)
**Versão:** 1.2 — schema de conversas no DEV e processo de mudança
**Atualizado em:** 2026-11-26
**Ambiente conferido:** Supabase Online, projeto `connexa-dev` (`dzsacdtolxrqgwlekzdg`)
**Estado:** contratos existentes e propostas pendentes estão separados. A validação conjunta Back-end/Front-end continua pendente.

Este documento é a referência compartilhada de integração. Os contratos classificados como **implementados no DEV** descrevem o schema/RPC verificado; isso não significa que a interface do produto já os consuma ou que tenham sido liberados para produção. Contratos **propostos** não devem ser chamados como APIs existentes.

## 1. Baseline verificado

Em 26/11/2026, `public` no `connexa-dev` contém 16 tabelas. Todas têm RLS habilitado; as cinco tabelas novas de conversas também usam `FORCE ROW LEVEL SECURITY`.

As tabelas de departamentos e suas RPCs foram implementadas para a #95. As tabelas/RPCs de dispositivos, suporte e auditoria administrativa estão no banco DEV pelas migrations da #97. Essas migrations ainda não estão integradas na `main` conforme a PR #153 aberta em 26/11; o contrato de banco abaixo não afirma integração no frontend nem autorização para produção.

As tabelas `conversations`, `conversation_members`, `messages`, `message_attachments` e `conversation_audit_logs` foram aplicadas no DEV pelas migrations `20261126200605` e `20261126200722` (PR #156). Elas são apenas fundação de dados: não há RPC/endpoints, policies ou privilégios diretos para `anon`, `authenticated` ou `service_role`; portanto, nenhuma delas está disponível pela Data API. A arquitetura e os limites de autorização aprovados estão na [ADR-001 v1.3](../architecture/ADR-001_v1.3_proposta_consolidada_SQA.md) e no [documento da #96](../architecture/authorization-permissions-issue-96.md). A aprovação documental não equivale a uma operação de aplicação implementada.

| Domínio | Estado no DEV | Limite principal |
|---|---|---|
| Auth e perfil próprio | Implementado | Sessão autentica; permissão é checada separadamente |
| Departamentos e vínculos | RPCs implementadas para `platform_admin` | Acesso somente via RPC; sem paginação no banco |
| Dispositivos, sessões e suporte | RPCs da #97 presentes no DEV | Acesso via RPC autenticada, dispositivo autorizado e escopo/ator validados |
| Auditoria administrativa | Tabela append-only e RPC de consulta presentes | Histórico completo somente para `platform_admin`; cursor composto `(occurred_at, id)`, chamada PostgREST com sessão e eventos reais ainda não validada |
| Schema de conversas, mensagens, anexos e auditoria do domínio | Tabelas presentes; sem RPC/API | RLS forçado, sem policies/grants; contrato de leitura excepcional continua proposta e não pode ser consumido |
| Colaboradores e ciclo de vida de conta | Parcial / dependências #92–#94 | Não inferir campos, papéis ou operações que ainda não foram entregues |

## 2. Convenções de integração

- IDs são UUIDs, salvo `administrative_audit_logs.id` (`bigint`). Timestamps são `timestamptz` e trafegam como ISO-8601 UTC.
- As RPCs PostgreSQL são chamadas pelo nome com argumentos `p_...`; resultado `SETOF` chega como lista JSON, inclusive para uma única linha. Listagens sem resultados retornam lista vazia.
- `supabase.rpc()` retorna `{ data, error }`. Em erro, o SDK fornece `code`, `message`, `details` e `hint` quando disponíveis. Não expor `details`/SQL interno na UI.
- Não existe envelope REST CONNEXA3 comum. Não presumir formato HTTP ou envelope de API de domínio que não esteja descrito aqui.
- Acesso direto às tabelas administrativas/de departamento é revogado para `anon` e `authenticated`; usar as RPCs listadas. RLS habilitada sem policy nas tabelas privadas é intencional em combinação com privilégios revogados e operações privilegiadas auditadas.
- `SECURITY DEFINER` e `EXECUTE` para `authenticated` não significam autorização por si: as RPCs validam identidade, dispositivo e papel/escopo dentro do banco. Não criar caminhos alternativos pelo browser, service key ou filtros enviados pelo cliente.
- `service_role`/secret key somente no servidor. `user_metadata` não é fonte de autorização.

## 3. Autenticação, sessão e perfil

### Login e sessão — implementados

- Login usa Supabase Auth `signInWithPassword({ email, password })` no fluxo SSR existente.
- Sucesso identifica a conta por `user.id`; tokens e renovação pertencem à sessão Supabase, não a payloads próprios de negócio.
- Ausência/recusa de credenciais retorna `AuthError` do SDK; a interface deve usar mensagem genérica e não confirmar se um e-mail existe.
- `getUser()` no servidor confirma identidade. A verificação de sessão não concede papel ou acesso a dados automaticamente.
- A sessão que chama RPCs administrativas da #95/#97 também precisa estar vinculada a um dispositivo aprovado (`device_session_is_authorized()`); a autorização ocorre em cada operação protegida.

### Perfil próprio — implementado

`public.profiles` contém `id uuid`, `full_name text|null`, `avatar_url text|null`, `created_at timestamptz`, `updated_at timestamptz`. A linha visível é a do próprio `auth.uid()`; RLS limita SELECT/INSERT/UPDATE ao próprio perfil. O e-mail é dado de Auth, não de `profiles`. SELECT sem linha visível pode resultar em lista vazia, não em erro.

### Colaboradores — parcial

`organization_members` ainda tem papel legado (`owner`, `admin`, `member`) e estados `active`/`suspended`; isso não define autorização de plataforma nem cargo de produto. O DEV atual também possui fluxo de status de conta sob a #94 em validação. Ainda não há neste contrato uma API geral de listagem/cadastro de colaboradores com campos, filtros, ordenação e paginação estáveis. Não inferir essa operação a partir de uma tabela ou tela.

## 4. Departamentos — #95, implementado no DEV

### Modelo e projeções

`departments`: `id uuid`, `organization_id uuid`, `name text`, `status ('active'|'inactive')`, `created_at timestamptz`, `updated_at timestamptz`. Nome não pode ser vazio após `btrim`; nome ativo é único após normalização dentro da organização.

`department_members`: `id uuid`, `organization_id uuid`, `department_id uuid`, `user_id uuid`, `created_at timestamptz`, `created_by uuid|null`, `ended_at timestamptz|null`, `ended_by uuid|null`. Vínculos encerrados permanecem para histórico; `ended_at IS NULL` identifica vínculo atual. FKs compostas impedem cruzamento de organização.

### RPCs e entradas

Todas as RPCs abaixo exigem usuário autenticado, dispositivo/sessão autorizados e `platform_admin` verificado no banco. `it_support` e `collaborator` sem concessão explícita são negados. A associação de departamento não concede leitura de conversa.

| Operação | RPC e argumentos nomeados | Resposta | Erros relevantes |
|---|---|---|---|
| Listar departamentos | `admin_list_departments({p_organization_id: UUID})` | `Department[]`, por nome normalizado e `id` | sessão ausente `28000`; dispositivo ou papel não autorizado `42501` |
| Criar | `admin_create_department({p_organization_id: UUID, p_name: string})` | `Department[]` com registro criado | `22023` inválido; `23503` organização inexistente; `23505` nome ativo duplicado; `28000`/`42501` autorização |
| Editar nome | `admin_update_department({p_department_id: UUID, p_organization_id: UUID, p_name: string})` | `Department[]` atualizado | `22023` inválido; `P0002` ativo não encontrado no escopo; `23505` duplicidade; `28000`/`42501` autorização |
| Desativar | `admin_deactivate_department({p_department_id: UUID, p_organization_id: UUID})` | `Department[]` inativado | `P0002` ativo não encontrado no escopo; `28000`/`42501` autorização |
| Listar vínculos atuais e históricos | `admin_list_department_members({p_department_id: UUID, p_organization_id: UUID})` | `DepartmentMember[]`, atuais primeiro, depois histórico por criação/id | `28000`/`42501` autorização |
| Transferir colaborador | `admin_transfer_department_member({p_organization_id: UUID, p_user_id: UUID, p_new_department_id: UUID})` | `DepartmentMember[]` novo; encerra o atual na mesma transação | `22023` inválido; `23514` destino não ativo/no escopo; constraints para vínculo/organização; `28000`/`42501` autorização |

A criação/edição remove espaços periféricos do nome. Desativar encerra vínculos atuais; transferência preserva o anterior. Cada operação administrativa é gravada em `administrative_audit_logs` na mesma transação.

**Paginação:** estas RPCs não recebem `limit`, `offset` nem cursor e não retornam metadados de paginação. A resposta é a lista integral no escopo consultado. Não inventar parâmetros no cliente. Se o volume exigir paginação, ela precisa ser adicionada ao contrato e à RPC antes de integração que dependa dela.

**Integração app:** banco e testes da #95 estão no DEV; a página do frontend não equivale a aceite de API. Capacidades departamentais para gestores continuam não concedidas no banco; acesso permanece `platform_admin` até implementação/aprovação separada.

## 5. Dispositivos, suporte e auditoria administrativa — #97 no DEV

As operações abaixo descrevem as RPCs atualmente encontradas no DEV. A PR #153 está aberta e documenta gates de revisão/integração. Verificar essa dependência antes de consumir as funções em `main`.

### Escopo de autorização

- `platform_admin`: administra dispositivos/sessões e consulta o histórico administrativo completo, após validação de sessão e dispositivo autorizado.
- `it_support`: somente operações de dispositivos/sessões associadas a chamado ativo e atribuído, justificativa não vazia, organização e usuário-alvo daquele chamado. Não pode consultar o histórico administrativo completo, administrar organização/papéis ou ler conteúdo de conversa.
- A função RPGD tem supervisão de privacidade restrita ao ciclo de vida de acesso excepcional conforme ADR/#96; não é papel cadastrado no esquema atual nem tem acesso a conteúdo de conversa por esse fato.
- Chamadas negam com `28000` se não há identidade; `42501` para dispositivo/identidade/escopo não autorizado; `22023` para argumento inválido/justificativa obrigatória; `P0002` para recurso/chamado fora do escopo ou inexistente. Mensagens de Postgres não são texto de UI.

### Consulta de dispositivos/sessões

`admin_list_device_sessions({p_user_id: UUID|null, p_justification: string|null})` retorna linhas com `user_id`, `device_id`, `session_id`, `device_label`, `user_agent`, `device_status`, `session_status`, `requested_at`, `last_seen_at`. `p_user_id = null` consulta todos os usuários; o ator precisa ser `platform_admin`. Justificativa é opcional nesta RPC. A consulta é auditada.

`support_list_device_sessions({p_ticket_reference: string, p_justification: string})` retorna a mesma projeção somente para o usuário-alvo do chamado ativo atribuído ao ator. A justificativa é obrigatória e não vazia. Organização, designação de suporte, ator, usuário-alvo e status do chamado são revalidados no servidor.

As duas RPCs retornam todas as linhas correspondentes, em ordem de atividade mais recente, sem parâmetros de paginação. Não presumir que filtros do cliente limitem dados que o servidor devolveu.

### Auditoria administrativa

`public.administrative_audit_logs` é append-only. Campos retornados pela RPC:

| Campo | Tipo / nulabilidade | Significado e limite |
|---|---|---|
| `id` | `bigint`, não nulo | Identificador crescente do evento |
| `actor_user_id` | `uuid|null` | Ator confiável derivado da sessão; pode faltar quando aplicável ao evento |
| `action` | `text`, não nulo | Código estável da operação |
| `target_type` | `text`, não nulo | `device`, `session`, `support_ticket`, `it_support_assignment`, `department` ou `organization` |
| `target_id` | `text`, não nulo | Identificador textual do alvo |
| `target_user_id` | `uuid|null` | Usuário afetado quando aplicável |
| `organization_id` | `uuid|null` | Escopo organizacional quando aplicável |
| `ticket_reference` | `text|null` | Referência de chamado quando aplicável |
| `justification` | `text|null` | Justificativa sanitizada quando fornecida/exigida; máximo persistido de 500 caracteres |
| `outcome` | `text`, não nulo | `allowed` ou `denied` |
| `occurred_at` | `timestamptz`, não nulo | Horário gerado pelo servidor/banco |

Não existem `correlation_id`, `page_size`, `result_count` ou coluna de corpo de conversa nesta tabela. Credenciais/tokens são redigidos; não se registram corpos de mensagem ou conteúdo de anexo. Clientes `anon`/`authenticated` não têm acesso direto à tabela nem podem atualizá-la/apagá-la.

RPC no DEV: `admin_list_administrative_audit({p_before: ISO8601|null, p_before_id: bigint|null, p_limit: integer})` retorna `AdministrativeAuditEvent[]`, exclusivamente para `platform_admin` com sessão/dispositivo autorizados. `p_limit` default 50 e aceita 1–100. Primeira página: ambos os campos do cursor são `null`; páginas seguintes: enviar o par `(occurred_at, id)` do último registro recebido. Os dois campos do cursor devem ser enviados juntos. Ordenação e continuação são decrescentes pela chave composta `(occurred_at, id)`. Não há filtros de ator, ação, organização ou tipo de alvo.

A correção de cursor composto foi aplicada no DEV pela migration `20261126195458_issue_97_audit_composite_cursor` e adicionada à branch da PR #153. A regra é a comparação decrescente pela chave `(occurred_at, id)`; a assinatura exige os dois campos do cursor juntos. O teste de chamada PostgREST com sessão autorizada e eventos reais permanece pendente e será executado na etapa final de validação.

A política aprovada pela PO é retenção de **cinco anos** para dados/eventos abrangidos, com holds documentados que podem estender a preservação. O mecanismo de retenção, início da contagem por categoria, expurgo de backups/réplicas e anonimização ainda são gates de implementação; esta RPC não aplica retenção.

## 6. Consulta administrativa de conversas e auditoria do domínio — schema no DEV, operações propostas

O DEV contém as tabelas abaixo, aplicadas pelas migrations da PR #156. Todas estão sem policies e sem privilégios de Data API. Nenhuma RPC ou endpoint de consulta administrativa foi implementada; os contratos seguintes são propostas explícitas para revisão e implementação futura.

| Tabela | Campos definidos no schema | Limite atual |
|---|---|---|
| `conversations` | `id`, `organization_id`, `type`, `title`, `visibility`, `department_id`, `created_by`, `status`, pares de usuários para conversa direta, timestamps e arquivamento | Não disponível via API |
| `conversation_members` | organização, conversa, usuário, estado (`invited/active/left/removed`), ator que adicionou e timestamps de ciclo de vida | Não disponível via API |
| `messages` | organização, conversa, remetente, `encrypted_payload` opaco, tipo, metadados de evento de sistema, timestamps e soft delete | Não há plaintext; envelope/criptografia e leitura não implementados |
| `message_attachments` | mensagem/conversa/organização, uploader, bucket/path, nome/MIME, categoria, tamanho, status de scan e exclusão | Metadados apenas; sem bucket privado, scan ou entrega de arquivo |
| `conversation_audit_logs` | `id`, `organization_id`, `conversation_id`, `actor_id`, `target_user_id`, `event_type`, `outcome`, `justification`, `correlation_id`, `metadata`, `created_at` | Append-only; sem leitura/escrita pela Data API |

FKs compostas restringem referências à mesma organização. A trilha de conversas é distinta de `administrative_audit_logs`; não se deve inferir equivalência entre seus eventos.

### Consulta excepcional de conteúdo

A consulta é server-side, separada do acesso normal por participante e da administração de plataforma. Este é o contrato semântico proposto para a futura operação; não existe RPC ou endpoint no DEV.

**Entrada proposta:** `p_conversation_id` (UUID obrigatório), `p_justification` (texto obrigatório e não vazio após `trim`), `p_limit` (padrão proposto 50, máximo proposto 100) e cursor opcional em par: `p_before_created_at` + `p_before_id`. Ordenação proposta: decrescente por `(created_at,id)`; ambos os campos do cursor devem ser enviados juntos. O servidor revalida escopo e grant a cada página. Estes nomes e limites são proposta, não uma RPC existente. `actor_id`, papel, organização e grant nunca vêm do cliente; o servidor deriva a identidade da sessão. Ainda não há tamanho máximo de justificativa aprovado.

**Resposta semântica proposta:**

```json
{
  "conversation": {
    "id": "uuid",
    "organization_id": "uuid",
    "type": "channel | direct | group",
    "department_id": "uuid | null"
  },
  "messages": [
    {
      "id": "uuid",
      "sender_id": "uuid",
      "message_type": "string",
      "encrypted_payload": "envelope opaco; formato ainda depende da decisão de criptografia",
      "created_at": "2026-01-01T00:00:00Z",
      "edited_at": "2026-01-01T00:00:00Z | null",
      "deleted_at": "2026-01-01T00:00:00Z | null",
      "attachments": [
        { "id": "uuid", "file_category": "image | video | audio | document", "detected_mime_type": "string", "size_bytes": 0, "scan_status": "string", "created_at": "2026-01-01T00:00:00Z" }
      ]
    }
  ],
  "page": { "page_size": 50, "next_cursor": "opaque | null", "has_more": false }
}
```

Os campos são uma projeção semântica proposta sobre o schema agora existente, não uma resposta de API implementada. O banco armazena `encrypted_payload` opaco; não existe formato de descriptografia aprovado. O limite 50/100 também é proposta para revisão, não limite implementado. Não devolver bytes de anexo, chaves internas, URL pública ou conteúdo fora do grant.

A capability `conversations.exceptional_read` é nominativa, separada, com escopo definido, validade e expiração. Concedê-la exige duas decisões registradas: Direção/Chefia e TI autorizado; sem autoaprovação ou aprovação do leitor para si. RPGD faz supervisão de privacidade, não substitui aprovadores e não recebe conteúdo por esse papel. Cada leitura exige justificativa e auditoria persistida antes da divulgação; falha de autorização, escopo ou auditoria nega a consulta. `platform_admin` e `it_support` não têm acesso automático a conteúdo.

Erros semânticos propostos: `AUTHENTICATION_REQUIRED` (sessão ausente), `FORBIDDEN` (sem aprovação/grant/escopo), `NOT_FOUND` (inexistente ou fora do escopo sem revelar existência), `VALIDATION_ERROR` (entrada/cursor inválido) e `SERVICE_UNAVAILABLE` (auditoria ou serviço indisponível; nenhum conteúdo parcial). O transporte/códigos HTTP devem ser fechados no contrato de implementação; ainda não existe envelope de erro para essa operação.

### Auditoria de conversas

`conversation_audit_logs` existe como tabela append-only. Campos físicos: `id`, `organization_id`, `conversation_id`, `actor_id`, `target_user_id`, `event_type`, `outcome` (`allowed|denied`), `justification`, `correlation_id`, `metadata` objeto e `created_at`. Não há RPC de escrita/leitura ou grants/policies.

**Consulta proposta:** filtros opcionais por `conversation_id`, `actor_id`, `target_user_id`, `event_type`, `outcome` e intervalo de `created_at`; ordem decrescente estável por `(created_at,id)`; `p_limit` padrão 50/máximo 100 e cursor com os dois campos. Resposta limitada aos campos da tabela acima, sem conteúdo de mensagens/anexos. Filtros, página e projeções por papel ainda dependem de decisão conjunta. Não duplicar eventos de `administrative_audit_logs` (#97).

O acesso ao histórico administrativo completo (`audit.read`) é exclusivo de `platform_admin`; `it_support` e colaboradores comuns não o consultam. RPGD pode supervisionar somente registros necessários ao ciclo de aprovação, concessão, renovação, revogação e consulta excepcional; essa permissão não dá acesso ao conteúdo das conversas. Não gravar corpo de mensagem, plaintext, conteúdo de anexo, tokens ou credenciais. Campos físicos já existem; consulta, filtros, papéis e paginação seguem como contrato semântico proposto, sem endpoint ativo.

Retenção de cinco anos vale às categorias abrangidas pela decisão da PO; marcos iniciais de contagem por categoria, holds, política de backup e expurgo seguro permanecem pendências, conforme ADR-001 v1.3. Não usar a antiga proposta de 12 meses.

## 7. Erros e comportamento da interface

Auth e PostgREST continuam retornando os objetos de erro Supabase, não o envelope CONNEXA3 anterior. SQLSTATEs acima descrevem as RPCs; não presumir que todos mapeiem a códigos HTTP próprios ou que a mensagem possa ser exibida. A UI deve tratar:

- sessão ausente/expirada: solicitar autenticação;
- `42501`: acesso negado sem expor existência/escopo de recursos;
- `22023`: entrada inválida com mensagem local genérica/associada ao campo;
- `P0002`, `23503`, `23505`, `23514`: estado/referência inválida, sem detalhes SQL;
- indisponibilidade/timeout: permitir nova tentativa segura e não exibir dados parciais.

Operações mutáveis de administração usam transação no banco e escrevem auditoria antes/de forma atômica com a alteração quando aplicável. Em caso de erro, não apresentar sucesso otimista como estado confirmado.

## 8. Mudanças e validação conjunta

1. A pessoa que propõe a mudança abre PR antes de integrar e atualiza este contrato no mesmo PR da migration/implementação. Cada elemento fica marcado como **implementado**, **proposto** ou **depreciado**.
2. A descrição do PR registra motivação, campos/tipos/nullability, exemplos de entrada/resposta, erros, autorização, paginação, impacto de compatibilidade e plano para consumidores; explicita o impacto para Back-end e Front-end.
3. A pessoa autora comunica a mudança na issue #106 e vincula o PR. Solicita revisão dos representantes de Back-end e Front-end; decisões de privacidade/produto registram também responsável e decisão.
4. Revisores comparam contrato e implementação. Dúvidas viram questões explícitas na documentação, sem presumir comportamento. Aprovações são registradas no PR antes do merge.
5. Mudança incompatível registra migração de consumidores e janela de coexistência; mudança compatível documenta defaults e tratamento de campos ausentes.
6. Migrations são revisadas/versionadas e aplicadas primeiro em `connexa-dev`; evidência fica no PR. Este processo não autoriza alteração em Production.
7. A validação conjunta de Back-end, Front-end, Tech Lead e SQA será realizada na etapa final da issue, antes do aceite.

### Checklist da versão 1.2

- [x] Atualizado baseline a partir do banco `connexa-dev` e da `main` em 26/11/2026.
- [x] Contratos de perfil próprio e departamentos descritos a partir dos campos/RPCs reais.
- [x] Auditoria administrativa documenta campos, limite de consulta, autorização, append-only e cursor composto `(occurred_at,id)`.
- [x] Consulta administrativa de conversas e auditoria de conversas separadas do que existe hoje.
- [ ] Back-end validou os contratos e a limitação/correção de paginação.
- [ ] Front-end validou os mesmos exemplos, erros e limites.
- [ ] PO/privacidade validou a aplicação da regra de acesso excepcional/retenção aos consumidores.
- [x] Documentar processo de comunicação, documentação, revisão e compatibilidade antes da integração.
- [ ] Validar a chamada PostgREST paginada com sessão autorizada e eventos reais de auditoria (etapa final).
- [ ] Alinhar PR #153 e migrations da #97 com `main` antes de anunciar integração de dispositivos/auditoria.

## Referências

- [Issue #106 — contratos de integração](https://github.com/ymer190/CONNEXA3/issues/106)
- [Contrato do domínio de departamentos — #95](./department-domain-issue-95.md)
- [Autorização e permissões — #96](../architecture/authorization-permissions-issue-96.md)
- [ADR-001 v1.3 — segurança e retenção](../architecture/ADR-001_v1.3_proposta_consolidada_SQA.md)
- [PR #131 — documentação dos contratos](https://github.com/ymer190/CONNEXA3/pull/131)
- [PR #153 — dispositivos/sessões/auditoria](https://github.com/ymer190/CONNEXA3/pull/153)
