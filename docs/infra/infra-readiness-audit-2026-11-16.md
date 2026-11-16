# Auditoria de prontidão da infraestrutura — 16/11/2026

## Escopo e método

Auditoria de leitura nas integrações online do GitHub, Vercel e Supabase. Nenhuma configuração, variável, migration, dado, deploy ou branch principal foi alterado durante a auditoria.

Repositório: `ymer190/CONNEXA3`  
Commit de referência: `81f36abddd037fe27bc5f05c8cd920282afb6cc3` (merge da PR #127).

## Resumo executivo

| Área | Situação observada | Próxima ação |
|---|---|---|
| GitHub Actions CI | Workflow `Validate application` presente; PR #127 integrada | Manter e monitorar |
| Proteção de `main` | API de branch informa `protected: false`; lista de rulesets vazia | Configurar proteção administrativa |
| Supabase DEV | 3 migrations aplicadas; 4 tabelas públicas; RLS habilitado nas 4 | Completar o modelo de dados antes de avançar |
| Supabase PROD | Projeto saudável; ledger de migrations vazio; nenhuma tabela no schema `public` | Não executar migrations até reconciliação |
| Vercel Preview | Duas variáveis públicas Supabase configuradas para Preview/DEV | Manter isolado de PROD |
| Vercel Production | Nenhuma variável de ambiente de produção listada | Configurar somente após PROD estar pronto |
| Deploy Vercel Production | Último deploy observado em `READY`, originado da `main` no commit da PR #127 | Estado do deploy não comprova conectividade funcional com Supabase |

## GitHub

- Branch padrão: `main`.
- Commit de referência: `81f36abddd037fe27bc5f05c8cd920282afb6cc3`.
- A leitura do endpoint de branch retornou `protected: false` e proteção de status checks desabilitada.
- A consulta de rulesets do repositório retornou lista vazia.
- A leitura detalhada do endpoint clássico de branch protection não foi autorizada pela integração. A resposta do endpoint de branch, entretanto, informa que a branch não está protegida.
- O workflow de CI define o check de job `Validate application`.

**Recomendação:** habilitar regra de proteção para `main), exigindo PR, pelo menos uma aprovação e o check `Validate application`; bloquear force-push e exclusão da branch. A configuração administrativa não foi alterada nesta auditoria.

## Supabase

### DEV — `connexa-dev`

- Projeto saudável.
- Ledger contém as migrations:
  - `20261102003616_create_organizations_profiles_and_members`
  - `20261107201938_create_platform_users`
  - `20261113190924_harden_public_table_privileges`
- O schema `public` contém quatro tabelas: `organizations`, `profiles`, `organization_members` e `platform_users`.
- RLS está habilitado nas quatro tabelas.
- As versões do ledger correspondem aos arquivos de migration existentes na branch `main).

### PROD — `connexa`

- Projeto saudável.
- Ledger de migrations vazio.
- Nenhuma tabela encontrada no schema `public`.
- Nenhuma migration foi executada e nenhuma configuração de produção foi alterada.

**Bloqueio:** não executar o workflow de migrations PROD e não habilitar `SUPABASE_PROD_MIGRATIONS_ENABLED` até confirmar formalmente que o banco está destinado a ser inicializado do zero e reconciliar schema, histórico e dados. A ausência de tabelas em `public` não prova, por si só, que não existam dados ou objetos relevantes em outros schemas.

## Divergência entre modelo documentado e schema DEV

O documento `docs/architecture/database-model.md` descreve seis tabelas de negócio: `organizations`, `profiles`, `organization_members`, `channels`, `channel_members` e `messages`.

As migrations atualmente presentes na `main` criam as três primeiras e também `platform_users). No banco DEV, a auditoria encontrou essas quatro tabelas; ainda não encontrou `channels`, `channel_members` ou `messages`.

**Ação necessária:** alinhar o backlog e as migrations futuras ao modelo aprovado, implementando e testando as tabelas e políticas RLS que ainda faltam em DEV. Só depois disso deve ser planejada a inicialização/reconciliação de PROD.

## Vercel — projeto `connexa-3`

- Runtime Node configurado como `22.x`.
- Foram encontradas duas variáveis públicas do Supabase, ambas restritas ao target `Preview` e apontando para DEV.
- Nenhuma variável de ambiente de Production foi listada.
- O projeto tem SSO protection habilitado para deployments protegidos.
- O último deployment de Production observado está em `READY` e foi criado a partir da `main` no commit da PR #127.
- Um deployment `READY` confirma o estado do build/deploy, não a integração funcional com um banco de produção.

**Recomendação:** manter Preview apontando para DEV. Configurar Production com URL e publishable key do projeto PROD somente após a reconciliação do banco e a validação do schema.

## Plano de ação seguro

1. Configurar a proteção da branch `main` no GitHub.
2. Completar as migrations ausentes em DEV, incluindo tabelas de canais/mensagens e políticas RLS, com revisão e testes.
3. Atualizar a documentação do modelo de dados para refletir exatamente o schema implementado.
4. Confirmar se PROD é um ambiente novo e vazio ou se existe histórico/objeto fora do schema `public` que precisa ser preservado.
5. Planejar a inicialização/reconciliação de PROD e obter aprovação explícita antes de executar qualquer migration.
6. Só então configurar as variáveis Production na Vercel e validar o fluxo de ponta a ponta.

## Limites desta auditoria

- Não foi possível inspecionar valores de GitHub Secrets/Variables pela integração; sua existência e conteúdo não foram atestados.
- O valor da variável GitHub `SUPABASE_PROD_MIGRATIONS_ENABLED` não foi verificado. O workflow de produção exige essa variável igual a `true` e uma confirmação manual `YES`.
- A leitura de tabelas Supabase nesta auditoria foi focada no schema `public`; a ausência de tabelas nele não deve ser interpretada como ausência absoluta de objetos em todos os schemas.
- Nenhuma alteração operacional foi realizada.
