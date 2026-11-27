import type { EmployeeProvisioningAuthorization } from "./employee-provisioning-handler";

export type EmployeeProvisioningReconciliationRecord = {
  operationId: string;
  status: string;
  phase: string;
  hasInviteLink: boolean;
  hasProviderReceipt: boolean;
  failureCode: string | null;
};

type Dependencies = {
  authorize: () => Promise<EmployeeProvisioningAuthorization>;
  lookup: (operationId: string) => Promise<EmployeeProvisioningReconciliationRecord | null>;
};

/** Read-only reconciliation status; never returns decrypted PII, Auth IDs or links. */
export function createEmployeeProvisioningReconciliationGetHandler(
  dependencies: Dependencies,
) {
  return async function GET(request: Request): Promise<Response> {
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
        { status: 503, headers: { "Cache-Control": "no-store" } },
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
        { status: authorization.status, headers: { "Cache-Control": "no-store" } },
      );
    }

    const operationId = new URL(request.url).searchParams.get("operationId");
    if (
      !operationId ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operationId)
    ) {
      return Response.json(
        {
          success: false,
          error: {
            code: "INVALID_OPERATION_ID",
            message: "Informe um identificador de operação válido.",
          },
        },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    try {
      const operation = await dependencies.lookup(operationId);
      if (!operation) {
        return Response.json(
          {
            success: false,
            error: {
              code: "OPERATION_NOT_FOUND",
              message: "Operação não encontrada ou sem acesso.",
            },
          },
          { status: 404, headers: { "Cache-Control": "no-store" } },
        );
      }

      return Response.json(
        {
          success: true,
          data: {
            operationId: operation.operationId,
            status: operation.status,
            phase: operation.phase,
            hasInviteLink: operation.hasInviteLink,
            hasProviderReceipt: operation.hasProviderReceipt,
            failureCode: operation.failureCode,
          },
        },
        { status: 200, headers: { "Cache-Control": "no-store" } },
      );
    } catch {
      return Response.json(
        {
          success: false,
          error: {
            code: "RECONCILIATION_LOOKUP_UNAVAILABLE",
            message: "Não foi possível consultar o estado da operação.",
          },
        },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
  };
}
