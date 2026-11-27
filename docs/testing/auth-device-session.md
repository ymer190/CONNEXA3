# Auth, sessão, dispositivo e auditoria: plano de validação

## Testes locais sem credenciais

Execute:

```sh
npm run test:auth
npm run lint
npm run typecheck
npm run build
```

`test:auth` cobre redirecionamentos internos seguros, tratamento de falhas de autenticação e contratos das RPCs usados pela aplicação. Esses casos rodam sem Supabase, conta de usuário ou segredo de CI.

No Supabase DEV, a assinatura efetivamente instalada de `admin_approve_device` é `(p_device_id uuid, p_justification text)`. A aplicação e os testes usam exatamente esses dois argumentos.

## Escopo adiado e testes SQA pendentes

As migrations avançadas `20261126010200` e `20261126010300` foram retiradas da integração básica e preservadas na branch `feature/issue-97-deferred-sqa-migrations`. Elas não fazem parte desta PR e não devem ser aplicadas em DEV ou Production como parte desta entrega.

Permanecem pendentes em ambiente SQA isolado:

- Login autenticado de usuário comum e negação da área administrativa.
- Login autenticado de `platform_admin`, aprovação, revogação e persistência de sessão/dispositivo.
- Testes JWT de autorização e negação por perfil.
- Auditoria real, isolamento entre usuários e comportamento de logout entre navegadores.
- Revisão e homologação independente das migrations avançadas.

O workflow `issue-97-sqa.yml` desta entrega registra apenas o status pendente. Ele não executa testes autenticados nem aplica migrations. O CI genérico executa somente testes locais, contratos, lint, TypeScript, build e verificações de rota sem autenticação.

## Segurança e ambientes

- Não registrar senhas, tokens, segredo de dispositivo, `service_role` ou URL de banco em comentários, logs ou arquivos versionados.
- Supabase DEV permanece limitado às migrations básicas já aplicadas e verificadas.
- Supabase Production permanece intocado.
- Falha de Preview por limite de deployments Vercel deve ser tratada separadamente de falhas de compilação/CI.
