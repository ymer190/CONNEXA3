# Navegação e usabilidade — CONNEXA3 Business

Relacionado à issue [#116](https://github.com/ymer190/CONNEXA3/issues/116).

## Modelo mental

O usuário entra no CONNEXA3 para atender, acompanhar e organizar relacionamentos. A navegação começa pela caixa de entrada, não por servidores ou canais comunitários. Conversas são o centro do trabalho; contatos, equipe e relatórios dão suporte ao atendimento.

## Arquitetura da informação

1. **Conversas**
   - Todas
   - Não lidas
   - Minhas conversas
   - Não atribuídas
   - Etiquetas (Novo lead, Em negociação, Prioridade, Cliente)
2. **Contatos**
   - Pessoas e empresas
   - Histórico de conversas
   - Dados e observações
3. **Equipe**
   - Atendentes
   - Disponibilidade
   - Responsáveis e distribuição
4. **Relatórios**
   - Volume e tempo de resposta
   - Conversas resolvidas e pendentes
   - Indicadores de atendimento
5. **Configurações**
   - Workspace e membros
   - Canais conectados
   - Permissões e preferências

## Hierarquia da tela de conversas

- **Navegação global:** acesso aos módulos.
- **Caixa de entrada:** busca, filtros, lista e status de não lidas.
- **Área de conversa:** identidade do contato, histórico, contexto do canal e composer.
- **Painel contextual:** etiqueta, responsável, dados da empresa e histórico.

## Perfis e permissões — apresentação UX

| Perfil | Necessidades de navegação |
|---|---|
| Administrador | Configurar workspace, canais, membros, permissões e relatórios |
| Gestor de atendimento | Acompanhar filas, atribuir conversas, distribuir carga e consultar indicadores |
| Atendente | Consultar fila autorizada, responder, usar respostas rápidas e atualizar contexto permitido |
| Observador/analista | Consultar conversas e indicadores conforme acesso concedido |

A interface deve mostrar somente ações permitidas ao perfil, explicar restrições sem revelar dados protegidos e não tratar ocultação visual como mecanismo de segurança. A autorização real precisa ser aplicada no backend.

## Fluxos prioritários

### Atender uma nova conversa
1. Abrir Conversas.
2. Identificar a conversa não lida ou nova.
3. Abrir a conversa e ler o contexto.
4. Responder ou usar uma resposta rápida.
5. Atualizar etiqueta e responsável, quando permitido.
6. Acompanhar confirmação de envio.

### Localizar um cliente
1. Usar busca por nome, empresa ou trecho de mensagem.
2. Abrir o resultado.
3. Consultar dados, etiqueta, responsável e histórico.
4. Retornar à conversa sem perder o contexto.

### Distribuir atendimento
1. Gestor abre fila.
2. Filtra conversas não atribuídas ou prioritárias.
3. Define responsável.
4. Atendente recebe a conversa na fila autorizada.
5. A interface confirma a atribuição.

### Administrar o workspace
1. Administrador abre Configurações.
2. Seleciona membros, canais ou permissões.
3. Revê o impacto da alteração.
4. Confirma e recebe feedback de sucesso ou erro.

## Padrões de usabilidade
- Rótulos claros e consistentes; evitar ícones sem texto ou nome acessível.
- Busca e filtros próximos à lista de conversas.
- Conversas não lidas, prioritárias e atribuídas distinguíveis por texto/ícone além de cor.
- Ações de alto uso próximas ao contexto; ações destrutivas em menus e com confirmação.
- Estado vazio orienta a próxima ação.
- A navegação por teclado segue a ordem visual; foco sempre visível.
- Em mobile, a lista e a conversa são superfícies separadas com retorno explícito.
- Não depender de hover para ações importantes.
- Evitar duplicar a mesma ação em vários lugares sem necessidade.

## Critérios de aceite
- [x] Estrutura de navegação e módulos documentada.
- [x] Fluxos de conversa individual, busca, atribuição e administração descritos.
- [x] Perfis e necessidades de navegação diferenciados.
- [x] Protótipo navegável cobre seleção de conversa, busca, filtros, respostas rápidas e detalhes/etiquetas.
- [ ] Validar com atendentes e gestores reais e ajustar a arquitetura a partir dos testes.
- [ ] Implementar autenticação, autorização e persistência; protótipo não concede permissões reais.

## Protótipo
A implementação de referência está em `src/app/page.tsx`. A navegação entre Conversas, Contatos, Equipe e Relatórios é demonstrativa; somente a caixa de entrada de exemplo possui interações locais funcionais.
