export type CreateEmployeeInput = {
  fullName: string;
  email: string;
  organizationId: string;
};

export type CreateEmployeeInputErrorCode =
  | "INVALID_PAYLOAD"
  | "INVALID_NAME"
  | "INVALID_EMAIL"
  | "INVALID_ORGANIZATION_ID";

export type CreateEmployeeInputResult =
  | { success: true; data: CreateEmployeeInput }
  | {
      success: false;
      error: {
        code: CreateEmployeeInputErrorCode;
        message: string;
      };
    };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function invalid(
  code: CreateEmployeeInputErrorCode,
  message: string,
): CreateEmployeeInputResult {
  return { success: false, error: { code, message } };
}

/**
 * Validates and normalizes the business input for administrative employee
 * provisioning. This function performs no database or Auth operation.
 */
export function validateCreateEmployeeInput(
  value: unknown,
): CreateEmployeeInputResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return invalid("INVALID_PAYLOAD", "Informe os dados do colaborador.");
  }

  const input = value as Record<string, unknown>;

  if (typeof input.fullName !== "string") {
    return invalid("INVALID_NAME", "Informe um nome válido.");
  }

  const fullName = input.fullName.trim().replace(/\s+/g, " ");
  if (fullName.length < 2 || fullName.length > 120) {
    return invalid(
      "INVALID_NAME",
      "O nome deve ter entre 2 e 120 caracteres.",
    );
  }

  if (typeof input.email !== "string") {
    return invalid("INVALID_EMAIL", "Informe um e-mail válido.");
  }

  const email = input.email.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return invalid("INVALID_EMAIL", "Informe um e-mail válido.");
  }

  if (
    typeof input.organizationId !== "string" ||
    !UUID_PATTERN.test(input.organizationId.trim())
  ) {
    return invalid(
      "INVALID_ORGANIZATION_ID",
      "Selecione uma organização válida.",
    );
  }

  return {
    success: true,
    data: {
      fullName,
      email,
      organizationId: input.organizationId.trim().toLowerCase(),
    },
  };
}
