"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function runAction(
  action: "admin_approve_device" | "admin_revoke_device" | "admin_revoke_session",
  formData: FormData,
) {
  const target = String(formData.get("target") ?? "");
  const justification = String(formData.get("justification") ?? "").trim();
  const ticketReference = String(formData.get("ticket_reference") ?? "").trim();
  if (!target || !justification || (action === "admin_approve_device" && !ticketReference)) {
    redirect("/admin/dispositivos?error=validation");
  }

  const supabase = await createClient();
  const args = action === "admin_revoke_session"
    ? { p_session_id: target, p_justification: justification }
    : action === "admin_approve_device"
      ? { p_device_id: target, p_justification: justification, p_ticket_reference: ticketReference }
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
  const justification = String(formData.get("justification") ?? "").trim();
  if (!justification) return { error: "Informe uma justificativa para consultar as sessões." };

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
