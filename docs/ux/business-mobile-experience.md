# Experiência mobile-first — CONNEXA3

Relacionado à issue [#115](https://github.com/ymer190/CONNEXA3/issues/115).

## Direção de produto

O CONNEXA3 é uma plataforma web de comunicação empresarial com experiência de caixa de entrada compartilhada. A referência funcional é a simplicidade de conversação do WhatsApp Business, ampliada para equipes: atendimento colaborativo, distribuição de conversas, contexto de clientes, etiquetas e respostas rápidas. A marca, os componentes e a linguagem visual permanecem próprios do CONNEXA3.

A aplicação deve funcionar no navegador, sem instalação obrigatória, e ser confortável em smartphones, tablets e desktop.

## Estrutura das telas

### Mobile — até 720 px
- Navegação inferior com Conversas, Contatos, Equipe e Ajustes.
- Caixa de entrada ocupa a tela; ao selecionar uma conversa, a conversa assume a tela e oferece retorno explícito à lista.
- Cabeçalho da conversa mantém nome, presença/estado e acesso aos detalhes.
- Composer fixado visualmente ao final da área de conversa, sem ficar encoberto pelo teclado virtual.
- Detalhes do contato abrem como painel/tela sobreposta, com botão de fechar.
- Filtros horizontais podem rolar; controles essenciais não podem depender de hover.
- Preservar a conversa selecionada e a posição da lista ao alternar entre lista e conversa.

### Tablet — 721 a 1050 px
- Navegação principal compacta.
- Lista e conversa podem coexistir lado a lado quando a largura útil permitir.
- Detalhes do contato abrem em painel lateral sobreposto.
- Reduzir metadados secundários antes de comprimir o conteúdo da mensagem.

### Desktop — acima de 1050 px
- Navegação global, caixa de entrada e conversa simultâneas.
- Painel de detalhes do contato pode aparecer à direita em telas largas.
- Atalhos e ações secundárias complementam, mas nunca substituem, os controles visíveis.

## Layout de referência

| Região | Conteúdo |
|---|---|
| Navegação | Marca, módulos, configurações e perfil |
| Caixa de entrada | Workspace, busca, filtros, lista, não lidas e equipe online |
| Conversa | Contato, contexto, histórico, respostas rápidas e campo de mensagem |
| Detalhes | Empresa/contato, etiqueta, responsável, informações e histórico |

## Regras de interação mobile
- Alvos de toque preferenciais de 44 × 44 CSS px.
- Composer e ação de enviar permanecem acessíveis com teclado virtual aberto.
- Não usar arrastar/soltar ou swipe como único meio de executar uma ação.
- Não perder rascunho de mensagem ao abrir detalhes do contato ou voltar à lista.
- Evitar rolagem horizontal da página; limitar rolagem horizontal a filtros e chips com indicação clara.
- Respeitar safe areas e orientação do dispositivo.

## Breakpoints de validação
- 320, 360, 390 e 430 px: smartphones.
- 768 e 900 px: tablets.
- 1024, 1280 e 1440 px: desktop.
- Testar zoom de 200%, orientação retrato/paisagem e teclado virtual.

## Critérios de aceite
- [x] Layout mobile-first e adaptação desktop implementados no protótipo.
- [x] Navegação entre lista e conversa adaptada a telas pequenas.
- [x] Navegação inferior mobile e painel contextual responsivo disponíveis.
- [ ] Validar em dispositivos reais, leitores de tela e diferentes navegadores.
- [ ] Conectar os fluxos a dados e canais reais; os dados atuais são demonstrativos.

## Escopo desta entrega
O protótipo está em `src/app/page.tsx` e `src/app/globals.css`. Os contatos e mensagens são dados locais fictícios para avaliação de UX, não conversas reais nem integração com WhatsApp.
