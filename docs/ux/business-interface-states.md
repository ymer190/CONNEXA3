# Estados de interface e feedback — CONNEXA3 Business

Relacionado à issue [#117](https://github.com/ymer190/CONNEXA3/issues/117).

## Princípios
- Todo comando do usuário recebe resposta perceptível: sucesso, progresso, erro ou explicação de indisponibilidade.
- Mensagens usam linguagem simples, explicam o impacto e oferecem um próximo passo.
- Estado nunca é comunicado somente por cor.
- Feedback não deve interromper a leitura nem roubar foco.
- Repetir uma operação deve ser seguro sempre que possível; evitar duplicar mensagens ou ações.

## Estados da caixa de entrada

| Estado | Apresentação | Ação/recuperação |
|---|---|---|
| Carregando | Skeleton na lista e cabeçalho; evitar spinner isolado | Preservar dimensões e contexto |
| Vazia | Explicar que não há conversas e indicar conectar canal/convidar equipe | CTA contextual |
| Sem resultados | “Nenhuma conversa encontrada” | Limpar busca/filtros |
| Erro ao carregar | Aviso persistente e ação “Tentar novamente” | Manter filtros e seleção |
| Atualização em tempo real | Indicador discreto de atualização | Não deslocar foco ou rolagem |

## Estados de mensagem

| Estado | Feedback visual e textual |
|---|---|
| Rascunho | Conteúdo permanece no composer |
| Enviando | Indicador junto à mensagem; bloquear envio duplicado |
| Enviada | Confirmação simples de envio |
| Entregue | Indicador de entrega, se o canal fornecer esse evento |
| Lida | Indicador de leitura, somente quando o canal fornecer essa informação |
| Falha | “Não foi possível enviar. Verifique a conexão e tente novamente.” + ação de reenvio |
| Anexo carregando | Progresso e possibilidade de cancelar |
| Anexo rejeitado | Explicar formato/tamanho aceito e permitir selecionar outro arquivo |
| Offline | Aviso de conexão perdida; não afirmar envio concluído |
| Reconectando | Estado de reconexão e sincronização; evitar duplicar mensagens |

Os indicadores de entrega/leitura dependem do suporte do canal conectado. Não simular recibos de leitura para integrações que não os forneçam.

## Estados de sessão, dispositivo e autorização
- **Sessão expirada:** tela ou diálogo explicando que a sessão terminou; preservar retorno pretendido após autenticação quando seguro.
- **Dispositivo não autorizado:** bloquear a sessão, explicar que o dispositivo precisa ser autorizado e oferecer caminho de suporte/autorização.
- **Sem permissão:** informar que a ação não está disponível para o perfil e indicar quem pode conceder acesso, sem expor dados restritos.
- **Conta suspensa:** explicar o bloqueio e fornecer canal de contato administrativo.
- **Canal desconectado:** mostrar o canal afetado, última sincronização conhecida e ação de reconectar para administradores.

## Estados de conectividade
- Online: operação normal.
- Instável: aviso não bloqueante e cautela com ações que dependem de confirmação do servidor.
- Offline: banner persistente, composer mantém rascunho e envio fica pendente/desabilitado conforme política de fila.
- Reconectando: progresso explícito.
- Sincronizado: confirmação discreta após recuperação.

Nunca mostrar “Enviada” antes da confirmação real do serviço. Se a aplicação vier a oferecer fila offline, usar identificador idempotente para evitar duplicação após reconexão.

## Feedback de ações
- Mensagem enviada: confirmação no próprio item da conversa.
- Etiqueta alterada: toast “Etiqueta atualizada”.
- Responsável alterado: confirmação com nome do novo responsável.
- Ação sem permissão: mensagem explicativa, sem executar alteração.
- Falha temporária: oferecer nova tentativa.
- Ação destrutiva: confirmação com consequência clara e opção de cancelar.
- Resposta rápida selecionada: preencher composer; não enviar automaticamente.

## Acessibilidade do feedback
- Mensagens de status não críticas usam região viva educada (aria-live polite); erros urgentes podem usar assertive somente quando necessário.
- Não anunciar novamente o histórico inteiro a cada atualização.
- Toast não deve ser a única forma de comunicar resultado importante.
- Erros de formulário devem estar associados ao campo e ser identificados por texto.
- Foco permanece no contexto após envio, atualização de etiqueta ou chegada de nova mensagem.
- Estados visuais precisam de texto/ícone e contraste adequado.

## Microcopy recomendada

| Situação | Texto |
|---|---|
| Envio em andamento | Enviando mensagem… |
| Sucesso | Mensagem enviada |
| Falha de envio | Não foi possível enviar. Verifique a conexão e tente novamente. |
| Sem conexão | Você está sem conexão. Suas alterações ainda não foram sincronizadas. |
| Reconexão | Conexão restabelecida. Sincronizando conversas… |
| Sem permissão | Você não tem permissão para realizar esta ação. Fale com um administrador. |
| Sessão expirada | Sua sessão expirou por segurança. Entre novamente para continuar. |
| Nenhum resultado | Não encontramos conversas com esses filtros. |

## Critérios de aceite
- [x] Estados principais documentados para lista, mensagem, sessão, dispositivo, permissão e conectividade.
- [x] Microcopy e orientações de recuperação definidos.
- [x] Feedback de demonstração implementado no protótipo para ações locais.
- [ ] Implementar estados reais de carregamento, erro, envio e reconexão após integração com backend/canais.
- [ ] Testar anúncios com leitor de tela e comportamento em rede instável.

## Limites
O protótipo usa dados locais e notificações demonstrativas. Não representa estado real de entrega, leitura, conexão, sessão ou autorização. Esses estados devem ser alimentados pelos serviços e eventos reais na implementação.
