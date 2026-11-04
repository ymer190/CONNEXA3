# CONNEXA3

Aplicação web de comunicação e colaboração para equipes.

## Stack inicial

- **Next.js 15 (App Router):** aplicação web e rotas, com compatibilidade de deploy na Vercel.
- **React 19:** composição da interface.
- **TypeScript:** tipagem estática.
- **CSS global:** estilos responsivos iniciais, sem dependência de biblioteca visual externa.
- **Supabase:** integração de autenticação e dados será adicionada em módulos próprios nas próximas Issues.

A escolha mantém a aplicação em uma base web única, com renderização e rotas suportadas pela Vercel, tipagem desde o início e baixo número de dependências. A interface inicial não depende de serviços externos de fontes, analytics ou APIs de terceiros.

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
```

- `src/app`: layout raiz, estilos globais e rotas do App Router.
- `src/components`: componentes de interface reutilizáveis.
- `src/lib` (a ser expandido): módulos de integração e regras compartilhadas, sem acoplar componentes diretamente aos serviços.

## Ambientes

A aplicação está preparada para ser conectada à Vercel usando o repositório GitHub. As variáveis de ambiente e a inicialização segura do cliente Supabase serão documentadas na Issue #59; não adicione chaves ou segredos ao código versionado.

## Escopo atual

A página inicial é uma apresentação visual inicial do Connexa. Cadastro, autenticação, workspaces, canais, mensagens e tempo real serão implementados nas Issues correspondentes. A prévia de conversa exibida na página é ilustrativa e não representa dados persistidos ou uma funcionalidade já conectada.
