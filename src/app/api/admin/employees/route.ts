import { createEmployeeProvisioningPostHandler } from "@/lib/admin/employee-provisioning-handler";
import { createEmployeeProvisioningReconciliationGetHandler } from "@/lib/admin/employee-provisioning-reconciliation-handler";
import { createEmployeeProvisioningDatabase, type EmployeeProvisioningRpcClient } from "@/lib/admin/employee-provisioning-database";
import { requirePlatformAdmin } from "@/lib/admin/require-platform-admin";
import { runEmployeeProvisioning, type EmployeeProvisioningDependencies } from "@/lib/admin/employee-provisioning-orchestrator-core";
import {
  createEmployeeAuthIdentity,
  generateEmployeeFirstAccessInviteLink,
  deleteEmployeeAuthIdentityIfUnaccepted,
  reissueEmployeeFirstAccessLink,
} from "@/lib/admin/supabase-employee-invite";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function provisioningEnvironmentReady(): boolean {
  const required = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "APP_URL",
    "EMPLOYEE_PROVISIONING_EMAIL_ENCRYPTION_KEYS",
    "EMPLOYEE_PROVISIONING_EMAIL_ENCRYPTION_CURRENT_KEY_ID",
  ];
  return required.every((name) => Boolean(process.env[name])) &&
    Boolean(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
}

const handlePost = createEmployeeProvisioningPostHandler({
  authorize: async () => {
    const authorization = await requirePlatformAdmin();
    if (authorization.authorized) {
      return { authorized: true, actorUserId: authorization.userId };
    }

    const status = authorization.reason === "UNAUTHENTICATED"
      ? 401
      : authorization.reason === "FORBIDDEN"
        ? 403
        : 503;

    return {
      authorized: false,
      status,
      code: authorization.reason,
      message: authorization.reason === "UNAUTHENTICATED"
        ? "Autenticação necessária."
        : authorization.reason === "FORBIDDEN"
          ? "Acesso restrito ao administrador da plataforma."
          : "Não foi possível validar sua autorização.",
    };
  },

  provision: async (payload) => {
    // Fail closed before claiming an operation or creating an Auth identity.
    if (!provisioningEnvironmentReady()) {
      return { kind: "failed", code: "CLAIM_FAILED" };
    }

    const supabase = await createClient();
    const persistence = createEmployeeProvisioningDatabase(
      supabase as unknown as EmployeeProvisioningRpcClient,
    );

    const dependencies: EmployeeProvisioningDependencies = {
      ...persistence,
      createAuthIdentityWithFirstAccessPending: (input, claim) =>
        createEmployeeAuthIdentity(input, claim.operationId),
      generateInviteLink: (input, claim, authUserId) =>
        generateEmployeeFirstAccessInviteLink(input, claim.operationId, authUserId),
      deleteUnacceptedAuthIdentityCreatedByOperation: (authUserId, claim) =>
        deleteEmployeeAuthIdentityIfUnaccepted(authUserId, claim.operationId),
    };

    return runEmployeeProvisioning(payload, dependencies);
  },
});

export async function POST(request: Request): Promise<Response> {
  return handlePost(request);
}


const handleGet = createEmployeeProvisioningReconciliationGetHandler({
  authorize: async () => {
    const authorization = await requirePlatformAdmin();
    if (authorization.authorized) {
      return { authorized: true, actorUserId: authorization.userId };
    }
    const status = authorization.reason === "UNAUTHENTICATED"
      ? 401
      : authorization.reason === "FORBIDDEN"
        ? 403
        : 503;
    return {
      authorized: false,
      status,
      code: authorization.reason,
      message: "Não foi possível consultar a operação administrativa.",
    };
  },
  lookup: async (operationId) => {
    const supabase = await createClient();
    const persistence = createEmployeeProvisioningDatabase(
      supabase as unknown as EmployeeProvisioningRpcClient,
    );
    return persistence.getOperationStatusForReconciliation(operationId);
  },
});

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.searchParams.get("action") !== "reissue-first-access-link") {
    return handleGet(request);
  }

  let authorization: Awaited<ReturnType<typeof requirePlatformAdmin>>;
  try {
    authorization = await requirePlatformAdmin();
  } catch {
    return Response.json(
      { success: false, error: { code: "AUTHORIZATION_CHECK_FAILED" } },
      { status: 503, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  if (!authorization.authorized) {
    const status = authorization.reason === "UNAUTHENTICATED"
      ? 401
      : authorization.reason === "FORBIDDEN"
        ? 403
        : 503;
    return Response.json(
      { success: false, error: { code: authorization.reason } },
      { status, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  const operationId = url.searchParams.get("operationId");
  if (
    !operationId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operationId)
  ) {
    return Response.json(
      { success: false, error: { code: "INVALID_OPERATION_ID" } },
      { status: 400, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  try {
    const firstAccessLink = await recoverEmployeeFirstAccessLink(
      operationId,
      authorization.userId,
    );
    if (!firstAccessLink) {
      return Response.json(
        { success: false, error: { code: "LINK_REISSUE_NOT_AVAILABLE" } },
        { status: 404, headers: { "Cache-Control": "no-store, max-age=0" } },
      );
    }
    return Response.json(
      { success: true, data: { firstAccessLink } },
      { status: 200, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch {
    return Response.json(
      { success: false, error: { code: "LINK_REISSUE_UNAVAILABLE" } },
      { status: 503, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
