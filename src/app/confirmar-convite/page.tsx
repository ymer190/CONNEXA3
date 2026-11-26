import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AcceptInviteForm } from "./accept-invite-form";

export const metadata: Metadata = {
  title: "Aceitar convite",
  description: "Confirme seu convite para acessar o Connexa.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type ConfirmationPageProps = {
  searchParams: Promise<{ token_hash?: string; type?: string }>;
};

export default async function ConfirmInvitePage({ searchParams }: ConfirmationPageProps) {
  const { token_hash: tokenHash, type } = await searchParams;

  if (!tokenHash || tokenHash.length > 512 || type !== "invite") {
    redirect("/convite-invalido");
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="auth-eyebrow">CONVITE CONNEXA</p>
        <h1>Você foi convidado</h1>
        <p className="auth-description">
          Confirme o convite para validar seu acesso e definir sua senha pessoal.
        </p>
        <AcceptInviteForm tokenHash={tokenHash} />
      </section>
    </main>
  );
}
