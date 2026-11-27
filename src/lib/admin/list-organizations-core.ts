export type AdminOrganizationOption = {
  id: string;
  name: string;
};

export type PlatformAdminAuthorization =
  | { authorized: true; userId: string }
  | {
      authorized: false;
      reason: "UNAUTHENTICATED" | "FORBIDDEN" | "AUTHORIZATION_CHECK_FAILED";
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

type Dependencies = {
  authorize: () => Promise<PlatformAdminAuthorization>;
  queryOrganizations: () => Promise<{
    data: AdminOrganizationOption[] | null;
    error: unknown | null;
  }>;
};

const authorizationMessages = {
  UNAUTHENTICATED: "É necessário entrar para continuar.",
  FORBIDDEN: "Você não tem permissão para consultar organizações.",
  AUTHORIZATION_CHECK_FAILED: "Não foi possível validar sua autorização.",
} as const;

/**
 * Keeps authorization ahead of any privileged query and converts unexpected
 * authorization/query exceptions into stable, non-sensitive error results.
 */
export async function listOrganizationsWithDependencies(
  dependencies: Dependencies,
): Promise<ListAdminOrganizationsResult> {
  let authorization: PlatformAdminAuthorization;

  try {
    authorization = await dependencies.authorize();
  } catch {
    return {
      success: false,
      code: "AUTHORIZATION_CHECK_FAILED",
      message: authorizationMessages.AUTHORIZATION_CHECK_FAILED,
    };
  }

  if (!authorization.authorized) {
    return {
      success: false,
      code: authorization.reason,
      message: authorizationMessages[authorization.reason],
    };
  }

  try {
    const { data, error } = await dependencies.queryOrganizations();

    if (error || !data) {
      return {
        success: false,
        code: "ORGANIZATION_QUERY_FAILED",
        message: "Não foi possível carregar as organizações.",
      };
    }

    return {
      success: true,
      data: data.map(({ id, name }) => ({ id, name })),
    };
  } catch {
    return {
      success: false,
      code: "ORGANIZATION_QUERY_FAILED",
      message: "Não foi possível carregar as organizações.",
    };
  }
}
