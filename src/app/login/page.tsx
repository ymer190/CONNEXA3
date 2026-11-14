import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Entrar",
  description: "Acesse sua conta Connexa.",
};

type LoginPageProps = {
  searchParams: Promise<{ next?: string }>;
};

function getSafeRedirectDestination(next?: string) {
  if (!next?.startsWith("/") || next.startsWith("//")) {
    return "/admin";
  }

  try {
    const destination = new URL(next, "https://connexa.invalid");

    if (destination.origin !== "https://connexa.invalid") {
      return "/admin";
    }

    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return "/admin";
  }
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { next } = await searchParams;
  const destination = getSafeRedirectDestination(next);

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="login-title">
        <Link className="auth-brand" href="/">
          Connexa
        </Link>
        <p className="auth-eyebrow">SEU ESPAÇO DE TRABALHO</p>
        <h1 id="login-title">Bem-vindo de volta</h1>
        <p className="auth-description">
          Entre com seu e-mail e senha para continuar.
        </p>
        <LoginForm redirectTo={destination} />
        <p className="auth-footer">
          <Link href="/">Voltar para a página inicial</Link>
        </p>
      </section>
    </main>
  );
}
