# Contrato do domínio de departamentos — Issue #95

**Estado:** domínio de dados e operações iniciais implementados e validados no Supabase DEV.  
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

As operações abaixo foram adicionadas em migration na branch da PR. **Ainda aguardam aplicação/validação no DEV**:

- `public.admin_update_department(uuid, uuid, text)`: altera nome de departamento ativo.
- `public.admin_deactivate_department(uuid, uuid)`: bloqueia a linha do departamento (`FOR UPDATE`), desativa o departamento e encerra seus vínculos ativos na mesma transação, preservando cada linha como histórico. O bloqueio serializa a desativação com a validação de novas associações/transferências.
- `public.admin_list_department_members(uuid, uuid)`: consulta vínculos atuais e históricos do departamento.
- `public.admin_transfer_department_member(uuid, uuid, uuid)`: encerra o vínculo anterior e cria o novo em transação; usa lock transacional por colaborador para serializar transferências concorrentes. O trigger também bloqueia o departamento de destino com `FOR SHARE`, coordenando a operação com desativações.

Por enquanto, essas operações continuam restritas a `platform_admin`. Não liberamos capacidades de `collaborator` por falta de contrato/tabela de concessão explícita estabilizada na #92/#96. Não há promoção automática de gestor nem confiança em papel informado pelo cliente.

Teste de regressão adicionado: `supabase/tests/issue_95_department_management.sql`. Ele cobre edição, consulta de vínculos, transferência, preservação de histórico, desativação e negação para colaborador comum. A execução no DEV ainda está pendente da aplicação controlada da nova migration.

## 3. Segurança e privilégios

- RLS habilitado em `departments` e `department_members`.
- `anon` e `authenticated` não têm privilégios diretos de tabela.
- `service_role` tem privilégios de tabela para operações server-side confiáveis; nunca expor a chave ao browser.
- As RPCs acima têm EXECUTE somente para `authenticated`; as próprias funções verificam `auth.uid()` e `platform_admin`.
- `it_support` não tem permissão administrativa departamental.
- A categoria `collaborator` e capacidades explícitas `departments.read` / `departments.members.manage` ainda dependem da implementação coordenada das Issues #92/#96. Não conceder acesso por inferência de `organization_members.role` legado.
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

Suíte `supabase/tests/issue_95_department_integrity.sql`: 16/16 verificações aprovadas no Supabase DEV. A suíte executa fixtures em transação e termina com `ROLLBACK`; foi confirmado que nenhum fixture permaneceu.

## 6. Próximas entregas

- Aplicar e validar no DEV a migration da Etapa 2 e a suíte de regressão de gestão.
- Integrar eventos de auditoria pelo contrato da #97 antes de considerar edição/desativação/transferência prontas para produção.
- Implementar capacidades explícitas de colaboradores e escopo por departamento após estabilização do modelo de colaboradores (#92) e da autorização (#96).
- Integrar metadados de grupos ao modelo canônico de conversas quando a #96 disponibilizar o schema/serviços.
- Não aplicar alterações em PROD sem validação e aprovação explícita.
