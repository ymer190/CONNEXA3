"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function isPlatformAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) return false;

  const { data: platformUser, error: roleError } = await supabase
    .from("platform_users")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  return !roleError && platformUser?.role === "platform_admin";
}

async function runAction(
  action: "admin_approve_device" | "admin_revoke_device" | "admin_revoke_session",
  formData: FormData,
) {
  if (!(await isPlatformAdmin())) {
    redirect("/acesso-negado");
  }

  const target = String(formData.get("target") ?? "").trim();
  const justification = String(formData.get("justification") ?? "").trim();
  if (!target || !justification || justification.length > 1000) {
    redirect("/admin/dispositivos?error=validation");
  }

  const supabase = await createClient();
  const args = action === "admin_revoke_session"
    ? { p_session_id: target, p_justification: justification }
    : { p_device_id: target, p_justification: justification };
  const { error } = await supabase.rpc(action, args);
  if (error) redirect("/admin/dispositivos?error=action");
  revalidatePath("/admin/dispositivos");
  redirect("/admin/dispositivos?updated=1");
}

export async function approveDevice(formData: FormData) {
  await runAction("admin_approve_device", formData);
}

export async function listDeviceSessions(formData: FormData) {
  if (!(await isPlatformAdmin())) {
    return { error: "Acesso não autorizado." };
  }

  const justification = String(formData.get("justification") ?? "").trim();
  if (!justification || justification.length > 1000) {
    return { error: "Informe uma justificativa válida para consultar as sessões." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_device_sessions", {
    p_user_id: null,
    p_justification: justification,
  });
  if (error) return { error: "Não foi possível consultar as sessões." };
  return { rows: data ?? [] };
}

export async function revokeDevice(formData: FormData) {
  await runAction("admin_revoke_device", formData);
}

export async function revokeSession(formData: FormData) {
  await runAction("admin_revoke_session", formData);
}
