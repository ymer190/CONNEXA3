# Reconciliação arquitetural — comunicação interna

**Status:** diagnóstico concluído; decisões de modelagem pendentes antes de novas migrations  
**Ambiente inspecionado:** Supabase DEV (`dzsacdtolxrqgwlekzdg`)  
**Produção:** não alterada

## 1. Direção de produto confirmada

O CONNEXA3 é uma plataforma corporativa interna de comunicação, com experiência mobile-first semelhante ao WhatsApp. Não é uma plataforma de atendimento a clientes com inbox compartilhada, etiquetas de atendimento ou integração de canais externos.

A documentação e o backlog devem usar essa direção como fonte de verdade.

## 2. Estado observado no Supabase DEV

O schema `public` contém quatro tabelas próprias:

| Tabela | Situação | Observação |
|---|---|---|
| `organizations` | Implementada | Organização/empresa |
| `profiles` | Implementada | Perfil associado a `auth.users` |
| `organization_members` | Implementada | Um vínculo por usuário; papéis owner/admin/member; status active/suspended |
| `platform_users` | Implementada | Papel administrativo da plataforma, separado dos papéis da organização |

As quatro tabelas estão com RLS habilitado. Foram observadas seis policies, a função `public.set_updated_at()` e três triggers de atualização. O DEV possui uma linha em `platform_users`; essa linha é dado operacional e não deve ser transportada por migration.

### Migrations registradas no DEV

| Versão | Nome | Conteúdo |
|---|---|---|
| `20261102003616` | `create_organizations_profiles_and_members` | Cria organizations, profiles, organization_members, índices, função/trigger de updated_at, RLS, grants e policies |
| `20261107201938` | `create_platform_users` | Cria platform_users, RLS, grants e policy de leitura do próprio papel |

Os SQLs originais foram recuperados do ledger de migrations do Supabase DEV e versionados, sem alteração intencional de conteúdo, em `supabase/migrations/` com os mesmos timestamps e nomes. Não reaplicar essas migrations no DEV: elas já constam no ledger. O PROD não foi alterado nesta atividade.

## 3. Comparação com o modelo documentado

O documento `docs/architecture/database-model.md` descreve seis tabelas de aplicação:

- `organizations`
- `profiles`
- `organization_members`
- `channels`
- `channel_members`
- `messages`

Comparação:

| Elemento | Documentação | Supabase DEV | Diagnóstico |
|---|---|---|---|
| Organizações | Previsto | Existe | Alinhado em estrutura inicial |
| Perfis | Previsto | Existe | Alinhado em estrutura inicial |
| Vínculo de membros | Previsto | Existe | Alinhado em estrutura inicial |
| Administradores da plataforma | Issue #91 | Existe como `platform_users` | Implementado separadamente |
| Canais | Previsto | Ausente | Gap |
| Participantes de canais | Previsto | Ausente | Gap |
| Mensagens | Previsto | Ausente | Gap |
| Conversas individuais | Backlog #99 e #108 | Não há estrutura dedicada | Gap e divergência documental |
| Grupos de conversa | Backlog #95, #100 e #108 | Não há estrutura dedicada | Gap; distinguir de departamentos e canais |

## 4. Divergências e decisões necessárias

### 4.1 README fora da direção aprovada

O README da branch main descreve atendimento empresarial, caixa de entrada compartilhada, contatos, etiquetas, responsáveis e respostas rápidas. Também descreve dados fictícios de atendimento. Essa descrição não representa a direção de comunicação interna confirmada. O README foi alinhado nesta branch.

### 4.2 Conversas individuais versus canais

O modelo atual documenta mensagens vinculadas obrigatoriamente a um canal e declara mensagens diretas fora do escopo. Entretanto, as issues #99 e #108 exigem conversas individuais e em grupos.

**Conclusão:** o modelo atual não cobre todo o backlog. Antes de criar tabelas ou migrations, a equipe deve decidir se conversas individuais e grupos serão representados por uma entidade genérica de conversa ou por estruturas distintas. Não criar uma migration presumindo essa decisão.

### 4.3 Departamentos, grupos e canais

A issue #95 diferencia departamentos (estrutura organizacional) de grupos (espaços de conversa). O documento de arquitetura também prevê canais públicos e privados. É necessário formalizar a relação entre esses conceitos e as permissões de TI antes do modelo físico.

### 4.4 Papéis administrativos

O schema diferencia papéis organizacionais (`owner`, `admin`, `member`) de administradores da plataforma (`platform_users`). O backlog também menciona administradores de TI. A autorização deve esclarecer quais operações pertencem ao administrador da plataforma e quais pertencem aos administradores da organização. Não presumir que os papéis são equivalentes.

### 4.5 Regras de isolamento

O modelo documentado exige isolamento por organização, participação explícita em canais privados e autorização independente para metadados e conteúdo. Essas regras precisam ser traduzidas em constraints, policies RLS e testes específicos para cada novo tipo de conversa.

## 5. Pontos positivos e riscos observados

- RLS está habilitado nas quatro tabelas atuais.
- O vínculo único em `organization_members.user_id` implementa a regra documentada de um usuário pertencer a no máximo uma organização.
- O índice único parcial limita a um owner ativo por organização, mas não garante por si só a existência permanente de pelo menos um owner ativo.
- `platform_users` separa o papel administrativo global dos papéis organizacionais.
- O Supabase Security Advisor reportou **Leaked Password Protection Disabled**. Recomenda-se habilitar a proteção contra senhas comprometidas em Auth: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
- O Performance Advisor reportou um índice ainda não utilizado em `organization_members`. Como o DEV tem poucos registros, não remover o índice com base apenas nesse aviso.

## 6. Backlog relacionado

- #37 — arquitetura inicial e modelo de dados.
- #59 — cliente Supabase e configuração segura na aplicação.
- #91 — autenticação e autorização administrativa.
- #95 — departamentos e grupos.
- #99 — interface de conversas individuais.
- #100 — interface de grupos.
- #108 — comunicação individual e em grupos em tempo real.
- #67 e #112 — validação SQA de isolamento e autorização.

A issue #37 documenta a base conceitual; #95, #99 e #108 tornam explícitas necessidades que ainda não estão representadas no schema DEV.

## 7. Plano recomendado

1. Aprovar a distinção funcional entre departamentos, grupos de conversa, canais e conversas individuais.
2. Definir o modelo lógico de conversas, participantes e mensagens, incluindo autoria, ordenação, edição/exclusão, estados de entrega e regras de retenção.
3. Definir a matriz de autorização para owner/admin/member e administrador da plataforma, incluindo leitura de canais privados.
4. Projetar constraints e policies RLS para impedir referências cruzadas entre organizações e acesso indevido a mensagens.
5. Criar migrations incrementais somente após revisão do modelo e dos testes de segurança.
6. **Concluído nesta branch:** versionar as duas migrations históricas recuperadas com os timestamps originais; conferir os arquivos com o SQL recuperado e manter o DEV sem reaplicação.
7. Aplicar e validar novas migrations somente no DEV. Produção permanece bloqueada até revisão e aprovação explícita.

## 8. Limites desta atividade

- Nenhuma tabela, policy, trigger, função ou migration foi alterada no Supabase.
- Nenhuma migration foi aplicada em DEV ou PROD.
- Nenhum dado operacional foi copiado.
- O schema de produção não foi alterado.
- Este relatório é diagnóstico e proposta de sequência; não substitui a aprovação do modelo lógico detalhado.
