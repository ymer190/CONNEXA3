# Contrato técnico — primeiro acesso e definição de senha (#93)

**Status da entrega de código:** concluída e integrada à `main` pela PR #154 em 26/11/2026.  
**Commit integrado:** `c2d6aaa0e25f78a19a65e08845769807878bbcaf`.  
**CI da PR #154:** sucesso no run #45899859369.  
**SQA:** parecer favorável à integração e continuidade; não equivale à homologação ponta a ponta.  
**Dependências operacionais:** #92 (provisionamento/convite) e #97 (auditoria central).

> Este documento registra o contrato e o estado real da entrega. A issue #93 e a PR #154 permanecem encerradas/mergeadas. As pendências de integração e homologação abaixo não reabrem a entrega de código da #93.

## 1. Decisão funcional

Não existe senha temporária gerada pela aplicação. O provisionamento envia convite por e-mail via Supabase Auth; o colaborador define a própria senha no primeiro acesso. A descrição antiga da issue, que menciona senha temporária, está substituída por essa decisão registrada na #92.

## 2. Fluxo implementado

1. A #92 cria o convite por meio do Supabase Auth Admin e define, por operação exclusivamente server-side, o marcador confiável de primeiro acesso pendente. A sequência de criação/convite e marcação deve ser coordenada para impedir qualquer janela em que o convite possa ser aceito sem o estado pendente.
2. O template de convite aponta para `{{ .SiteURL }}/confirmar-convite#token_hash={{ .TokenHash }}&type=invite`. O token fica no fragmento da URL, que não é enviado ao servidor no carregamento inicial. A tela só o envia ao endpoint server-side após clique explícito do usuário. O endpoint chama `auth.verifyOtp({ token_hash, type: 'invite' })`, valida o marcador pendente e persiste a sessão nos cookies SSR. `inviteUserByEmail` não oferece suporte a PKCE; não implementar `exchangeCodeForSession` para esse convite.
3. O usuário é direcionado à tela mobile-first de definição de senha. A tela não aceita alteração de e-mail, identidade ou papel.
4. O servidor valida a sessão com `auth.getUser()`, valida a política de senha e chama `auth.updateUser({ password })` com a sessão do próprio colaborador.
5. Após a confirmação da alteração, um serviço server-side atualiza o marcador de primeiro acesso para concluído. Se essa atualização falhar, o acesso permanece bloqueado e a operação pode ser repetida com segurança.
6. A aplicação libera as rotas e APIs normais somente após confirmar que o marcador confiável não está pendente.

## 3. Estado confiável e autorização

- Não usar `user_metadata`, query params, localStorage, estado React ou valores enviados pelo navegador como fonte de autorização.
- O estado é gravado em `app_metadata` pelo Supabase Auth Admin, exclusivamente server-side. A rota de conclusão usa `SUPABASE_SECRET_KEY` (ou `SUPABASE_SERVICE_ROLE_KEY` legado) apenas no servidor para limpar o marcador; essa variável deve ser cadastrada como secret privado no ambiente de deploy/CI, nunca com prefixo `NEXT_PUBLIC_`.
- O cliente não pode definir ou limpar o marcador.
- A leitura de estado consulta o usuário autenticado no servidor (`auth.getUser()`), não confiando em claims antigas de JWT sem estratégia de atualização.
- A #92 deve criar o convite e marcar `first_access_pending=true` antes de habilitar convites reais. A #93 limpa o marcador somente depois da troca de senha confirmada.
- A chave administrativa nunca pode usar prefixo `NEXT_PUBLIC_`, nem ser importada por módulos client-side.

## 4. Bloqueio de acesso

Enquanto `first_access_pending=true`, permitir somente:
- callback/validação de convite;
- página e endpoint de definição de senha;
- logout;
- recursos mínimos necessários para carregar a página de primeiro acesso.

Bloquear páginas protegidas e APIs de negócio no servidor/middleware. O bloqueio não pode depender apenas da interface. Rotas públicas de autenticação continuam disponíveis. Após a conclusão, a autorização normal da #91 e das regras de domínio é aplicada.

## 5. Política de senha

A política deve ser centralizada e aplicada no servidor e na interface apenas para feedback. Não registrar senha, token, código de convite ou conteúdo de sessão. O critério final de comprimento e complexidade deve ser alinhado à política configurada no Supabase Auth do projeto, sem criar regra divergente. A senha é enviada somente ao Supabase Auth por TLS via sessão autenticada.

## 6. Auditoria

Registrar apenas eventos e metadados mínimos (por exemplo, convite aceito, tentativa recusada por código inválido/expirado, senha atualizada e conclusão do primeiro acesso), sem credenciais, tokens, códigos ou senha. A integração deve usar exclusivamente a auditoria central da #97, conforme contrato aprovado. Não criar tabela ou log paralelo nesta issue.

## 7. Cobertura de testes e evidências

**Verificações executadas na PR #154:**
- CI concluído com sucesso no run #45899859369.
- Lint, typecheck, build e smoke checks concluídos.
- Rota de primeiro acesso sem sessão redireciona.
- Callback malformado é recusado.
- Token em query é rejeitado sem encaminhamento do token.
- POST cross-origin é bloqueado com HTTP 403.

**Limite conhecido da evidência:** os passos autenticados do CI foram ignorados (skipped). Portanto, o CI verde não comprova o fluxo autenticado ponta a ponta. Não há evidência de homologação E2E autenticada em projeto Supabase Online isolado.

## 8. Gates e pendências após a integração

- [x] Implementação da #93 integrada à `main` pela PR #154.
- [x] CI da PR #154 concluído com sucesso.
- [x] Parecer favorável do SQA para integração e continuidade.
- [ ] Integração pela #92 do marcador inicial `first_access_pending=true`, redirect/template de convite e provisionamento seguro.
- [ ] Integração com a auditoria central da #97, sem trilha paralela.
- [ ] Confirmação operacional de que o secret privado necessário está configurado no ambiente online de execução; responsabilidade do mantenedor do ambiente, sem expor ou compartilhar o valor.
- [ ] Homologação autenticada ponta a ponta em projeto Supabase Online isolado, com usuários sintéticos e CI explicitamente allowlisted: convite, aceite, definição de senha, remoção do marcador, bloqueio antes da conclusão e liberação após a conclusão.

**Regra de liberação:** não habilitar convites reais até que as integrações da #92 e #97 e a homologação isolada estejam concluídas. Essas pendências pertencem ao fluxo integrado/dependências; não exigem reabrir a PR #154 nem alterar o código já integrado da #93.

## 9. Limites operacionais

- Reutilizar Supabase Auth e sessão da #91; não reconstruir autenticação.
- Não executar convites reais, não gravar dados e não aplicar migrations em Supabase DEV/PROD como parte desta atualização documental.
- Testes integrados autenticados somente em projeto Supabase Online isolado, com usuários sintéticos e CI explicitamente allowlisted.
- Nenhuma credencial, token, senha ou conteúdo de sessão deve ser registrado neste documento.
