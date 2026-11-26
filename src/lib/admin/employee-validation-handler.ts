import type { AdminEmployeeValidationResult } from "./validate-employee-registration";

type ValidateEmployee = (payload: unknown) => Promise<AdminEmployeeValidationResult>;

const statusByCode = {
  INVALID_PAYLOAD: 400,
  INVALID_NAME: 400,
  INVALID_EMAIL: 400,
  INVALID_ORGANIZATION_ID: 400,
  DUPLICATE_EMAIL: 409,
  ORGANIZATION_NOT_FOUND: 404,
  VALIDATION_CHECK_FAILED: 503,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  AUTHORIZATION_CHECK_FAILED: 503,
} as const;

/** Creates an injectable POST handler for isolated HTTP contract tests. */
export function createEmployeeValidationPostHandler(validate: ValidateEmployee) {
  return async function POST(request: Request): Promise<Response> {
    let payload: unknown;

    try {
      payload = await request.json();
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

    let result: AdminEmployeeValidationResult;
    try {
      result = await validate(payload);
    } catch {
      return Response.json(
        {
          success: false,
          error: {
            code: "VALIDATION_CHECK_FAILED",
            message: "Não foi possível validar os dados do colaborador.",
          },
        },
        { status: 503 },
      );
    }

    if (!result.success) {
      return Response.json(
        {
          success: false,
          error: { code: result.code, message: result.message },
        },
        { status: statusByCode[result.code] },
      );
    }

    return Response.json(
      { success: true, data: result.data },
      { status: 200 },
    );
  };
}
