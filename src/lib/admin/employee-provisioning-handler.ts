import {
  prepareEmployeeProvisioningRequest,
} from "./employee-provisioning-request-core.ts";
import type {
  EmployeeProvisioningPayload,
  EmployeeProvisioningResult,
} from "./employee-provisioning-orchestrator-core.ts";

export type EmployeeProvisioningAuthorization =
  | { authorized: true; actorUserId: string }
  | {
      authorized: false;
      status: 401 | 403 | 503;
      code: "UNAUTHENTICATED" | "FORBIDDEN" | "AUTHORIZATION_CHECK_FAILED";
      message: string;
    };

type Dependencies = {
  authorize: () => Promise<EmployeeProvisioningAuthorization>;
  provision: (payload: EmployeeProvisioningPayload) => Promise<EmployeeProvisioningResult>;
};

function responseForResult(result: EmployeeProvisioningResult): Response {
  if (result.kind === "created") {
    return Response.json(
      { success: true, data: { status: "created" } },
      { status: 201 },
    );
  }

  if (result.kind === "replayed") {
    return Response.json(
      { success: true, data: { status: result.status } },
      { status: 200 },
    );
  }

  if (result.kind === "conflict") {
    return Response.json(
      {
        success: false,
        error: {
          code: "IDEMPOTENCY_CONFLICT",
          message: "A chave de idempotência já foi usada com outros dados.",
        },
      },
      { status: 409 },
    );
  }

  if (result.kind === "in_progress") {
    return Response.json(
      { success: true, data: { status: "in_progress" } },
      { status: 202, headers: { "Retry-After": "2" } },
    );
  }

  if (result.kind === "manual_reconciliation_required") {
    return Response.json(
      {
        success: false,
        error: {
          code: "MANUAL_RECONCILIATION_REQUIRED",
          message: "A operação exige análise administrativa antes de nova tentativa.",
        },
      },
      { status: 503 },
    );
  }

  if (result.kind !== "failed") {
    return Response.json(
      {
        success: false,
        error: {
          code: "PROVISIONING_RESULT_INVALID",
          message: "Não foi possível interpretar o resultado do provisionamento.",
        },
      },
      { status: 503 },
    );
  }

  const status = result.code === "AUTH_IDENTITY_NOT_CREATED" ||
    result.code === "DOMAIN_TRANSACTION_FAILED"
    ? 502
    : 503;
  return Response.json(
    {
      success: false,
      error: {
        code: result.code,
        message: "Não foi possível concluir o provisionamento. Consulte o estado da operação antes de tentar novamente.",
      },
    },
    { status },
  );
}

/** Injectable HTTP contract; concrete Auth/database adapters are supplied by the server route. */
export function createEmployeeProvisioningPostHandler(dependencies: Dependencies) {
  return async function POST(request: Request): Promise<Response> {
    let authorization: EmployeeProvisioningAuthorization;
    try {
      authorization = await dependencies.authorize();
    } catch {
      return Response.json(
        {
          success: false,
          error: {
            code: "AUTHORIZATION_CHECK_FAILED",
            message: "Não foi possível validar sua autorização.",
          },
        },
        { status: 503 },
      );
    }

    if (!authorization.authorized) {
      return Response.json(
        {
          success: false,
          error: {
            code: authorization.code,
            message: authorization.message,
          },
        },
        { status: authorization.status },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        {
          success: false,
          error: {
            code: "INVALID_PAYLOAD",
            message: "Informe os dados do colaborador em JSON válido.",
          },
        },
        { status: 400 },
      );
    }

    const prepared = prepareEmployeeProvisioningRequest(
      body,
      request.headers.get("Idempotency-Key"),
      authorization.actorUserId,
    );
    if (!prepared.success) {
      return Response.json(
        {
          success: false,
          error: { code: prepared.code, message: prepared.message },
        },
        { status: 400 },
      );
    }

    try {
      return responseForResult(await dependencies.provision(prepared.data));
    } catch {
      return Response.json(
        {
          success: false,
          error: {
            code: "PROVISIONING_UNAVAILABLE",
            message: "Não foi possível concluir o provisionamento. Consulte o estado da operação antes de tentar novamente.",
          },
        },
        { status: 503 },
      );
    }
  };
}
