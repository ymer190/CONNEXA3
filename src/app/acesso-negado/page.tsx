import Link from "next/link";

export default function AccessDeniedPage() {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="auth-eyebrow">ACESSO RESTRITO</p>
        <h1>Acesso não autorizado</h1>
        <p className="auth-description">
          Sua conta está autenticada, mas não possui permissão administrativa
          nesta plataforma.
        </p>
        <Link className="auth-link-button" href="/">
          Voltar ao início
        </Link>
      </section>
    </main>
  );
}
