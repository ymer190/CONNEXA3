import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FirstAccessForm } from "./first-access-form";

export const metadata: Metadata = {
  title: "Definir senha",
  description: "Conclua seu primeiro acesso ao Connexa.",
};

export default async function FirstAccessPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?reason=auth-required");
  }

  if (user.app_metadata?.first_access_pending !== true) {
    redirect("/");
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="first-access-title">
        <p className="auth-eyebrow">BEM-VINDO AO CONNEXA</p>
        <h1 id="first-access-title">Defina sua senha</h1>
        <p className="auth-description">
          Para concluir seu primeiro acesso, escolha uma senha pessoal e segura.
        </p>
        <FirstAccessForm />
        <p className="auth-footer">
          <Link href="/auth/logout">Sair da conta</Link>
        </p>
      </section>
    </main>
  );
}
