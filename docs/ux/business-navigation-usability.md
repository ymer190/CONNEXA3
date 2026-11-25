# Navegação e usabilidade — CONNEXA3

## Modelo mental
O colaborador utiliza o CONNEXA3 para conversar com colegas e grupos de trabalho. A navegação deve ser simples, familiar e organizada pela estrutura da organização.

## Arquitetura de informação
1. **Conversas:** mensagens individuais, grupos autorizados e conversas recentes.
2. **Colaboradores:** diretório interno.
3. **Departamentos:** estrutura organizacional e grupos departamentais.
4. **Arquivos:** documentos, imagens e áudios compartilhados.
5. **Central de TI:** contas, permissões, dispositivos, departamentos, grupos e auditoria.

A navegação do protótipo apresenta Conversas, Colaboradores, Arquivos e Departamentos. Os módulos ainda não integrados apresentam feedback de disponibilidade futura em vez de simular dados ou ações concluídas.

## Perfis e responsabilidades
| Perfil | Responsabilidades |
|---|---|
| Colaborador | Conversar individualmente, participar de grupos autorizados e compartilhar conteúdo conforme política |
| Administrador de TI | Criar e gerenciar contas, grupos, departamentos, permissões e dispositivos; consultar conversas em situações autorizadas e auditadas |

A interface não deve oferecer aos colaboradores controles administrativos de cadastro, criação de grupos, gestão de departamentos ou dispositivos. A autorização real precisa ser aplicada no backend, não apenas escondida na interface.

## Fluxos prioritários
### Iniciar conversa individual
1. Abrir Conversas.
2. Selecionar Nova conversa.
3. Localizar colaborador no diretório autorizado (integração futura).
4. Abrir a conversa.

### Participar de grupo
1. Localizar grupo disponível no diretório autorizado.
2. Consultar nome, departamento e participantes.
3. Abrir o histórico e participar conforme permissões.

### Administração de TI
1. Administrador acessa a Central de TI.
2. Localiza conta, grupo, departamento ou dispositivo.
3. Executa ação permitida.
4. Sistema registra a ação em trilha de auditoria.

## Padrões de usabilidade
- Busca e filtros próximos da lista de conversas.
- Identificação de grupos e conversas individuais por texto e ícone.
- Estado de navegação selecionada exposto por `aria-current`.
- Estados de não lida não dependem somente de cor.
- Ações destrutivas exigem confirmação.
- Estados vazios explicam o próximo passo e oferecem recuperação.
- Foco visível, ordem de teclado coerente e áreas de toque confortáveis.
- Módulos ainda não integrados informam que estão em preparação.
- Não exibir indicadores reais de entrega, leitura ou presença sem eventos confirmados pelo serviço.

## Critérios de aceite
- [x] Navegação principal e fluxos de conversa descritos.
- [x] Separação de responsabilidades entre colaborador e TI documentada.
- [x] Protótipo demonstra lista, busca, filtros e início de conversa individual local.
- [x] Navegação mobile e estado selecionado dos itens identificados semanticamente.
- [ ] Implementar diretório, grupos e Central de TI reais.
- [ ] Validar a experiência com colaboradores e administradores de TI.
