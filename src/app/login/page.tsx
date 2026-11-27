import type { Metadata } from "next";
import Link from "next/link";
import { getSafeRedirectDestination } from "@/lib/auth-flow.mjs";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Entrar",
  description: "Acesse sua conta Connexa.",
};

type LoginPageProps = {
  searchParams: Promise<{ next?: string; reason?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { next, reason } = await searchParams;
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
        {reason === "session-expired" && (
          <p className="auth-notice" role="status">
            Sua sessão expirou por segurança. Entre novamente para continuar.
          </p>
        )}
        {reason === "auth-required" && (
          <p className="auth-notice" role="status">
            Entre na sua conta para acessar o espaço de trabalho.
          </p>
        )}
        {reason === "auth-unavailable" && (
          <p className="auth-notice" role="status">
            O serviço de autenticação está temporariamente indisponível. Tente novamente em alguns instantes.
          </p>
        )}
        {reason === "signed-out" && (
          <p className="auth-notice" role="status">
            A sessão deste navegador foi encerrada. Suas outras sessões permanecem ativas.
          </p>
        )}
        <LoginForm redirectTo={destination} />
        <p className="auth-footer">
          <Link href="/">Voltar para a página inicial</Link>
        </p>
      </section>
    </main>
  );
}
