import type { Metadata } from "next";
import { AcceptInviteForm } from "./accept-invite-form";

export const metadata: Metadata = {
  title: "Aceitar convite",
  description: "Confirme seu convite para acessar o Connexa.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function ConfirmInvitePage() {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="auth-eyebrow">CONVITE CONNEXA</p>
        <h1>Você foi convidado</h1>
        <p className="auth-description">
          Confirme o convite para validar seu acesso e definir sua senha pessoal.
        </p>
        <AcceptInviteForm />
      </section>
    </main>
  );
}
