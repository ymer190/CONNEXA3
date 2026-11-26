# Contrato técnico — primeiro acesso e definição de senha (#93)

**Status:** contrato inicial para implementação e revisão técnica/SQA.  
**Branch:** `feature/issue-93-first-access-password`  
**Dependências:** #91 (sessão Supabase Auth), #92 (convite por e-mail), #97 (auditoria central).

## 1. Decisão funcional

Não existe senha temporária gerada pela aplicação. O provisionamento envia convite por e-mail via Supabase Auth; o colaborador define a própria senha no primeiro acesso. A descrição antiga da issue, que menciona senha temporária, está substituída por essa decisão registrada na #92.

## 2. Fluxo proposto

1. A #92 cria o convite por meio do Supabase Auth Admin e define, por operação exclusivamente server-side, o marcador confiável de primeiro acesso pendente. A sequência de criação/convite e marcação deve ser coordenada para impedir qualquer janela em que o convite possa ser aceito sem o estado pendente.
2. O template de convite deve apontar para `{{ .SiteURL }}/confirmar-convite#token_hash={{ .TokenHash }}&type=invite`. O token fica no fragmento da URL, que não é enviado ao servidor no carregamento inicial. A tela só o envia ao endpoint server-side após clique explícito do usuário; assim, scanners de e-mail não consomem o token por prefetch e o hash não aparece nos access logs HTTP da aplicação. O endpoint chama `auth.verifyOtp({ token_hash, type: 'invite' })`, valida o marcador pendente e persiste a sessão nos cookies SSR. `inviteUserByEmail` não oferece suporte a PKCE; não implementar `exchangeCodeForSession` para esse convite.
3. O usuário é direcionado à tela mobile-first de definição de senha. A tela não aceita alteração de e-mail, identidade ou papel.
4. O servidor valida a sessão com `auth.getUser()`, valida a política de senha e chama `auth.updateUser({ password })` com a sessão do próprio colaborador.
5. Após a confirmação da alteração, um serviço server-side atualiza o marcador de primeiro acesso para concluído. Se essa atualização falhar, o acesso permanece bloqueado e a operação pode ser repetida com segurança.
6. A aplicação libera as rotas e APIs normais somente após confirmar que o marcador confiável não está pendente.

## 3. Estado confiável e autorização

- Não usar `user_metadata`, query params, localStorage, estado React ou valores enviados pelo navegador como fonte de autorização.
- O estado precisa ser gravado em `app_metadata` pelo Supabase Auth Admin, exclusivamente server-side, ou em mecanismo persistente equivalente aprovado pelo Tech Lead/SQA. A rota de conclusão usa `SUPABASE_SECRET_KEY` (ou `SUPABASE_SERVICE_ROLE_KEY` legado) apenas no servidor para limpar o marcador; essa variável deve ser cadastrada como secret privado no ambiente de deploy/CI, nunca com prefixo `NEXT_PUBLIC_`.
- O cliente não pode definir ou limpar o marcador.
- A leitura de estado deve consultar o usuário autenticado no servidor (`auth.getUser()`), não confiar em claims antigas de JWT sem estratégia de atualização.
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

Registrar apenas eventos e metadados mínimos (por exemplo, convite aceito, tentativa recusada por código inválido/expirado, senha atualizada e conclusão do primeiro acesso), sem credenciais, tokens, códigos ou senha. A integração deve usar exclusivamente a auditoria central da #97, após aprovação do contrato executável. Não criar tabela ou log paralelo nesta issue.

## 7. Testes obrigatórios

- Convite válido estabelece sessão e direciona ao primeiro acesso.
- Código/token inválido, expirado, reutilizado ou malformado é recusado sem expor detalhes sensíveis.
- Usuário sem sessão não consegue alterar senha.
- Usuário com primeiro acesso pendente não acessa páginas nem APIs de negócio, inclusive por chamada direta.
- Usuário não consegue limpar ou falsificar o marcador pelo cliente/user_metadata.
- Senha fora da política é recusada; senha válida atualiza a credencial.
- Falha ao atualizar o marcador após troca mantém o usuário bloqueado e permite retry seguro.
- Após conclusão, o usuário acessa apenas recursos permitidos pela autorização existente.
- Logs e auditoria não contêm senha, token, código de convite ou sessão.

## 8. Limites operacionais e gates

- Reutilizar Supabase Auth e sessão da #91; não reconstruir autenticação.
- Não executar convites reais, não gravar dados e não aplicar migrations em Supabase DEV/PROD nesta etapa.
- Testes integrados autenticados somente em projeto Supabase Online isolado, com usuários sintéticos e CI explicitamente allowlisted.
- Antes de habilitar convites reais, #92 deve integrar o marcador inicial e o redirect de convite; #97 deve liberar o contrato de auditoria aplicável.
- PR permanece Draft até CI válido, revisão do Tech Lead e homologação SQA.
