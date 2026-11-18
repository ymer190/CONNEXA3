import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "./sign-out-button";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/admin");
  }

  const { data: platformUser, error } = await supabase
    .from("platform_users")
    .select("user_id, role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !platformUser) {
    redirect("/acesso-negado");
  }

  return (
    <main className="auth-page">
      <section className="auth-card admin-card">
        <p className="auth-eyebrow">CONNEXA · ADMINISTRAÇÃO DA PLATAFORMA</p>
        <h1>Área administrativa</h1>
        <p className="auth-description">
          Autenticação e autorização confirmadas para esta conta.
        </p>
        <dl className="admin-details">
          <div>
            <dt>E-mail</dt>
            <dd>{user.email}</dd>
          </div>
          <div>
            <dt>Perfil da plataforma</dt>
            <dd>{platformUser.role}</dd>
          </div>
        </dl>
        <SignOutButton />
      </section>
    </main>
  );
}
