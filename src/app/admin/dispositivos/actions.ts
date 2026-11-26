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
  if (!isUuid(target) || !justification || justification.length > 500 ||
      (action === "admin_approve_device" && (!ticketReference || ticketReference.length > 80))) {
    redirect("/admin/dispositivos?error=validation");
  }

  const args = action === "admin_revoke_session"
    ? { p_session_id: target, p_justification: justification }
    : action === "admin_approve_device"
      ? { p_device_id: target, p_justification: justification, p_ticket_reference: ticketReference }
      : { p_device_id: target, p_justification: justification };

  let rpcError: { code?: string } | null = null;
  try {
    const supabase = await createClient();
    const result = await supabase.rpc(action, args);
    rpcError = result.error;
  } catch {
    redirect("/admin/dispositivos?error=unavailable");
  }
  if (rpcError?.code === "42501") redirect("/admin/dispositivos?error=forbidden");
  if (rpcError) redirect("/admin/dispositivos?error=action");
  revalidatePath("/admin/dispositivos");
  redirect("/admin/dispositivos?updated=1");
}

export async function approveDevice(formData: FormData) {
  await runAction("admin_approve_device", formData);
}

export async function listDeviceSessions(formData: FormData) {
  const justification = String(formData.get("justification") ?? "").trim();
  if (!justification || justification.length > 500) return { error: "Informe uma justificativa de até 500 caracteres." };

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("admin_list_device_sessions", {
      p_user_id: null,
      p_justification: justification,
    });
    if (error?.code === "42501") return { error: "Você não tem permissão para consultar essas sessões." };
    if (error) return { error: "Não foi possível consultar as sessões agora. Tente novamente." };
    return { rows: data ?? [] };
  } catch {
    return { error: "O serviço de sessões está indisponível. Tente novamente em alguns instantes." };
  }
}

export async function revokeDevice(formData: FormData) {
  await runAction("admin_revoke_device", formData);
}

export async function revokeSession(formData: FormData) {
  await runAction("admin_revoke_session", formData);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
