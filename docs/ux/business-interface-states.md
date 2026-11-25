# Estados de interface e feedback — CONNEXA3

## Princípios
- Toda ação recebe feedback compreensível.
- Estados não dependem apenas de cor.
- Não afirmar envio, entrega, leitura ou sincronização antes de confirmação do serviço.
- Erros devem explicar o problema e oferecer recuperação.
- Mensagens administrativas e eventos de auditoria não devem ser confundidos com mensagens de conversa.
- O protótipo deve deixar explícito quando uma ação é apenas local e demonstrativa.

## Estados da interface
| Estado | Comportamento esperado |
|---|---|
| Carregando conversas | Skeleton sem deslocar o layout |
| Lista vazia | Explicar que ainda não há conversas e indicar como localizar colegas |
| Sem resultados | Oferecer limpeza de busca e filtros |
| Falha ao carregar | Informar erro e oferecer nova tentativa |
| Enviando mensagem | Mostrar progresso junto à mensagem durante a integração real |
| Mensagem enviada | Confirmar somente após resposta do servidor |
| Falha de envio | Preservar texto e permitir tentar novamente |
| Sem conexão | Avisar que a conexão caiu; não simular envio concluído |
| Reconectando | Mostrar sincronização sem duplicar mensagens |
| Sessão expirada | Solicitar autenticação novamente e preservar retorno seguro |
| Sem permissão | Explicar que a ação depende de autorização do TI |
| Dispositivo não autorizado | Bloquear acesso e indicar procedimento institucional |

## Comportamento no protótipo atual
- Adicionar uma mensagem apenas altera o estado local da demonstração.
- A interface informa que a mensagem não foi enviada nem armazenada no servidor.
- O indicador da mensagem usa o rótulo “local”, sem marcas de enviada, entregue ou lida.
- A área de mensagens utiliza uma região de log com anúncios de novas mensagens, sem anunciar novamente todo o histórico.
- O envio de arquivos informa que a integração ainda não está disponível.
- Ações de navegação para módulos não implementados apresentam mensagens de disponibilidade futura.
- Toasts utilizam uma região de status acessível.

## Segurança e transparência
- Consultas administrativas a conversas devem exigir permissão específica, justificativa e registro de auditoria.
- A política institucional de acesso e monitoramento deve ser comunicada aos colaboradores.
- A interface não deve sugerir que o conteúdo é ponta a ponta se a arquitetura permitir acesso administrativo no servidor.
- O histórico e a retenção devem seguir política formal compatível com a LGPD.

## Microcopy
| Situação | Texto |
|---|---|
| Protótipo local | Esta mensagem foi adicionada apenas à demonstração. Ela não foi enviada. |
| Envio real | Enviando mensagem… |
| Sucesso real | Mensagem enviada |
| Falha | Não foi possível enviar. Verifique a conexão e tente novamente. |
| Offline | Você está sem conexão. A mensagem ainda não foi enviada. |
| Reconexão | Conexão restabelecida. Atualizando conversas… |
| Sem permissão | Você não tem permissão para realizar esta ação. Procure o setor de TI. |
| Sessão expirada | Sua sessão expirou por segurança. Entre novamente para continuar. |
| Sem resultados | Não encontramos conversas com esses filtros. |

## Acessibilidade
- Usar regiões vivas para status sem anunciar novamente todo o histórico.
- Associar erros de formulário aos respectivos campos.
- Manter foco no contexto após envio e atualização.
- Oferecer contraste e foco visível, inclusive em teclado.
- Respeitar preferências de movimento reduzido.

## Critérios de aceite
- [x] Estados essenciais documentados.
- [x] Microcopy de erros, sessão e conectividade definida.
- [x] Feedback do protótipo diferencia ações locais de ações reais.
- [x] Mensagens locais não exibem confirmação enganosa de envio, entrega ou leitura.
- [ ] Integrar estados reais com backend e serviço de mensagens.
- [ ] Testar leitores de tela, teclado e redes instáveis.

## Limites
O protótipo utiliza dados locais fictícios. Nenhum estado de sessão, autorização, conectividade, entrega ou leitura é real nesta etapa.
