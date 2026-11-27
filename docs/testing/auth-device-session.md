# Auth, sessão, dispositivo e auditoria: plano de validação

## Testes locais sem credenciais

Execute:

```sh
npm run test:auth
npm run lint
npm run typecheck
npm run build
```

`test:auth` cobre redirecionamentos internos seguros e diferencia sessão ausente, token expirado e falha temporária de autenticação. Esses casos rodam sem Supabase, conta de usuário ou segredo de CI.

A suíte também compara os nomes e a ordem dos argumentos enviados pela aplicação com a assinatura mais recente das RPCs nas migrations locais da #153. Ela cobre registro de dispositivo, listagem, aprovação/revogação, revogação de sessão e cursor composto da auditoria. Isso detecta divergências de contrato sem depender de credenciais ou de uma instância Supabase ativa.

No Supabase DEV, a assinatura efetivamente instalada de `admin_approve_device` é `(p_device_id uuid, p_justification text)`. A aplicação e o teste de contrato usam exatamente esses dois argumentos. O contrato de três argumentos com referência de chamado pertence às migrations avançadas 10200/10300, adiadas e não aplicadas ao DEV. Os testes autenticados de SQA continuam documentados como pendentes.

## Testes que dependem de ambiente isolado e credenciais

Os testes abaixo não devem apontar para Production ou `connexa-dev`; usam usuários e dispositivos descartáveis em um projeto Supabase de SQA isolado. O workflow `issue-97-sqa.yml` exige `scripts/assert-isolated-supabase.cjs` antes das operações e aplica as migrations apenas nesse projeto. A configuração de Auth do SQA deve permitir duas sessões simultâneas por usuário para validar que o logout local mantém a outra sessão ativa.

| Fluxo | Teste preparado | Dependências externas |
|---|---|---|
| Login de usuário comum e negação da área administrativa | `scripts/auth-regular-user-smoke.cjs` | URL/chave publishable do Supabase SQA, credenciais de usuário comum, Chromium e chave service role do projeto isolado para limpar a sessão/dispositivo de teste |
| Login de `platform_admin`, dispositivo autorizado, renovação após reload, logout local sem derrubar outra sessão e bloqueio de dispositivo novo | `scripts/auth-admin-smoke.cjs` | URL/chave publishable/service role do SQA isolado, conta `platform_admin`, Chromium e acesso às RPCs/migrations da #97 |
| RPCs de autorização, registro/vínculo de dispositivo e auditoria de sessão | `scripts/department-rpc-security-smoke.cjs` | usuários comum/admin, dispositivo aprovado com segredo de teste, chave publishable e banco isolado |
| Regressões de estrutura, auditoria, revogação e migrations | `scripts/issue97-sqa-migration-validation.sh` e fixtures associadas | URL PostgreSQL e credenciais do projeto SQA isolado; executa-se com rollback/cleanup conforme o script |

Configure os valores somente em um GitHub Actions Environment protegido para SQA. Nunca registre senhas, tokens, segredo de dispositivo, `service_role` ou URL de banco nos comentários da Issue/PR, logs ou arquivos versionados.

## Resultados que devem ser confirmados antes de aprovar a integração

- Sessão sem autenticação retorna ao login; sessão expirada volta ao login com mensagem adequada; indisponibilidade de Auth/RPC mostra estado temporário e não é confundida com aprovação pendente.
- Dispositivo novo permanece bloqueado até aprovação; dispositivo revogado e sessão revogada não acessam rotas protegidas; dispositivo autorizado persiste após reload.
- Logout encerra somente a sessão atual e não derruba sessões em outros navegadores.
- Aprovação, revogação e consulta de dispositivos/sessões retornam erros seguros e criam os eventos de auditoria esperados no servidor.
- Usuário comum não acessa rotas nem operações administrativas, mesmo invocando server actions diretamente.
- Redirecionamento pós-login só aceita destino relativo da própria aplicação.

Os testes autenticados acima permanecem pendentes até existir ambiente SQA isolado, credenciais descartáveis para dois perfis e usuários/dispositivos de teste. Os testes locais e de CI verificam contratos estáticos e comportamento sem credenciais; não comprovam autorização efetiva no banco, isolamento entre usuários, persistência de auditoria, revogação real nem o comportamento de sessão entre navegadores. Portanto, autenticação, dispositivos e auditoria não estão integralmente homologados.
