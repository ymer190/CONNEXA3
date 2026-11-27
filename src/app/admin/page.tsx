import { redirect } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { classifyAuthFailure } from "@/lib/auth-flow.mjs";
import { SignOutButton } from "./sign-out-button";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  let supabase: SupabaseClient | null = null;
  let user: User | null = null;
  let authError: unknown = null;
  try {
    supabase = await createClient();
    const result = await supabase.auth.getUser();
    user = result.data.user;
    authError = result.error;
  } catch (error) {
    authError = error;
  }

  if (!user) {
    const authState = classifyAuthFailure(authError);
    if (authState === "unavailable") redirect("/servico-indisponivel?next=%2Fadmin");
    redirect(authState === "expired" ? "/login?next=%2Fadmin&reason=session-expired" : "/login?next=%2Fadmin");
  }
  if (!supabase) redirect("/servico-indisponivel?next=%2Fadmin");

  let platformUser: { user_id: string; role: string } | null = null;
  let platformUserError = false;
  try {
    const result = await supabase
      .from("platform_users")
      .select("user_id, role")
      .eq("user_id", user.id)
      .maybeSingle();
    platformUser = result.data;
    platformUserError = result.error !== null;
  } catch {
    platformUserError = true;
  }

  if (platformUserError) {
    redirect("/servico-indisponivel?next=%2Fadmin");
  }
  if (platformUser?.role !== "platform_admin") {
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
        <p><Link href="/admin/dispositivos">Gerenciar dispositivos e sessões</Link></p>
      </section>
    </main>
  );
}
