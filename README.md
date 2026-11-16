# CONNEXA3

Plataforma web de **comunicação corporativa interna**, com experiência mobile-first inspirada na praticidade conversacional do WhatsApp. O produto é destinado à comunicação entre colaboradores de uma organização, com conversas individuais, grupos e espaços de comunicação corporativos.

## Direção do produto

O CONNEXA3 não é uma plataforma de atendimento a clientes nem uma inbox compartilhada de suporte. Seu foco é a comunicação interna segura entre colaboradores.

Princípios:
- **Comunicação individual e em grupos:** conversas entre colaboradores e espaços coletivos.
- **Organização corporativa:** colaboradores, departamentos, grupos e permissões administradas conforme regras do negócio.
- **Privacidade:** isolamento dos dados por organização e autorização aplicada no Supabase.
- **Tempo real:** atualização de mensagens e histórico persistente.
- **Mobile-first:** experiência prioritariamente projetada para celulares, com suporte a desktop.
- **Segurança:** autenticação pelo Supabase Auth, políticas RLS e nenhuma credencial privilegiada exposta ao navegador.

## Stack e infraestrutura

- **GitHub:** código-fonte, documentação, revisão e automações CI.
- **Vercel:** hospedagem e deploy da aplicação web.
- **Supabase:** Auth, PostgreSQL, Row Level Security e Realtime.
- **Next.js, React e TypeScript:** aplicação web.

Os ambientes de execução e serviços do projeto são online: GitHub, Vercel e Supabase. Não versionar chaves, tokens, senhas ou credenciais.

## Arquitetura de dados

A base inicial já contempla organizações, perfis, vínculos de membros e administradores da plataforma. A estrutura de canais, grupos, conversas individuais, participantes e mensagens está em evolução e deve seguir o documento [Reconciliação arquitetural](docs/architecture/database-reconciliation.md) e o [Modelo de dados](docs/architecture/database-model.md).

Nenhuma nova migration deve ser aplicada em produção sem revisão, validação no ambiente DEV e aprovação explícita.

## Ambientes

- **Desenvolvimento:** branch principal de trabalho e projeto Supabase DEV, com deploys de validação pela Vercel.
- **Produção:** projeto Supabase PROD e deploy de produção pela Vercel, protegidos por revisão e aprovação.

A integração GitHub–Vercel realiza os deploys vinculados ao repositório. As automações do GitHub Actions devem validar o código e, em fluxo separado e controlado, aplicar migrations aprovadas no Supabase.

## Documentação

- `docs/architecture/database-model.md`: modelo lógico inicial e regras de isolamento.
- `docs/architecture/database-reconciliation.md`: comparação entre documentação, backlog e schema atual do Supabase DEV.

