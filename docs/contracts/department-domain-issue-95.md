# Contrato do domínio de departamentos — Issue #95

**Estado:** Etapas 1 e 2 do domínio departamental aplicadas e validadas no Supabase DEV. pgTAP Etapa 1: 16/16; Etapa 2: 9/9 assertions aprovadas em execução transacional com relatório integral capturado. Fixtures revertidas; zero resíduos confirmados. 
**Escopo:** departamentos e vínculos de colaboradores. Grupos/conversas continuam sob responsabilidade da Issue #96.

## 1. Entidades disponíveis

### `public.departments`

| Campo | Tipo | Regra |
|---|---|---|
| `id` | uuid | PK, gerado pelo banco |
| `organization_id` | uuid | obrigatório; FK para `organizations.id` |
| `name` | text | obrigatório, não vazio após trim |
| `status` | text | `active` ou `inactive`; padrão `active` |
| `created_at`, `updated_at` | timestamptz | gerados/atualizados pelo banco |

- Nome normalizado é único por organização enquanto o departamento estiver ativo.
- Índice/constraint composto `(id, organization_id)` permite referências tenant-safe.

### `public.department_members`

| Campo | Tipo | Regra |
|---|---|---|
| `id` | uuid | PK |
| `organization_id` | uuid | obrigatório |
| `department_id` | uuid | FK composta com `organization_id` para `departments` |
| `user_id` | uuid | FK composta com `organization_id` para `organization_members` |
| `created_at` | timestamptz | gerado pelo banco |
| `created_by` | uuid | ator confiável, FK Auth, pode ser nulo |
| `ended_at` | timestamptz | nulo enquanto associação atual |
| `ended_by` | uuid | ator que encerrou, pode ser nulo |

- Cada colaborador pode ter no máximo um departamento ativo. A regra é global por usuário, consistente com a unicidade global já existente em `organization_members.user_id`.
- Transferência: encerrar o vínculo atual (`ended_at` e `ended_by`) e criar novo vínculo. O registro anterior permanece como histórico.
- Associações ativas exigem departamento ativo e vínculo organizacional ativo.
- FKs compostas impedem cruzamento de organizações.

## 2. RPCs disponíveis

As operações iniciais são funções PostgreSQL `SECURITY DEFINER`, com `search_path` vazio, identidade obtida de `auth.uid()` e verificação server-side de `platform_users.role = 'platform_admin'`.

### Listar departamentos

`public.admin_list_departments(p_organization_id uuid)`

- Entrada: organização UUID.
- Saída: linhas de `departments` da organização solicitada, ordenadas por nome normalizado e ID.
- Negação: sessão ausente (`28000`) ou usuário sem `platform_admin` (`42501`).

### Criar departamento

`public.admin_create_department(p_organization_id uuid, p_name text)`

- Entrada: organização UUID e nome.
- O nome é normalizado com `btrim`.
- Saída: registro criado.
- Negação: sessão ausente (`28000`), usuário sem `platform_admin` (`42501`), entrada inválida (`22023`), organização inexistente (FK) ou nome ativo duplicado (unique violation).

### Gestão de departamentos e vínculos — Etapa 2 (PR #132)

As operações abaixo foram adicionadas pela migration `20261119214000_add_department_management_rpcs.sql` e já estão aplicadas no Supabase DEV:

- `public.admin_update_department(uuid, uuid, text)`: altera nome de departamento ativo.
- `public.admin_deactivate_department(uuid, uuid)`: bloqueia a linha do departamento (`FOR UPDATE`), desativa o departamento e encerra seus vínculos ativos na mesma transação, preservando cada linha como histórico. O bloqueio serializa a desativação com a validação de novas associações/transferências.
- `public.admin_list_department_members(uuid, uuid)`: consulta vínculos atuais e históricos do departamento.
- `public.admin_transfer_department_member(uuid, uuid, uuid)`: encerra o vínculo anterior e cria o novo em transação; usa lock transacional por colaborador para serializar transferências concorrentes. O trigger também bloqueia o departamento de destino com `FOR SHARE`, coordenando a operação com desativações.

Por enquanto, essas operações continuam restritas a `platform_admin`. Não liberamos capacidades de `collaborator` por falta de contrato/tabela de concessão explícita estabilizada na #92/#96. Não há promoção automática de gestor nem confiança em papel informado pelo cliente.

Teste de regressão versionado: `supabase/tests/issue_95_department_management.sql`. Execução integral no Supabase DEV com captura agregada: **9/9 assertions aprovadas** (edição, persistência, listagem, transferência, preservação de histórico, unicidade do vínculo ativo, desativação, encerramento do vínculo e negação a colaborador comum). A execução foi revertida; consulta posterior confirmou zero fixtures residuais em `auth.users`, `profiles`, `organizations`, `departments` e `department_members`.

## 3. Segurança e privilégios

- RLS habilitado em `departments` e `department_members`.
- `anon` e `authenticated` não têm privilégios diretos de tabela.
- `service_role` tem privilégios de tabela para operações server-side confiáveis; nunca expor a chave ao browser.
- As RPCs acima têm EXECUTE somente para `authenticated`; as próprias funções verificam `auth.uid()` e `platform_admin`.
- `it_support` não tem permissão administrativa departamental.
- A categoria `collaborator` e capacidades explícitas `departments.read` / `departments.members.manage` ainda dependem do modelo explícito de permissões/capacidades da #96 e da validação do ciclo de vida da conta na #94. A #92 cobre criação/cadastro de contas, não é a fonte de autorização. Não conceder acesso por inferência de `organization_members.role` legado.
- Gestão de participantes não concede acesso ao conteúdo de conversas.

## 4. Integração com Issue #96

A #96 deve manter o modelo canônico:
- `conversations` com `type = 'group'`;
- `conversation_members` como participantes;
- `messages` como mensagens;
- sem tabelas paralelas `groups` ou `group_members`.

Quando a #96 criar `conversations`, a referência tenant-safe recomendada é:

```sql
department_id uuid null,
foreign key (department_id, organization_id)
  references public.departments (id, organization_id)
```

A FK exige que `conversations` possua `organization_id` e que a chave composta esteja no mesmo escopo. Conversas sem departamento usam `department_id = null`. A #96 continua dona de RLS, participantes, mensagens e autorização de conteúdo.

## 5. Validação DEV

Migrações registradas no Supabase DEV:
- `20261119212410_create_departments_and_department_members`
- `20261119212543_fix_department_member_scope_error_codes`
- `20261119212759_add_platform_admin_department_rpcs`
- `20261119214000_add_department_management_rpcs`
- `20261119215400_add_department_member_fk_indexes`

Suíte `supabase/tests/issue_95_department_integrity.sql`: 16/16 verificações aprovadas no Supabase DEV. A suíte executa fixtures em transação e termina com `ROLLBACK`; foi confirmado que nenhum fixture permaneceu.

## 6. Próximas entregas

- Integração de eventos de auditoria pelo contrato da #97 antes de promover as operações administrativas a produção.
- Integrar eventos de auditoria pelo contrato da #97 antes de considerar edição/desativação/transferência prontas para produção.
- Implementar capacidades explícitas de colaboradores e escopo por departamento após estabilização do modelo de autorização/capacidades na #96 e das transições de status de conta na #94. A #92 trata do cadastro de contas.
- Integrar metadados de grupos ao modelo canônico de conversas quando a #96 disponibilizar o schema/serviços.
- Migration `20261119215400_add_department_member_fk_indexes` aplicada no DEV; os quatro índices de FKs foram verificados. O advisor deixou de reportar FKs sem índice e passou a sinalizar os novos índices como ainda não utilizados, esperado no ambiente DEV sem carga representativa.
- Advisor de segurança: RLS sem policies é intencional porque `anon`/`authenticated` não têm acesso direto às tabelas; RPCs `SECURITY DEFINER` no schema público são endpoints privilegiados intencionais, limitados por `auth.uid()`, checagem server-side de `platform_admin`, `search_path` vazio e grants explícitos. Manter como item de revisão/hardening, não ignorar o alerta.
- Workflow GitHub Actions de aplicação DEV, CI e Vercel Preview foram reportados como concluídos com sucesso no commit validado da PR #132.
- PR #132 está aberta, pronta para revisão (`draft: false`) e não foi mergeada.
- PROD não foi alterado; qualquer promoção exige validação e aprovação explícita.

## 7. Dependências de ciclo de vida, autorização HTTP e auditoria — gate de produção

### Ciclo de vida de conta/vínculo (#94)

O trigger de `department_members` valida que o vínculo em `organization_members` está ativo no momento da criação/atualização da associação. **Ele não encerra automaticamente uma associação departamental que já esteja ativa quando o status do colaborador ou de seu vínculo organizacional mudar posteriormente.**

Até a entrega da #94:
- Não usar a existência de `department_members` como prova suficiente de autorização.
- Não habilitar capabilities departamentais de `collaborator` nem usar a associação como base isolada de RLS.
- As seis RPCs desta entrega permanecem restritas a `platform_admin` e fazem sua checagem server-side.
- A #94 deve coordenar a transição de status com o encerramento/neutralização do vínculo departamental e a invalidação de sessões, conforme o estado final aprovado.

### Testes de autorização por PostgREST/JWT

O Security Advisor aponta seis funções `SECURITY DEFINER` executáveis por `authenticated`. Essa exposição é intencional para chamadas RPC via PostgREST, mas o grant não substitui autorização: cada função valida `auth.uid()` e o papel `platform_admin` no servidor.

A aprovação final exige evidência HTTP com JWTs reais cobrindo, no mínimo:
- chamada sem sessão/JWT;
- usuário autenticado comum;
- `it_support`;
- conta/vínculo organizacional inativo;
- IDs de organização/departamento fora do escopo;
- `platform_admin` autorizado no escopo válido.

Até a captura e revisão dessa evidência, os seis avisos WARN permanecem registrados como risco conhecido; não considerar a revisão de código ou testes SQL simulados como substitutos do teste PostgREST.

### Auditoria administrativa (#97)

As RPCs atuais não gravam a trilha central de auditoria. A integração deve usar o contrato e o mecanismo únicos da #97, sem tabela ou log paralelo. Criação, edição, desativação e transferência departamental não estão liberadas para produção antes dessa integração e validação de autorização/auditoria.

### Advisor e acesso direto às tabelas

Os avisos INFO de RLS habilitado sem policies em `departments` e `department_members` são intencionais: o acesso direto de `anon` e `authenticated` às tabelas está revogado. A consulta/mutação ocorre apenas pelas RPCs protegidas. O aviso geral de proteção contra senhas vazadas pertence à configuração de Auth do projeto, não ao escopo da #95.

**Nota sobre `it_support`:** o schema atual de `public.platform_users` possui `CHECK (role = 'platform_admin')`; portanto, `it_support` não pode ser cadastrado nessa tabela nem satisfazer a guarda das RPCs departamentais. O teste PostgREST com JWT de usuário autenticado comum valida a negação para identidades sem registro `platform_admin`. Isso não substitui a validação específica de sessão/conta desativada, que depende da #94.
