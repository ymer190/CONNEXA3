# Responsividade e acessibilidade — CONNEXA3

> Documento de produto e UX/UI relacionado à issue [#25](https://github.com/ymer190/CONNEXA3/issues/25).
>
> **Status:** especificação inicial para orientar design e implementação. Os pontos abaixo são critérios de projeto; a conformidade final depende de validação nos fluxos implementados.

## 1. Objetivo e princípios

A experiência deve permanecer clara, previsível e funcional em desktop, tablet e mobile, inclusive com teclado, leitor de tela, zoom e diferentes formas de interação.

Princípios:

1. **Conteúdo primeiro:** priorizar mensagens, pessoas, canais e ações relevantes; evitar reduzir toda a interface desktop para caber no celular.
2. **Revelação progressiva:** em telas menores, mostrar primeiro a tarefa atual e disponibilizar navegação secundária sob demanda.
3. **Consistência:** nomes, ícones, estados e hierarquia das ações devem manter o mesmo significado entre dispositivos.
4. **Não depender apenas de cor:** estados também devem usar texto, ícone, forma ou padrão.
5. **Controle do usuário:** não remover recursos essenciais nem iniciar áudio, vídeo ou movimento sem uma ação clara do usuário.

## 2. Faixas responsivas

Usar breakpoints como pontos de mudança de layout, não como categorias rígidas de dispositivo. O conteúdo deve se adaptar também entre eles.

| Faixa | Largura de referência | Comportamento esperado |
|---|---:|---|
| Mobile | até 767 px | Uma coluna; navegação principal compacta; painéis secundários em telas/overlays próprios. |
| Tablet | 768–1023 px | Conteúdo principal com navegação recolhível; painéis auxiliares sob demanda; evitar colunas estreitas. |
| Desktop | 1024 px ou mais | Navegação, conteúdo e painel contextual podem coexistir quando houver espaço útil. |

Regras gerais:

- Projetar primeiro o fluxo mobile e ampliar progressivamente a composição.
- Usar larguras fluidas, limites de largura para leitura e espaçamento consistente; evitar larguras fixas que provoquem rolagem horizontal.
- Permitir rolagem vertical do conteúdo. Rolagem horizontal só é aceitável em componentes que realmente a exijam, com indicação e alternativa acessível.
- A 320 CSS px de largura e com zoom de 200%, o conteúdo comum deve continuar utilizável sem rolagem em duas dimensões, exceto conteúdos que exijam layout bidimensional.
- Respeitar safe areas em dispositivos com recortes e barras de sistema.

## 3. Comportamento dos fluxos prioritários

| Fluxo | Desktop | Tablet | Mobile |
|---|---|---|---|
| Autenticação e cadastro | Formulário central com conteúdo auxiliar opcional | Formulário em coluna única | Formulário em coluna única, campos em largura total e teclado sem cobrir a ação principal |
| Espaço de trabalho e canais | Navegação de espaços/canais, conteúdo e painel contextual quando houver espaço | Navegação recolhível e conteúdo principal | Uma superfície por vez; seletor de espaço/canal acessível por controle explícito; voltar preserva o contexto |
| Conversas e mensagens | Lista de conversas e área de mensagens; detalhes em painel lateral | Lista e conversa com painel contextual recolhível | Lista e conversa em telas distintas; composer permanece acessível acima do teclado; ações secundárias em menu identificado |
| Reuniões | Controles e participantes distribuídos conforme espaço | Controles agrupados e participantes reorganizados | Vídeo/conteúdo priorizado, controles essenciais sempre acessíveis e participantes em lista ou faixa rolável |
| Perfil e configurações | Navegação lateral e conteúdo | Navegação compacta | Categorias em lista e uma seção por tela; rótulos e retorno claros |

Regras específicas para conversas:

- A ordem de leitura deve ser: contexto da conversa, histórico de mensagens, estado de carregamento/novas mensagens e campo de composição.
- Mensagens novas não devem deslocar o foco do teclado nem interromper a leitura de quem está consultando o histórico.
- Ações como responder, reagir, anexar e enviar devem ter rótulos acessíveis e estados de carregamento/erro.
- O campo de composição deve continuar visível quando o teclado virtual abrir; permitir que a página role para revelar o campo e a ação de envio.
- Não usar apenas gesto de deslizar para ações essenciais; disponibilizar alternativa por botão ou menu.

## 4. Navegação, teclado e foco

Toda funcionalidade deve ser operável por teclado, sem exigir mouse ou gesto.

- A ordem de foco acompanha a ordem visual e de leitura.
- Tab e Shift + Tab percorrem controles interativos; Enter ativa links e botões; Space ativa botões e alterna controles compatíveis; Esc fecha diálogos e menus quando aplicável.
- Componentes compostos (abas, menus, listas de opções) devem seguir um padrão de teclado consistente e documentado; não criar armadilhas de teclado.
- Ao abrir diálogo, mover o foco para dentro dele, manter a navegação contida enquanto estiver aberto e devolver o foco ao acionador ao fechar.
- Ao navegar para outra tela, definir um destino de foco previsível, normalmente o título principal ou início do conteúdo.
- Foco visível em todos os controles: contorno de pelo menos 2 CSS px, com afastamento quando necessário e contraste mínimo de 3:1 contra as cores adjacentes.
- Nunca remover o outline sem oferecer indicador equivalente mais perceptível.
- Não comunicar foco, seleção, erro ou estado exclusivamente por cor.

## 5. Leitura, contraste e conteúdo

Adotar WCAG 2.2 nível AA como referência de aceitação.

- Texto normal: contraste mínimo de 4,5:1.
- Texto grande (a partir de 24 CSS px regular ou aproximadamente 18,66 CSS px em negrito): mínimo de 3:1.
- Componentes de interface, ícones essenciais e indicadores visuais de estado: mínimo de 3:1 contra cores adjacentes.
- Não usar texto em imagem como única forma de apresentar informação.
- Permitir ampliação de texto até 200% sem perda de conteúdo ou funcionalidade.
- Usar títulos hierárquicos, rótulos persistentes para campos e linguagem direta.
- Instruções, erros e confirmações devem explicar o que ocorreu e, quando possível, como corrigir.
- Campos obrigatórios e erros devem ser identificados por texto, associados programaticamente ao campo e anunciados quando surgirem.
- Conteúdo dinâmico importante (por exemplo, falha no envio ou entrada/saída de participante) deve ser anunciado sem mover o foco indevidamente; evitar anúncios excessivos de cada mensagem recebida.
- Ícones sem texto visível precisam de nome acessível. Imagens informativas precisam de texto alternativo; imagens decorativas devem ser ignoradas por tecnologias assistivas.

## 6. Toque e interação

- Alvo preferencial para controles de toque: pelo menos 44 × 44 CSS px.
- Nunca ficar abaixo dos requisitos de tamanho/espaçamento da WCAG 2.2 AA (24 × 24 CSS px, salvo exceções previstas pela norma).
- Manter distância suficiente entre ações destrutivas e ações frequentes.
- Não depender de hover para revelar controles ou informação essencial.
- Oferecer alternativa por toque/clique para ações que também funcionam por arrastar, deslizar ou gesto.
- Estados de pressionado, selecionado, desabilitado, carregando e erro devem ser distinguíveis e ter nome/estado acessível.
- Evitar ações irreversíveis com um único toque acidental; solicitar confirmação ou oferecer desfazer quando apropriado.

## 7. Movimento, mídia e preferências

- Respeitar a preferência de redução de movimento do sistema (prefers-reduced-motion); remover animações não essenciais e reduzir transições.
- Evitar flashes que possam provocar desconforto.
- Áudio e vídeo começam somente após ação explícita; controles de microfone, câmera, compartilhamento e saída devem ter rótulos e estados claros.
- Fornecer legendas para conteúdo de vídeo pré-gravado com áudio e considerar legendas ao vivo para reuniões.
- Não transmitir informação apenas por som; oferecer feedback visual e, quando aplicável, háptico configurável.

## 8. Checklist de validação

Executar os testes em fluxos reais antes de considerar a implementação concluída:

- [ ] Larguras de 320, 375, 768, 1024 e 1440 CSS px, além de larguras intermediárias.
- [ ] Zoom de 200% e reflow equivalente a 320 CSS px.
- [ ] Navegação completa apenas com teclado, incluindo diálogos, menus, abas e composer.
- [ ] Foco visível, ordem lógica e ausência de armadilhas de teclado.
- [ ] Leitura com pelo menos um leitor de tela em desktop e um em mobile.
- [ ] Contraste medido para texto, ícones, bordas funcionais, foco e estados.
- [ ] Alvos de toque medidos e ações sem dependência exclusiva de hover/gestos.
- [ ] Preferência de redução de movimento respeitada.
- [ ] Mensagens de erro, validação, carregamento e sucesso compreensíveis e anunciadas.
- [ ] Fluxos de autenticação, navegação de canais, conversas, reuniões e configurações concluídos sem perda de funcionalidade.

## 9. Referências normativas

- [WCAG 2.2 — W3C Recommendation](https://www.w3.org/TR/WCAG22/)
- [Understanding WCAG 2.2 — W3C](https://www.w3.org/WAI/WCAG22/Understanding/)
- [WAI-ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/)

## 10. Limites desta entrega

Este repositório ainda não contém uma interface de produto para auditar ou testar. Portanto, este documento resolve a definição de comportamento e os critérios de UX/UI da issue; não declara que o produto já atende WCAG nem substitui testes de implementação. A aplicação destes padrões deverá ser verificada quando os componentes e fluxos forem construídos.
