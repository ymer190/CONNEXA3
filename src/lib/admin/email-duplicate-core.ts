export type AuthUserSummary = { email?: string | null };

export type UserPageResult =
  | { success: true; users: AuthUserSummary[] }
  | { success: false };

export type DuplicateEmailResult =
  | { success: true; exists: boolean }
  | { success: false; code: "USER_LOOKUP_FAILED" };

type Dependencies = {
  listUsers: (page: number, perPage: number) => Promise<UserPageResult>;
};

const USERS_PER_PAGE = 1000;

/**
 * Checks Auth users without exposing Auth's private schema through PostgREST.
 * Callers must authorize the platform administrator before invoking this
 * server-side dependency.
 */
export async function findAuthUserByEmail(
  email: string,
  dependencies: Dependencies,
): Promise<DuplicateEmailResult> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return { success: false, code: "USER_LOOKUP_FAILED" };
  }

  for (let page = 1; ; page += 1) {
    let result: UserPageResult;

    try {
      result = await dependencies.listUsers(page, USERS_PER_PAGE);
    } catch {
      return { success: false, code: "USER_LOOKUP_FAILED" };
    }

    if (!result.success) {
      return { success: false, code: "USER_LOOKUP_FAILED" };
    }

    if (
      result.users.some(
        (user) => user.email?.trim().toLowerCase() === normalizedEmail,
      )
    ) {
      return { success: true, exists: true };
    }

    if (result.users.length < USERS_PER_PAGE) {
      return { success: true, exists: false };
    }
  }
}
