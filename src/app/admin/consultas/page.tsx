import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SecurityAdmin } from "@/components/security-admin";

export const dynamic = "force-dynamic";

export default async function AdminConversationConsultationPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/admin/consultas");

  const { data: platformUser, error } = await supabase
    .from("platform_users")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || platformUser?.role !== "platform_admin") {
    redirect("/acesso-negado");
  }

  return <SecurityAdmin section="conversations" />;
}
