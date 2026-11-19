# Contrato do domínio de departamentos — Issue #95

**Estado:** Etapas 1 e 2 aplicadas no Supabase DEV; operações de gestão validadas funcionalmente em transação. A suíte pgTAP da Etapa 2 ainda precisa de relatório integral reproduzível.  
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

Teste de regressão versionado: `supabase/tests/issue_95_department_management.sql`, com 9 assertions pgTAP previstas. A ferramenta SQL utilizada não apresentou o relatório completo do pgTAP; foi executada validação transacional complementar das operações de edição, listagem, transferência, preservação do histórico, desativação e negação para colaborador comum. Os fixtures foram revertidos e a consulta posterior confirmou zero usuários, departamentos e vínculos de teste residuais. Não declarar 9/9 pgTAP até obter relatório integral.

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

- Obter relatório completo e reproduzível dos 9 testes pgTAP da Etapa 2.
- Integrar eventos de auditoria pelo contrato da #97 antes de considerar edição/desativação/transferência prontas para produção.
- Implementar capacidades explícitas de colaboradores e escopo por departamento após estabilização do modelo de autorização/capacidades na #96 e das transições de status de conta na #94. A #92 trata do cadastro de contas.
- Integrar metadados de grupos ao modelo canônico de conversas quando a #96 disponibilizar o schema/serviços.
- Migration de índices de FKs adicionada para cobrir `department_id, organization_id`, `user_id, organization_id`, `created_by` e `ended_by`, conforme advisor de performance; aguarda execução automática no DEV.
- Advisor de segurança: RLS sem policies é intencional porque `anon`/`authenticated` não têm acesso direto às tabelas; RPCs `SECURITY DEFINER` no schema público são endpoints privilegiados intencionais, limitados por `auth.uid()`, checagem server-side de `platform_admin`, `search_path` vazio e grants explícitos. Manter como item de revisão/hardening, não ignorar o alerta.
- Workflow GitHub Actions de aplicação DEV e validação da aplicação concluídos com sucesso para o commit anterior; Vercel Preview Ready. A nova migration de índices deve passar pelo mesmo fluxo.
- PR #132 permanece Draft e não foi mergeada.
- Não aplicar alterações em PROD sem validação e aprovação explícita.
