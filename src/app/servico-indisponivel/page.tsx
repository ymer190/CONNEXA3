import Link from "next/link";
import { getSafeRedirectDestination } from "@/lib/auth-flow.mjs";

type ServiceUnavailablePageProps = {
  searchParams: Promise<{ next?: string }>;
};

export default async function ServiceUnavailablePage({ searchParams }: ServiceUnavailablePageProps) {
  const { next } = await searchParams;
  const destination = getSafeRedirectDestination(next);
  const login = new URLSearchParams({ next: destination, reason: "auth-unavailable" });

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="service-unavailable-title">
        <p className="auth-eyebrow">CONNEXA · SERVIÇO TEMPORARIAMENTE INDISPONÍVEL</p>
        <h1 id="service-unavailable-title">Não foi possível confirmar seu acesso</h1>
        <p className="auth-description" role="status">
          A autenticação ou a verificação de segurança não respondeu. Seu acesso foi bloqueado por segurança. Tente novamente em alguns instantes.
        </p>
        <Link className="auth-link-button" href={`/login?${login.toString()}`}>
          Tentar novamente
        </Link>
      </section>
    </main>
  );
}
