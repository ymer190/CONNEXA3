import type { ListAdminOrganizationsResult } from "./list-organizations-core";

type ListOrganizations = () => Promise<ListAdminOrganizationsResult>;

const statusByCode = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  AUTHORIZATION_CHECK_FAILED: 503,
  ORGANIZATION_QUERY_FAILED: 500,
} as const;

/** Creates the HTTP handler with an injectable service for isolated tests. */
export function createOrganizationsGetHandler(listOrganizations: ListOrganizations) {
  return async function GET(): Promise<Response> {
    let result: ListAdminOrganizationsResult;

    try {
      result = await listOrganizations();
    } catch {
      return Response.json(
        {
          success: false,
          error: {
            code: "ORGANIZATION_QUERY_FAILED",
            message: "Não foi possível carregar as organizações.",
          },
        },
        { status: 500 },
      );
    }

    if (!result.success) {
      return Response.json(
        {
          success: false,
          error: {
            code: result.code,
            message: result.message,
          },
        },
        { status: statusByCode[result.code] },
      );
    }

    return Response.json(
      {
        success: true,
        data: result.data,
      },
      { status: 200 },
    );
  };
}
