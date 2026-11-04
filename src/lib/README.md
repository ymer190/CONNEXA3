# Módulos compartilhados e integrações

Este diretório concentra código compartilhado que não pertence à camada visual.

Diretrizes:
- Adaptadores de serviços externos devem ser inicializados aqui, em módulos específicos.
- Componentes e páginas não devem duplicar configuração de clientes ou credenciais.
- Segredos nunca podem ser importados por módulos executados no navegador.
- Regras de domínio compartilhadas devem permanecer independentes da apresentação.

A inicialização do cliente Supabase e a validação das variáveis de ambiente serão implementadas na Issue #59.
