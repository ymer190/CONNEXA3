import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "./sign-out-button";
import styles from "./admin-dashboard.module.css";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/admin");

  const { data: platformUser, error } = await supabase
    .from("platform_users")
    .select("user_id, role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || platformUser?.role !== "platform_admin") {
    redirect("/acesso-negado");
  }

  return (
    <main className="auth-page">
      <section className="auth-card admin-card">
        <p className="auth-eyebrow">CONNEXA · ADMINISTRAÇÃO DA PLATAFORMA</p>
        <h1>Área administrativa</h1>
        <p className="auth-description">
          Gerencie a estrutura organizacional e as contas da plataforma.
        </p>
        <nav className={styles.links} aria-label="Módulos administrativos">
          <Link className={styles.linkCard} href="/admin/usuarios">
            <span aria-hidden="true">♙</span>
            <span><strong>Usuários e permissões</strong><small>Contas, status e acessos</small></span>
            <span aria-hidden="true">→</span>
          </Link>
          <Link className={styles.linkCard} href="/admin/departamentos">
            <span aria-hidden="true">▦</span>
            <span><strong>Departamentos e setores</strong><small>Estrutura e vínculos organizacionais</small></span>
            <span aria-hidden="true">→</span>
          </Link>
        </nav>
        <dl className="admin-details">
          <div><dt>E-mail</dt><dd>{user.email}</dd></div>
          <div><dt>Perfil da plataforma</dt><dd>{platformUser.role}</dd></div>
        </dl>
        <SignOutButton />
      </section>
    </main>
  );
}
