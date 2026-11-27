# Issue 97 — escopo básico e pendências SQA

## Integração básica

A integração atual utiliza exclusivamente o contrato já instalado no Supabase DEV. A RPC `admin_approve_device` permanece com dois argumentos:

- `p_device_id uuid`
- `p_justification text`

A aplicação não exige referência de chamado na aprovação básica.

## Itens adiados

As migrations avançadas `20261126010200_issue_97_sqa_gates.sql` e `20261126010300_issue_97_revalidate_legacy_devices.sql` foram preservadas na branch `feature/issue-97-deferred-sqa-migrations`, fora da PR #153.

Elas não devem ser aplicadas em DEV ou Production como parte desta integração básica. A migração 10300 contém uma transição em lote de dispositivos legados e exige revisão e plano de rollback próprios.

## Testes pendentes

- Testes autenticados de navegador para cadastro e aprovação de dispositivos.
- Testes JWT de autorização e negação por perfil.
- Homologação independente de SQA das migrations avançadas.
- Validação operacional da recuperação do primeiro administrador.

O workflow `Issue 97 SQA evidence` registra explicitamente o status pendente e não executa migrations nem altera bancos.

## Ambientes

- Supabase DEV: somente migrations básicas já previstas para a integração.
- Supabase Production: sem alterações.
- Vercel: deployments sujeitos ao limite de build da conta; falha de Preview não equivale a falha de compilação local/CI.
