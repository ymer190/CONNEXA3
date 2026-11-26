import "server-only";

import { createAdminClient } from "../supabase/admin";
import { requirePlatformAdmin } from "./require-platform-admin";

export type AdminOrganizationOption = {
  id: string;
  name: string;
};

export type ListAdminOrganizationsResult =
  | { success: true; data: AdminOrganizationOption[] }
  | {
      success: false;
      code:
        | "UNAUTHENTICATED"
        | "FORBIDDEN"
        | "AUTHORIZATION_CHECK_FAILED"
        | "ORGANIZATION_QUERY_FAILED";
      message: string;
    };

/**
 * Lists organizations for the administrative employee-provisioning workflow.
 *
 * The privileged client is created only after the caller's session and
 * platform_admin role have been revalidated server-side. Organization names
 * are returned as selection data only; this function does not create members.
 */
export async function listOrganizationsForAdmin(): Promise<ListAdminOrganizationsResult> {
  const authorization = await requirePlatformAdmin();

  if (!authorization.authorized) {
    const messages = {
      UNAUTHENTICATED: "É necessário entrar para continuar.",
      FORBIDDEN: "Você não tem permissão para consultar organizações.",
      AUTHORIZATION_CHECK_FAILED:
        "Não foi possível validar sua autorização.",
    } as const;

    return {
      success: false,
      code: authorization.reason,
      message: messages[authorization.reason],
    };
  }

  let adminClient;

  try {
    adminClient = createAdminClient();
  } catch {
    return {
      success: false,
      code: "ORGANIZATION_QUERY_FAILED",
      message: "A consulta de organizações não está disponível.",
    };
  }

  const { data, error } = await adminClient
    .from("organizations")
    .select("id, name")
    .order("name", { ascending: true });

  if (error || !data) {
    return {
      success: false,
      code: "ORGANIZATION_QUERY_FAILED",
      message: "Não foi possível carregar as organizações.",
    };
  }

  return {
    success: true,
    data: data.map((organization) => ({
      id: organization.id,
      name: organization.name,
    })),
  };
}
