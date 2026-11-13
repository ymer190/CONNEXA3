# CONNEXA3

Plataforma web de comunicação e atendimento empresarial. O CONNEXA3 reúne conversas com clientes e colaboração de equipes em uma caixa de entrada compartilhada, com contatos, etiquetas, responsáveis e respostas rápidas.

## Direção do produto

A experiência é inspirada na praticidade conversacional do WhatsApp Business, ampliada para equipes e operações de atendimento. O CONNEXA3 mantém identidade visual e produto próprios.

Princípios:
- **Atendimento centralizado:** acompanhar conversas e canais em um único espaço.
- **Colaboração:** permitir que equipes compartilhem contexto e organizem responsabilidades.
- **Relacionamento:** manter informações e histórico do cliente próximos da conversa.
- **Clareza operacional:** destacar prioridades, pendências e estados de cada atendimento.
- **Acesso web:** funcionar no navegador, com experiência responsiva e sem instalação obrigatória.

## Stack inicial

- **Next.js 15 (App Router):** aplicação web e rotas, com compatibilidade de deploy na Vercel.
- **React 19:** composição da interface.
- **TypeScript:** tipagem estática.
- **CSS global:** estilos responsivos iniciais, sem dependência de biblioteca visual externa.
- **Supabase:** integração de autenticação e dados será adicionada em módulos próprios nas próximas Issues.

A aplicação mantém uma base web única, tipagem desde o início e baixo número de dependências. Não adicionar chaves ou segredos ao código versionado.

## Requisitos

- Node.js 20.9 ou superior.
- npm.

## Executar localmente

1. Clone o repositório.
2. Instale as dependências:

   ```bash
   npm install
   ```

3. Inicie o servidor de desenvolvimento:

   ```bash
   npm run dev
   ```

4. Acesse [http://localhost:3000](http://localhost:3000).

## Verificações

```bash
npm run lint
npm run typecheck
npm run build
```

## Estrutura

```text
src/
  app/
    globals.css
    layout.tsx
    page.tsx
  components/
    brand-mark.tsx
docs/
  ux/
    business-mobile-experience.md
    business-navigation-usability.md
    business-interface-states.md
```

- `src/app`: layout raiz, estilos globais e rotas do App Router.
- `src/components`: componentes de interface reutilizáveis.
- `docs/ux`: especificações de experiência, navegação e estados da interface.

## Ambientes

A aplicação está preparada para ser conectada à Vercel usando o repositório GitHub. A integração de autenticação, dados e tempo real será realizada com Supabase em etapas próprias. Nunca versionar variáveis secretas.

## Escopo do protótipo atual

A interface de referência apresenta uma caixa de entrada empresarial com conversas, busca, filtros, respostas rápidas, etiquetas e painel de contato. Os dados exibidos são fictícios e locais, destinados à avaliação de UX. Conexão com canais, autenticação, persistência, atribuição real de atendimentos e estados confirmados de entrega/leitura ainda dependem das próximas etapas técnicas.
