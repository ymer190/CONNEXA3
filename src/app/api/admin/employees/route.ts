import { createEmployeeProvisioningPostHandler } from "@/lib/admin/employee-provisioning-handler";
import { createEmployeeProvisioningReconciliationGetHandler } from "@/lib/admin/employee-provisioning-reconciliation-handler";
import { createEmployeeProvisioningDatabase, type EmployeeProvisioningRpcClient } from "@/lib/admin/employee-provisioning-database";
import { requirePlatformAdmin } from "@/lib/admin/require-platform-admin";
import { runEmployeeProvisioning, type EmployeeProvisioningDependencies } from "@/lib/admin/employee-provisioning-orchestrator-core";
import {
  createEmployeeAuthIdentity,
  generateEmployeeFirstAccessInviteLink,
  deleteEmployeeAuthIdentityIfUnaccepted,
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
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return Response.json(
      { success: false, error: { code: "INVALID_ORIGIN" } },
      { status: 403, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
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
  return handleGet(request);
}
