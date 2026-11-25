# Experiência responsiva — CONNEXA3

## Objetivo
Oferecer comunicação interna simples e consistente para aproximadamente 900 colaboradores, em smartphones, tablets e desktops, por navegador e sem instalação obrigatória.

## Estrutura por dispositivo
- **Smartphone (até 720 px):** uma superfície por vez (lista ou conversa), retorno explícito à lista, navegação inferior persistente e painel de detalhes sobreposto.
- **Smartphone compacto (até 380 px):** busca e filtros com rolagem horizontal, textos truncados sem quebrar a estrutura, botões essenciais com área de toque adequada.
- **Tablet (721–1050 px):** trilho de navegação compacto, lista e conversa lado a lado, detalhes em painel sobreposto.
- **Desktop (acima de 1050 px):** navegação principal, caixa de entrada e conversa lado a lado; detalhes aparecem em telas largas.

## Regras de interação
- Busca por colaborador, grupo ou departamento.
- Filtros para todas as conversas, não lidas, grupos e departamento.
- Botão Nova conversa inicia conversa individual demonstrativa; grupos e departamentos são administrados pelo TI.
- Áreas de toque preferenciais de pelo menos 40–44 CSS px.
- Não depender de hover, swipe ou arrastar para ações essenciais.
- Manter contexto e rascunho enquanto o usuário permanece na tela.
- Respeitar áreas seguras do dispositivo (safe areas), teclado virtual e orientação.
- O histórico de mensagens deve rolar independentemente do cabeçalho e do composer.
- O composer permite nova linha com Shift + Enter; Enter adiciona a mensagem ao protótipo local.

## Acessibilidade
- Controles com nome acessível e foco visível.
- Estado selecionado dos itens de navegação exposto semanticamente.
- Filtros e botões utilizáveis por teclado.
- Layout deve suportar ampliação de texto e zoom sem perda de conteúdo.
- Respeitar `prefers-reduced-motion`.

## Breakpoints para validação
320, 360, 380, 390 e 430 px; 768, 900 e 1024 px; 1280 e 1440 px. Validar retrato/paisagem, zoom de 200%, teclado virtual e safe areas.

## Critérios de aceite
- [x] Estrutura responsiva da caixa de entrada e conversa no protótipo.
- [x] Navegação adaptada para lista e conversa em telas pequenas.
- [x] Composer simplificado, multilinha e com orientação de uso coerente.
- [x] Ajustes para safe areas, filtros roláveis, alvos de toque e telas compactas.
- [ ] Validar em dispositivos reais, navegadores e leitores de tela.
- [ ] Integrar diretório, autenticação, mensagens e anexos reais.

## Limites
Os dados são fictícios e locais. O protótipo não envia mensagens, não consulta o diretório real e não persiste conteúdo no servidor. Os breakpoints documentam o comportamento implementado; não substituem testes em dispositivos físicos.
