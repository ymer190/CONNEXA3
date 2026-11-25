import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UsersAdmin } from "@/components/users-admin";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/admin/usuarios");

  const { data: platformUser, error } = await supabase
    .from("platform_users")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || platformUser?.role !== "platform_admin") {
    redirect("/acesso-negado");
  }

  return <UsersAdmin />;
}
