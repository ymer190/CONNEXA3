# Auditoria de prontidão da infraestrutura — 16/11/2026

## Escopo e método

Auditoria de leitura nas integrações online do GitHub, Vercel e Supabase. Nenhuma configuração, variável, migration, dado, deploy ou branch principal foi alterado durante a auditoria.

Repositório: ymer190/CONNEXA3  
Commit de referência: 81f36abddd037fe27bc5f05c8cd920282afb6cc3 (merge da PR #127).

## Resumo executivo

| Área | Situação observada | Próxima ação |
|---|---|---|
| GitHub Actions CI | Workflow Validate application presente; PR #127 integrada | Manter e monitorar |
| Proteção de main | API de branch informa protected: false; lista de rulesets vazia | Configurar proteção administrativa |
| Supabase DEV | 3 migrations aplicadas; 4 tabelas públicas; RLS habilitado nas 4 | Completar o modelo de dados após alinhamento com Back-end |
| Supabase PROD | Projeto saudável; ledger de migrations vazio; nenhuma tabela no schema public | Preparar bootstrap somente após validação do DEV |
| Vercel Preview | Duas variáveis públicas Supabase configuradas para Preview/DEV | Manter isolado de PROD |
| Vercel Production | Nenhuma variável de ambiente de produção listada | Configurar somente após PROD estar pronto |
| Deploy Vercel Production | Último deploy observado em READY, originado da main no commit da PR #127 | Estado do deploy não comprova conectividade funcional com Supabase |

## GitHub

- Branch padrão: main.
- Commit de referência: 81f36abddd037fe27bc5f05c8cd920282afb6cc3.
- A leitura do endpoint de branch retornou protected: false e proteção de status checks desabilitada.
- A consulta de rulesets do repositório retornou lista vazia.
- A leitura detalhada do endpoint clássico de branch protection não foi autorizada pela integração. A resposta do endpoint de branch, entretanto, informa que a branch não está protegida.
- O workflow de CI define o check de job Validate application.

**Recomendação:** habilitar regra de proteção para main, exigindo PR, pelo menos uma aprovação e o check Validate application; bloquear force-push e exclusão da branch. A configuração administrativa não foi alterada nesta auditoria.

## Supabase

### DEV — connexa-dev

- Projeto saudável.
- Ledger contém as migrations:
  - 20261102003616_create_organizations_profiles_and_members
  - 20261107201938_create_platform_users
  - 20261113190924_harden_public_table_privileges
- O schema public contém quatro tabelas: organizations, profiles, organization_members e platform_users.
- RLS está habilitado nas quatro tabelas.
- As versões do ledger correspondem aos arquivos de migration existentes na branch main.

### PROD — connexa

- Projeto saudável.
- Ledger de migrations vazio.
- Nenhuma tabela encontrada no schema public.
- Nenhuma migration foi executada e nenhuma configuração de produção foi alterada.
- A orientação do gestor de tecnologia é iniciar o ambiente de aplicação do zero. As estruturas gerenciadas pelo Supabase devem ser preservadas.

**Bloqueio:** não executar migrations PROD nem habilitar SUPABASE_PROD_MIGRATIONS_ENABLED até que o modelo final seja implementado e validado em DEV e exista plano de bootstrap revisado. A confirmação de que PROD começa do zero elimina a necessidade de preservar dados de aplicação legados, mas não substitui a aprovação para executar migrations.

### Security Advisors — DEV

Consulta somente de leitura realizada em 16/11/2026:

- **Segurança:** um aviso WARN foi retornado: auth_leaked_password_protection — proteção contra senhas comprometidas está desabilitada no Supabase Auth. A recomendação oficial é habilitar a proteção contra senhas vazadas para impedir o uso de credenciais conhecidas por vazamentos.
- **Performance:** um aviso informativo INFO apontou o índice organization_members_organization_id_idx como ainda não utilizado. Como o banco tem poucos registros e uso limitado, isso não justifica removê-lo agora.
- Não foram realizadas alterações de configuração ou schema em resposta aos avisos.

**Ação recomendada:** responsável de Back-end/Security avaliar e habilitar a proteção contra senhas vazadas no projeto DEV, testar o fluxo de cadastro/alteração de senha e documentar a decisão antes de replicar a configuração em PROD. Reavaliar o índice somente com carga e evidência de uso suficientes.

## Divergência entre modelo documentado e schema DEV

O documento docs/architecture/database-model.md descreve seis tabelas de negócio: organizations, profiles, organization_members, channels, channel_members e messages.

As migrations atualmente presentes na main criam as três primeiras e também platform_users. No banco DEV, a auditoria encontrou essas quatro tabelas; ainda não encontrou channels, channel_members ou messages.

A PR #126 permanece aberta e propõe alinhar a documentação ao escopo de comunicação corporativa interna. Ela explicita que conversas individuais e grupos previstos nas issues #99/#108 ainda não estão cobertos pelo modelo físico e que a decisão entre departamentos, grupos de conversa, canais e conversas individuais precisa ser validada antes de criar migrations.

**Ação necessária:** Back-end deve concluir o modelo de domínio e os contratos de mensagens/grupos; em seguida, implementar e testar as migrations e políticas RLS ausentes em DEV. Não criar tabelas isoladamente antes dessa validação, para evitar duplicidade entre departamentos, grupos e canais.

## Vercel — projeto connexa-3

- Runtime Node configurado como 22.x.
- Foram encontradas duas variáveis públicas do Supabase, ambas restritas ao target Preview e apontando para DEV.
- Nenhuma variável de ambiente de Production foi listada.
- O projeto tem SSO protection habilitado para deployments protegidos.
- O último deployment de Production observado está em READY e foi criado a partir da main no commit da PR #127.
- O Preview da PR #129 foi criado com status READY.
- Um deployment READY confirma o estado do build/deploy, não a integração funcional com um banco de produção.

**Recomendação:** manter Preview apontando para DEV. Configurar Production com URL e publishable key do projeto PROD somente após o bootstrap do banco e a validação do schema.

## Plano de ação seguro

1. Configurar a proteção da branch main no GitHub.
2. Back-end concluir a revisão do domínio: departamentos, grupos de conversa, canais e conversas individuais; validar PR #126 e contratos #106.
3. Back-end implementar migrations e políticas RLS em DEV, por incremento, com testes de acesso permitido e negado.
4. Responsável de Back-end/Security avaliar a proteção contra senhas vazadas no Supabase Auth DEV e validar os fluxos afetados.
5. Atualizar a documentação para refletir exatamente o modelo e schema aprovados.
6. Planejar o bootstrap de PROD a partir das migrations aprovadas em DEV e obter aprovação explícita antes de executar.
7. Só então configurar as variáveis Production na Vercel e validar o fluxo ponta a ponta.

## Limites desta auditoria

- Não foi possível inspecionar valores de GitHub Secrets/Variables pela integração; sua existência e conteúdo não foram atestados.
- O valor da variável GitHub SUPABASE_PROD_MIGRATIONS_ENABLED não foi verificado. O workflow de produção exige essa variável igual a true e uma confirmação manual YES.
- A leitura de tabelas Supabase nesta auditoria foi focada no schema public; a ausência de tabelas nele não deve ser interpretada como ausência absoluta de objetos em todos os schemas.
- Os Security Advisors foram consultados no projeto DEV; os avisos não representam, por si só, prova de exploração.
- Nenhuma alteração operacional foi realizada.
