import Link from "next/link";

export default function InvalidInvitePage() {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="auth-eyebrow">CONVITE NÃO VALIDADO</p>
        <h1>Não foi possível validar o convite</h1>
        <p className="auth-description">
          O link pode ter expirado ou já ter sido utilizado. Solicite um novo
          convite ao administrador da sua organização.
        </p>
        <Link className="auth-link-button" href="/login">
          Ir para entrar
        </Link>
      </section>
    </main>
  );
}
