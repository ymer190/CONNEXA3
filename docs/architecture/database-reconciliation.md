# Reconciliação arquitetural — comunicação interna

**Status:** diagnóstico concluído; decisões de modelagem pendentes antes de novas migrations  
**Ambiente inspecionado:** Supabase DEV (`dzsacdtolxrqgwlekzdg`)  
**Produção:** não alterada

## 1. Direção de produto confirmada

O CONNEXA3 é uma plataforma corporativa interna de comunicação, com experiência mobile-first semelhante ao WhatsApp. Não é uma plataforma de atendimento a clientes com inbox compartilhada, etiquetas de atendimento ou integração de canais externos.

A documentação e o backlog devem usar essa direção como fonte de verdade.

## 2. Estado do Supabase DEV — baseline com data e fonte

**Último inventário SQA rastreável nesta revisão: 22/11/2026.** O inventário reportado pela SQA identificou seis tabelas próprias no schema \`public\`, todas com RLS habilitado:

| Tabela | Situação no inventário SQA | Observação |
|---|---|---|
| \`organizations\` | Existente | Organização |
| \`profiles\` | Existente | Perfil associado à identidade Supabase Auth |
| \`organization_members\` | Existente | Vínculo organizacional |
| \`platform_users\` | Existente | Papel administrativo da plataforma |
| \`departments\` | Existente | Estrutura organizacional departamental |
| \`department_members\` | Existente | Histórico/vínculo de colaboradores a departamentos |

O mesmo inventário registrou **oito migrations** no ledger remoto DEV. As cinco migrations de departamentos foram integradas à \`main\` por meio das PRs #134 e #132; a #132 foi integrada em 23/11/2026 no commit \`7786813617c1908c2193751c390dbbaf90cb31b7\`. O workflow de DEV associado à integração anterior da #134 foi reportado como SUCCESS pela SQA.

**Limite de evidência:** os números acima são um snapshot identificado por data, baseado na revisão SQA e no histórico de integração do repositório; não representam uma nova consulta direta ao banco executada nesta atualização. Antes de qualquer migration futura, confirmar novamente o ledger e o schema do projeto Supabase DEV. Nenhuma migration deve ser reaplicada apenas por estar mencionada neste relatório.

O ambiente PROD não foi consultado nem alterado nesta atividade.

## 3. Comparação entre o baseline DEV e o contrato de arquitetura

| Domínio | Estado documental/DEV | Diagnóstico |
|---|---|---|
| Organizações, perfis e vínculos | Tabelas presentes no inventário SQA | Base estrutural existente |
| Administradores da plataforma | \`platform_users\` presente | Separado dos papéis organizacionais |
| Departamentos | \`departments\` e \`department_members\` presentes | Domínio da Issue #95 entregue em etapas e integrado à \`main\`; não equivale a grupos de conversa |
| Conversas | Não constavam no inventário DEV de 22/11 | Contrato lógico documentado; implementação física ainda não comprovada |
| Participantes de conversas | Não constavam no inventário DEV de 22/11 | \`conversation_members\` é parte do contrato documental |
| Mensagens e anexos | Não constavam no inventário DEV de 22/11 | \`messages\` e \`message_attachments\` ainda não comprovadas como tabelas implantadas |
| Auditoria de conversas | Não constava no inventário DEV de 22/11 | Contrato prevê \`conversation_audit_logs\`; integração com #97 deve manter responsabilidades distintas |

### 3.1 Contrato lógico de conversas — PR #130 / Issue #96

A proposta documental consolidada na PR #130 estabelece um modelo unificado com \`conversations\`, \`conversation_members\`, \`messages\`, \`message_attachments\` e \`conversation_audit_logs\`. Os tipos previstos são \`channel\`, \`direct\` e \`group\`.

Esse modelo deve ser tratado como **contrato documental em revisão**, pois a PR #130 permanece Draft e não representa, por si só, aprovação final nem implementação no Supabase DEV. A decisão de modelagem não deve mais ser descrita como se ainda não existisse qualquer proposta; o ponto pendente é concluir a revisão/aprovação do contrato e, depois, projetar migrations e políticas.

### 3.2 Departamentos, grupos e canais

- **Departamento:** estrutura organizacional para classificar colaboradores e atribuir responsabilidades.
- **Grupo de conversa:** espaço de comunicação com participantes e regras de acesso próprias.
- **Canal:** tipo de conversa previsto no contrato lógico, sujeito às regras específicas de visibilidade e participação.
- **Conversa direta:** conversa individual entre participantes autorizados.

Um departamento não é automaticamente um grupo de conversa, e pertencer a um departamento não deve conceder acesso implícito a todo grupo/canal. O vínculo entre domínio departamental e grupos deve ser explícito, auditável e validado pelas regras da #96.

### 3.3 Papéis e autorização

O inventário atual distingue \`platform_users\` dos papéis organizacionais. A PR #130 documenta limites adicionais para \`platform_admin\`, \`it_support\` e \`collaborator\`, além da supervisão independente do RPGD. Essas definições pertencem ao contrato documental da #96 e precisam ser implementadas/testadas em etapas próprias; não presumir que a existência de \`platform_users\` prove a implementação de todas essas capacidades.

A leitura excepcional de conversas exige duas aprovações registradas e separadas — Direção e TI autorizado — sem autoaprovação e sem que o aprovador seja o leitor excepcional. O RPGD exerce supervisão de privacidade independente, sem ser aprovador nem receber acesso ao conteúdo por seu papel.

### 3.4 Isolamento e autorização

O desenho futuro deve aplicar isolamento por organização/tenant, participação explícita em conversas privadas, autorização server-side em cada leitura e RLS coerente com o modelo de domínio. Metadados e conteúdo devem ter regras de autorização próprias quando necessário. Nenhuma permissão deve depender apenas de ocultação na interface ou de identificadores fornecidos pelo cliente.

## 4. Direção de produto e documentação vigente

O README da \`main\` já foi atualizado e descreve o CONNEXA3 como plataforma de comunicação corporativa interna, mobile-first, com conversas individuais, grupos, mensagens, arquivos, comunicados e chamadas. Portanto, a antiga afirmação de que o README principal ainda descreve atendimento a clientes está **obsoleta e foi removida deste diagnóstico**.

O documento \`docs/architecture/database-model.md\` identifica a si próprio como modelo técnico preliminar legado, sujeito a reconciliação. Não deve ser usado isoladamente como especificação física vigente.

## 5. Pontos positivos, lacunas e riscos

- O inventário SQA de 22/11 reportou RLS habilitado nas seis tabelas listadas.
- \`platform_users\` mantém separação entre administração da plataforma e vínculo organizacional.
- O domínio de departamentos foi integrado à \`main\` pelas PRs #134 e #132; consultar \`docs/contracts/department-domain-issue-95.md\` como contrato do domínio.
- A integração da #95 não encerra os gates de release relacionados a #94, #96 e #97.
- A proposta de conversas da #130 ainda não comprova existência de tabelas, RLS, Realtime, Storage ou criptografia no DEV.
- O inventário SQA anterior apontou **Leaked Password Protection Disabled** no Supabase Auth. Revalidar no painel/Advisor do DEV antes de tratar como alerta atual e habilitar conforme decisão técnica.
- Um índice reportado como não utilizado em ambiente com poucos registros não deve ser removido sem análise de carga e plano de execução.

## 6. Backlog e estado de entrega relacionado

| Referência | Relação com este diagnóstico | Estado considerado nesta revisão |
|---|---|---|
| #37 | Arquitetura inicial/modelo de dados | Documento legado em reconciliação |
| #59 | Cliente Supabase e configuração segura | Não é objeto de mudança desta PR |
| #91 | Administração e autorização | Base \`platform_users\` existente; capacidades completas dependem do contrato vigente |
| #95 | Departamentos e grupos | Etapas de domínio de departamentos integradas à \`main\`; gates #94/#96/#97 permanecem |
| #96 | Autorização e conversas | Contrato documental relacionado à PR #130; implementação e validação permanecem separadas |
| #97 | Auditoria | Modelo geral de auditoria é dependência; não declarar concluído por este relatório |
| #99 | Interface de conversas individuais | Requisito de produto; não comprova backend/tabelas |
| #100 | Interface de grupos | Requisito de produto; não comprova backend/tabelas |
| #108 | Comunicação individual e em grupos em tempo real | Requisito de produto; implementação deve seguir contrato aprovado |
| #112 | Validação de segurança/autorização | Evidências devem ser vinculadas às entregas correspondentes |
| #130 | Contrato documental da #96 | PR Draft; não confundir com implementação física |

Referências antigas à Issue #67 foram removidas por não representarem o backlog vigente após o reset do projeto.

## 7. Sequência recomendada

1. Concluir revisão SQA/TL/PO do contrato documental da #96/#130, incluindo permissões, participantes, auditoria, retenção e semântica de remoção.
2. Confirmar o inventário real do Supabase DEV imediatamente antes de desenhar novas migrations.
3. Traduzir o contrato aprovado em modelo físico, constraints, índices, RLS e testes negativos por tenant/conversa.
4. Definir a integração explícita entre departamentos e grupos, sem conceder acesso implícito por departamento.
5. Implementar migrations incrementais exclusivamente no Supabase DEV, após revisão e aprovação; validar ledger, políticas e testes.
6. Manter PROD fora do escopo até homologação SQA e autorização explícita de mudança.

## 8. Limites desta PR

- Escopo exclusivamente documental: este arquivo de reconciliação arquitetural.
- Nenhuma tabela, policy, trigger, função, segredo ou migration foi alterada no Supabase por esta atualização.
- Nenhuma migration foi aplicada em DEV ou PROD.
- Nenhum dado operacional foi copiado ou transportado.
- A PR não declara conversas/mensagens implementadas nem libera produção.
- As migrations históricas já integradas à \`main\` não são apresentadas como entrega nova desta PR.
- O baseline do DEV está identificado com data e fonte; deve ser revalidado antes de novas mudanças.