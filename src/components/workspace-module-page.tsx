"use client";

import Link from "next/link";

type WorkspaceModulePageProps = {
  active: "Grupos" | "Colaboradores" | "Departamentos" | "Arquivos";
  eyebrow: string;
  title: string;
  description: string;
  detail: string;
};

const navigation = [
  { href: "/", label: "Conversas", icon: "▤" },
  { href: "/grupos", label: "Grupos", icon: "♧" },
  { href: "/colaboradores", label: "Colaboradores", icon: "♙" },
  { href: "/departamentos", label: "Departamentos", icon: "▦" },
  { href: "/arquivos", label: "Arquivos", icon: "▥" },
];

export function WorkspaceModulePage({ active, eyebrow, title, description, detail }: WorkspaceModulePageProps) {
  return (
    <main className="module-shell">
      <aside className="module-sidebar" aria-label="Navegação principal">
        <Link className="module-brand" href="/" aria-label="Connexa, início">C<span>.</span></Link>
        <nav className="module-nav">
          {navigation.map((item) => (
            <Link key={item.href} href={item.href} className={active === item.label ? "module-nav-link selected" : "module-nav-link"} aria-current={active === item.label ? "page" : undefined}>
              <span aria-hidden="true">{item.icon}</span><span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="module-sidebar-bottom"><span className="module-status-dot" /> Ambiente corporativo</div>
      </aside>
      <div className="module-main">
        <header className="module-header">
          <div><p className="module-eyebrow">{eyebrow}</p><h1>{title}</h1></div>
          <span className="module-user-mark" aria-label="Área autenticada">C</span>
        </header>
        <section className="module-content" aria-labelledby="module-state-title">
          <div className="module-state-card">
            <span className="module-state-icon" aria-hidden="true">✳</span>
            <p className="module-eyebrow">ESTRUTURA DO CONNEXA</p>
            <h2 id="module-state-title">{description}</h2>
            <p>{detail}</p>
            <span className="module-state-tag">Integração em preparação</span>
            <Link href="/" className="module-back-link">Voltar para conversas</Link>
          </div>
        </section>
      </div>
      <nav className="module-mobile-nav" aria-label="Navegação mobile">
        {navigation.map((item) => (
          <Link key={item.href} href={item.href} className={active === item.label ? "selected" : ""} aria-current={active === item.label ? "page" : undefined}>
            <span aria-hidden="true">{item.icon}</span><small>{item.label}</small>
          </Link>
        ))}
      </nav>
    </main>
  );
}
