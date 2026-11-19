# CONNEXA3

Plataforma web de comunicação corporativa interna, concebida para conectar colaboradores, departamentos e equipes em conversas individuais e grupos, com troca de mensagens, arquivos, comunicados e chamadas em tempo real.

O CONNEXA3 é inspirado em padrões de usabilidade de plataformas como WhatsApp, Discord e Teams, mas terá identidade, regras de negócio e experiência próprias.

## Direção oficial do produto

O produto é destinado à comunicação interna de uma organização com aproximadamente 900 colaboradores. A experiência será **100% mobile-first**, acessível pelo navegador e sem instalação obrigatória de aplicativo.

Princípios:
- **Comunicação direta:** conversas individuais e grupos de departamentos, projetos e equipes.
- **Organização corporativa:** estrutura de departamentos, grupos e comunicados administrados pela TI.
- **Segurança e governança:** autenticação, autorização, gestão de dispositivos e auditoria de ações administrativas.
- **Colaboração em tempo real:** mensagens, compartilhamento de conteúdo e chamadas de áudio/vídeo.
- **Privacidade:** acesso conforme permissões, transparência sobre políticas corporativas e tratamento adequado de dados pessoais.
- **Acessibilidade e mobilidade:** interface responsiva, priorizando smartphones.

## Escopo funcional em definição

A elicitação de requisitos já aprovou, entre outros pontos:
- Conversas individuais e grupos corporativos.
- Mensagens de texto, imagens, documentos, áudios gravados e vídeos.
- Chamadas individuais e em grupo de áudio e vídeo em tempo real.
- Chamadas em grupo com até 50 participantes, sujeitas à validação técnica.
- Compartilhamento de tela durante chamadas.
- Comunicados corporativos e gestão de colaboradores, departamentos e dispositivos pela TI.
- Histórico, notificações, busca e controles de privacidade conforme permissões.

As especificações completas e os pontos ainda pendentes devem ser consultados em `docs/requirements/`. A aprovação funcional não significa que todas as funcionalidades já estejam implementadas.

## Stack e ambientes oficiais

O projeto utilizará exclusivamente serviços online:
- **GitHub Online:** repositório, versionamento, issues, revisão e documentação.
- **Vercel Online:** hospedagem, preview e deploy da aplicação web.
- **Supabase Online:** autenticação, banco de dados, armazenamento e serviços gerenciados conforme arquitetura aprovada.

Não faz parte da estratégia do projeto implantar infraestrutura on-premises ou exigir ambiente local como ambiente oficial de desenvolvimento/operação. Segredos e credenciais privilegiadas nunca devem ser versionados nem expostos no navegador.

## Documentação

- `docs/requirements/calls-audio-video.md`: requisitos aprovados para chamadas individuais e em grupo, regras de negócio, critérios de aceitação, diagramas e pendências técnicas.
- `docs/contracts/department-domain-issue-95.md`: contrato implementado do domínio de departamentos, RPCs, regras de segurança e integração com a Issue #96.
- `docs/architecture/`: documentação de arquitetura; documentos anteriores devem ser revisados contra a direção oficial atual antes de orientar implementação.
- `docs/ux/`: artefatos de UX e protótipos existentes; conteúdos que descrevem o protótipo de atendimento anterior não devem ser tratados automaticamente como especificação funcional vigente.

## Governança de requisitos

- Decisões aprovadas pela PO são a referência funcional oficial.
- Recomendações técnicas não se tornam decisões de produto sem validação.
- Pendências devem permanecer identificadas como pendências.
- Alterações de escopo devem manter rastreabilidade entre requisito, issue, implementação e testes.
- Não considerar um requisito documentado como funcionalidade implementada sem evidência no repositório e validação correspondente.
