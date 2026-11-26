import "server-only";

import { createAdminClient } from "../supabase/admin";
import { requirePlatformAdmin } from "./require-platform-admin";
import { findAuthUserByEmail } from "./email-duplicate-core";
import { validateEmployeeRegistration } from "./employee-registration-validation-core";

export type AdminEmployeeValidationResult =
  | Awaited<ReturnType<typeof validateEmployeeRegistration>>
  | {
      success: false;
      code: "UNAUTHENTICATED" | "FORBIDDEN" | "AUTHORIZATION_CHECK_FAILED";
      message: string;
    };

/** Validates employee details and duplicate email/organization using server-only APIs. */
export async function validateEmployeeRegistrationForAdmin(
  payload: unknown,
): Promise<AdminEmployeeValidationResult> {
  let authorization;

  try {
    authorization = await requirePlatformAdmin();
  } catch {
    return {
      success: false,
      code: "AUTHORIZATION_CHECK_FAILED",
      message: "Não foi possível validar sua autorização.",
    };
  }

  if (!authorization.authorized) {
    const messages = {
      UNAUTHENTICATED: "É necessário entrar para continuar.",
      FORBIDDEN: "Você não tem permissão para cadastrar colaboradores.",
      AUTHORIZATION_CHECK_FAILED: "Não foi possível validar sua autorização.",
    } as const;

    return {
      success: false,
      code: authorization.reason,
      message: messages[authorization.reason],
    };
  }

  try {
    const adminClient = createAdminClient();

    return await validateEmployeeRegistration(payload, {
      emailExists: (email) =>
        findAuthUserByEmail(email, {
          listUsers: async (page, perPage) => {
            const { data, error } = await adminClient.auth.admin.listUsers({
              page,
              perPage,
            });
            if (error) return { success: false };
            return { success: true, users: data.users };
          },
        }),
      organizationExists: async (organizationId) => {
        const { data, error } = await adminClient
          .from("organizations")
          .select("id")
          .eq("id", organizationId)
          .maybeSingle();

        if (error) return { success: false };
        return { success: true, exists: Boolean(data) };
      },
    });
  } catch {
    return {
      success: false,
      code: "VALIDATION_CHECK_FAILED",
      message: "Não foi possível validar os dados do colaborador.",
    };
  }
}
