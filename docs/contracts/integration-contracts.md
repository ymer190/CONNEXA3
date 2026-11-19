# Contratos de integração — CONNEXA3

**Issue:** [#106](https://github.com/ymer190/CONNEXA3/issues/106)  
**Versão:** 1.0 — proposta para validação conjunta  
**Atualizado em:** 2026-11-19  
**Ambiente de referência:** Supabase Online, projeto connexa-dev  
**Estado:** documentação para revisão; não declara APIs ainda não implantadas.

Este é o contrato compartilhado entre Back-end e Front-end. Ele diferencia o que foi verificado do que é proposto, define entradas, respostas, erros, paginação e limites de acesso. Contratos propostos não devem ser consumidos antes de aprovação conjunta e implementação/validação em DEV.

## 1. Baseline verificado

No projeto connexa-dev, o schema public contém organizations, profiles, organization_members e platform_users, com RLS habilitado. As migrations aplicadas incluem create_organizations_profiles_and_members, create_platform_users e harden_public_table_privileges.

O DEV ainda não contém tabelas de departments, department_members, conversations, conversation_members, messages, message_attachments, conversation_audit_logs ou auditoria geral. Também não existem endpoints de negócio para listagem administrativa de colaboradores, departamentos ou leitura administrativa de conversas.

| Fluxo | Situação |
|---|---|
| Login/sessão | Supabase Auth com cliente SSR; /admin exige sessão e linha própria em platform_users |
| Perfil | profiles oferece full_name e avatar_url; RLS limita a própria linha |
| Colaboradores/status | Issues #92/#94 ainda abertas; organization_members usa papéis legados |
| Departamentos | Issue #95 define regras; tabela ausente no DEV |
| Conversas/auditoria | Issue #96 e PR #130 definem fronteira/modelo em revisão; tabelas ausentes |

O documento database-model.md está marcado como modelo legado e não deve orientar novos contratos de conversa. A arquitetura canônica proposta usa conversations, conversation_members, messages, message_attachments e conversation_audit_logs. O PR #130 permanece em rascunho; as propostas nele não substituem validação pelo Back-end, Front-end e responsáveis de produto/privacidade.

## 2. Autenticação e sessão

### Login
- Operação: Supabase Auth signInWithPassword(email, password), pelo cliente SSR.
- Entrada: email e password, strings obrigatórias. Enviar por TLS ao Supabase Auth; não colocar credenciais em URL, logs, analytics ou mensagens de erro.
- Sucesso: user.id e user.email identificam a conta. Tokens/expiração são geridos pela sessão SSR e não fazem parte de payloads de negócio.
- Erro: SDK retorna AuthError com status/code/message quando disponíveis. A UI usa mensagem genérica para credenciais recusadas, sem confirmar se o e-mail existe.
- Sessão válida autentica, mas não concede permissão administrativa nem acesso ao conteúdo de conversas.

### Sessão e área administrativa
- Confirmar identidade no servidor com getUser().
- A página /admin atual exige sessão e leitura da própria linha em platform_users; falha ou ausência da linha resulta em acesso negado.
- platform_users.role aceita platform_admin. Isso protege a área administrativa atual; não autoriza leitura de mensagens.
- signOut() encerra a sessão. user_metadata é editável pelo usuário e não serve para autorização.
- Chave publicável/anon apropriada ao cliente; service_role/secret somente no servidor.

A UI atual usa redirecionamentos para login/acesso negado. Não existe envelope REST CONNEXA3 padronizado para operações de domínio.

## 3. Perfil e colaborador

### Perfil próprio, implementado
- Consulta apenas da linha cujo id é auth.uid(); campos: id UUID, full_name string|null, avatar_url string|null, created_at e updated_at ISO-8601 UTC.
- Resposta: um perfil ou ausência de linha; e-mail vem de Supabase Auth, não de public.profiles.
- A UI envia full_name e avatar_url. Não trate a lista de campos da interface como barreira de segurança por coluna.
- SELECT sem linha visível por RLS pode retornar lista vazia, sem erro explícito.

### Cadastro administrativo, pendente da #92
Não há contrato implantado para listar/criar contas de colaboradores. A #92 determina criação por TI autorizado, sem auto cadastro público. Não presumir que organization_members.role ou platform_users.role seja o status/cargo do colaborador. Campos mínimos, estados, erros e paginação devem ser validados com a #92 antes da integração do painel.

## 4. Departamentos — contrato proposto para #95

Departamento é parte da estrutura organizacional, não uma conversa/grupo. Cada registro pertence ao escopo organizacional. Associação de colaborador é explícita e não pode ser inferida por cargo, nome, e-mail ou participação em grupo. Desativação preserva histórico/auditoria e impede novas associações incompatíveis.

| Operação | Entrada proposta | Resposta proposta | Autorização |
|---|---|---|---|
| Listar/buscar | filtro de estado, busca textual, paginação | lista e metadados de página | escopo organizacional validado |
| Consultar | department_id | registro de departamento | departments.read no escopo |
| Criar/editar/desativar | campos aprovados da entidade | registro atualizado | platform_admin ou capacidade aprovada |
| Associar/remover colaborador | department_id, collaborator_id | associação resultante | departments.members.manage no departamento |

Resposta semântica mínima: id estável, escopo organizacional, nome, estado ativo/inativo e timestamps. A associação usa identificadores estáveis. Nomes físicos, nulabilidade, ciclo de reativação e paginação final dependem da migration #95 e revisão conjunta. A integração prevista é department_id opcional em conversations; não criar tabelas paralelas para grupos.

A #95 distingue:
- platform_admin: administração da estrutura organizacional no escopo aprovado;
- it_support: sem administração de departamentos, grupos ou participantes;
- collaborator: sem gestão administrativa por padrão;
- gestor departamental: continua collaborator, com departments.read, departments.members.manage, groups.read, groups.manage e groups.members.manage explicitamente concedidas e limitadas aos departamentos/grupos atribuídos.
Gerir participantes não concede leitura de conteúdo. Negar por padrão quando identidade, capacidade, vínculo ou escopo não forem comprovados.

Paginação proposta para listagens: page_size padrão 50, máximo 100, offset >= 0, ordenação estável por nome/id. Resposta: data e page {page_size, offset, has_more}. Back-end e Front-end devem aprovar ou substituir esses limites no PR antes da integração.

## 5. Consulta excepcional de conversas — #96/#97

A consulta de conteúdo administrativo não existe no DEV. Deve ser operação privilegiada do servidor; não é SELECT liberado diretamente ao navegador.

### Entrada proposta
- conversation_id: UUID obrigatório;
- justification: texto obrigatório, não vazio após trim;
- page_size: padrão 50, máximo 100;
- cursor: opaco, nulo na primeira página.

O ator e a sessão vêm da identidade validada no servidor. Escopo organizacional, usuário-alvo e concessões são resolvidos/validados no servidor; não confiar em role, actor_id, organization_id nem autorização fornecidos pelo cliente.

### Resposta proposta
- conversation: id, type (channel/direct/group) e department_id quando aplicável;
- messages: id, sender_id, message_type, body/conteúdo textual quando autorizado, created_at, estado/data de edição e exclusão;
- attachments: apenas metadados mínimos (id, tipo, tamanho, timestamp); nunca bytes, chave interna de Storage ou URL pública;
- page: page_size, next_cursor, has_more.

Essas são propriedades semânticas da resposta, não afirmação sobre colunas físicas já existentes. O mapeamento final depende do schema revisado da #96. Ordenação estável por instante e id; cursor opaco não altera escopo. Cada página é limitada a 100 registros. Não impor janela de tempo adicional sem aprovação de produto.

### Limites de acesso aprovados na proposta de autorização
- Acesso normal depende de participação ativa e escopo da conversa. Papel administrativo não concede conteúdo automaticamente.
- Consulta excepcional exige concessão separada conversations.exceptional_read para identidade/escopo definidos, prazo vigente e justificativa. Validar em cada página.
- platform_admin não recebe acesso automático a conteúdo; it_support é sempre negado para conteúdo de conversa.
- Somente a função formal RPGD, independente de TI operacional, pode aprovar/revogar via conversations.exceptional_access.approve. Aprovar não concede leitura ao RPGD.
- A identidade consultora precisa de conversations.exceptional_read separado, com escopo e validade definidos.
- Não enviar notificação individual ao colaborador no momento da consulta, conforme decisão existente; registrar toda consulta.
- Se autenticação, autorização, escopo ou gravação de auditoria falhar, negar e não devolver conteúdo.
- A remoção de participante revoga imediatamente acesso futuro a mensagens/anexos. História permanece aos demais participantes autorizados.

## 6. Auditoria administrativa

Issue #97 é dona da trilha geral de administração/segurança, incluindo ações de dispositivos/sessões e consultas excepcionais. conversation_audit_logs é separada e cobre ciclo de vida de conversas/participantes. Não duplicar eventos entre as duas trilhas; quando a mesma operação gerar eventos de domínios distintos, compartilhar correlation_id.

### Campos mínimos do evento
| Campo semântico | Regra |
|---|---|
| actor_id | identidade derivada da sessão, nunca confiada do cliente |
| action | código estável da operação |
| target_type/target_id | recurso atingido; conversa para consulta excepcional |
| organization_scope | escopo validado, quando aplicável |
| justification | obrigatória em consulta excepcional e ações que assim exigirem |
| occurred_at | timestamp UTC definido pelo servidor/banco |
| outcome | permitido, negado ou falha |
| correlation_id | correlação da operação |
| page_size/result_count | limite e registros efetivamente devolvidos, quando paginada |

Auditar antes de devolver conteúdo. Nunca gravar corpo de mensagem, conteúdo de anexo, senha, token ou credencial. Clientes comuns não inserem, alteram ou apagam auditoria; eventos são append-only para atores da aplicação.

### Consulta de auditoria
- platform_admin: trilha administrativa completa.
- RPGD: apenas eventos necessários para supervisão do ciclo de vida de acesso excepcional.
- it_support: não pode consultar histórico administrativo completo.
- collaborator comum: sem acesso à trilha administrativa.
- Retenção padrão de 12 meses; prazo maior só com obrigação legal, investigação ou retenção formal documentada. Ao fim da obrigação, excluir/anonymizar com segurança quando permitido.

Resposta contém os campos semânticos acima, nunca conteúdo de conversa. Paginação proposta: padrão 50, máximo 100 por página e escopo/permissão revalidados. Validar esses limites conjuntamente antes da implementação.

## 7. Erros

Hoje, o SDK fornece AuthError/PostgrestError, não um envelope CONNEXA3. Não mostrar message/details internos ao usuário.

Envelope proposto para futuras operações:

    {
      "error": {
        "code": "FORBIDDEN",
        "message": "A operação não é permitida.",
        "request_id": "identificador-de-correlação"
      }
    }

| Código | HTTP proposto | Uso |
|---|---:|---|
| AUTHENTICATION_REQUIRED | 401 | sessão ausente/inválida |
| FORBIDDEN | 403 | capacidade ou escopo insuficiente |
| VALIDATION_ERROR | 400 | entrada, cursor ou justificativa inválidos |
| NOT_FOUND | 404 | inexistente ou fora do escopo, sem revelar existência |
| RATE_LIMITED | 429 | limite operacional excedido |
| SERVICE_UNAVAILABLE | 503 | falha transitória sem conteúdo parcial |

Não retornar dados de outra organização, conteúdo privado, tokens ou detalhes internos de Postgres. Os códigos acima são proposta de adaptador, não códigos atualmente emitidos no DEV.

## 8. Comunicação e mudança de contrato

1. Toda alteração em payload, campo, erro, paginação ou autorização atualiza este documento no mesmo PR que a implementação.
2. O PR apresenta exemplos de entrada/resposta, compatibilidade, impacto nas duas equipes, migrations e evidência de validação em connexa-dev quando houver mudança no banco.
3. Back-end e Front-end revisam os mesmos exemplos e registram aprovação no PR antes da integração. Decisão de produto/privacidade é validada pela autoridade do requisito.
4. Propostas são claramente rotuladas e não são consumidas como APIs disponíveis.
5. Migrations são aplicadas e validadas primeiro no Supabase connexa-dev. PROD permanece sem alterações até validação DEV e aprovação própria.

### Validação desta versão
- [x] Baseline atual do GitHub e connexa-dev conferido.
- [x] Contratos prioritários de login, sessão e perfil próprio documentados.
- [x] Campos e limites propostos para consulta administrativa e auditoria definidos.
- [ ] Back-end validou payloads, erros e limites.
- [ ] Front-end validou payloads, erros e limites.
- [ ] PO/RPGD validou a interpretação do acesso excepcional e retenção.
- [ ] Conversas, departamentos e auditoria implantados/verificados em DEV (dependem das #95–#97).

**Estado:** contrato preparado para revisão conjunta; operações de departamentos, conversas e auditoria ainda não existem no connexa-dev. O PR desta issue deve receber validação das duas equipes antes de qualquer integração.

## Referências
- [Issue #106 — contratos de integração](https://github.com/ymer190/CONNEXA3/issues/106)
- [Issue #95 — departamentos](https://github.com/ymer190/CONNEXA3/issues/95)
- [Issue #96 — permissões e conversas](https://github.com/ymer190/CONNEXA3/issues/96)
- [Issue #97 — dispositivos e auditoria](https://github.com/ymer190/CONNEXA3/issues/97)
- [PR #130 — modelo de autorização/conversas em revisão](https://github.com/ymer190/CONNEXA3/pull/130)

