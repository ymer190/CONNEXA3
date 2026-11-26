import {
  validateCreateEmployeeInput,
  type CreateEmployeeInput,
} from "./employee-input.ts";

export type EmployeeRegistrationValidationResult =
  | { success: true; data: CreateEmployeeInput }
  | {
      success: false;
      code:
        | "INVALID_PAYLOAD"
        | "INVALID_NAME"
        | "INVALID_EMAIL"
        | "INVALID_ORGANIZATION_ID"
        | "DUPLICATE_EMAIL"
        | "ORGANIZATION_NOT_FOUND"
        | "VALIDATION_CHECK_FAILED";
      message: string;
    };

type Dependencies = {
  emailExists: (email: string) => Promise<
    | { success: true; exists: boolean }
    | { success: false }
  >;
  organizationExists: (organizationId: string) => Promise<
    | { success: true; exists: boolean }
    | { success: false }
  >;
};

export async function validateEmployeeRegistration(
  payload: unknown,
  dependencies: Dependencies,
): Promise<EmployeeRegistrationValidationResult> {
  const parsed = validateCreateEmployeeInput(payload);
  if (!parsed.success) {
    return {
      success: false,
      code: parsed.error.code,
      message: parsed.error.message,
    };
  }

  let emailResult: Awaited<ReturnType<Dependencies["emailExists"]>>;
  try {
    emailResult = await dependencies.emailExists(parsed.data.email);
  } catch {
    return {
      success: false,
      code: "VALIDATION_CHECK_FAILED",
      message: "Não foi possível validar os dados do colaborador.",
    };
  }

  if (!emailResult.success) {
    return {
      success: false,
      code: "VALIDATION_CHECK_FAILED",
      message: "Não foi possível validar os dados do colaborador.",
    };
  }

  if (emailResult.exists) {
    return {
      success: false,
      code: "DUPLICATE_EMAIL",
      message: "Já existe uma conta cadastrada com este e-mail.",
    };
  }

  let organizationResult: Awaited<ReturnType<Dependencies["organizationExists"]>>;
  try {
    organizationResult = await dependencies.organizationExists(
      parsed.data.organizationId,
    );
  } catch {
    return {
      success: false,
      code: "VALIDATION_CHECK_FAILED",
      message: "Não foi possível validar os dados do colaborador.",
    };
  }

  if (!organizationResult.success) {
    return {
      success: false,
      code: "VALIDATION_CHECK_FAILED",
      message: "Não foi possível validar os dados do colaborador.",
    };
  }

  if (!organizationResult.exists) {
    return {
      success: false,
      code: "ORGANIZATION_NOT_FOUND",
      message: "A organização selecionada não foi encontrada.",
    };
  }

  return { success: true, data: parsed.data };
}
