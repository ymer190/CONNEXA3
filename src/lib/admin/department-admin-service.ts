import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

type ServiceFailure = {
  success: false;
  status: 401 | 403 | 500 | 503;
  code: string;
  message: string;
};

type ServiceSuccess<T> = { success: true; data: T };
type ServiceResult<T> = ServiceSuccess<T> | ServiceFailure;

type OrganizationOption = { id: string; name: string };
type Department = { id: string; name: string; status: "active" | "inactive" };
type DepartmentMember = {
  id: string;
  name: string;
  status: "active" | "historical";
  since: string;
};

function failure(status: ServiceFailure["status"], code: string, message: string): ServiceFailure {
  return { success: false, status, code, message };
}

async function authorizePlatformAdmin(): Promise<
  | { success: true; supabase: Awaited<ReturnType<typeof createClient>>; userId: string }
  | ServiceFailure
> {
  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return failure(503, "AUTH_CONFIGURATION_UNAVAILABLE", "A autenticação administrativa não está disponível.");
  }

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) return failure(503, "AUTHORIZATION_CHECK_FAILED", "Não foi possível validar sua sessão.");
    if (!user) return failure(401, "UNAUTHENTICATED", "Entre novamente para continuar.");

    const { data: platformUser, error: roleError } = await supabase
      .from("platform_users")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (roleError) return failure(503, "AUTHORIZATION_CHECK_FAILED", "Não foi possível validar suas permissões.");
    if (platformUser?.role !== "platform_admin") {
      return failure(403, "FORBIDDEN", "Você não tem permissão para administrar departamentos.");
    }

    const { data: deviceAuthorized, error: deviceError } = await supabase.rpc("device_session_is_authorized");
    if (deviceError) {
      return failure(503, "DEVICE_AUTHORIZATION_CHECK_FAILED", "Não foi possível validar a autorização deste dispositivo.");
    }
    if (deviceAuthorized !== true) {
      return failure(403, "DEVICE_NOT_AUTHORIZED", "Este dispositivo ainda não foi autorizado pelo setor de TI.");
    }

    return { success: true, supabase, userId: user.id };
  } catch {
    return failure(503, "AUTHORIZATION_CHECK_FAILED", "Não foi possível validar sua autorização.");
  }
}

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) throw new Error("Admin query is not configured.");
  return createSupabaseClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

function validUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function listOrganizationsForDepartmentAdmin(): Promise<ServiceResult<OrganizationOption[]>> {
  const authorization = await authorizePlatformAdmin();
  if (!authorization.success) return authorization;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("organizations")
      .select("id, name")
      .order("name", { ascending: true })
      .limit(100);

    if (error || !data) {
      return failure(500, "ORGANIZATION_QUERY_FAILED", "Não foi possível carregar as organizações.");
    }
    return { success: true, data: data.map(({ id, name }) => ({ id, name })) };
  } catch {
    return failure(503, "ORGANIZATION_QUERY_UNAVAILABLE", "A consulta de organizações não está disponível.");
  }
}

export async function listDepartmentsForAdmin(organizationId: string): Promise<ServiceResult<Department[]>> {
  if (!validUuid(organizationId)) {
    return failure(400, "INVALID_ORGANIZATION_ID", "Selecione uma organização válida.");
  }

  const authorization = await authorizePlatformAdmin();
  if (!authorization.success) return authorization;

  try {
    const { data, error } = await authorization.supabase.rpc("admin_list_departments", {
      p_organization_id: organizationId,
    });

    if (error) {
      if (error.code === "42501") {
        return failure(403, "FORBIDDEN", "A consulta de departamentos não foi autorizada.");
      }
      return failure(500, "DEPARTMENT_QUERY_FAILED", "Não foi possível carregar os departamentos.");
    }

    const departments = (data ?? []) as Array<{ id: string; name: string; status: string }>;
    return {
      success: true,
      data: departments.map((department) => ({
        id: department.id,
        name: department.name,
        status: department.status === "inactive" ? "inactive" : "active",
      })),
    };
  } catch {
    return failure(503, "DEPARTMENT_QUERY_UNAVAILABLE", "A consulta de departamentos não está disponível.");
  }
}

export async function listDepartmentMembersForAdmin(
  organizationId: string,
  departmentId: string,
): Promise<ServiceResult<DepartmentMember[]>> {
  if (!validUuid(organizationId) || !validUuid(departmentId)) {
    return failure(400, "INVALID_SCOPE", "A organização ou o departamento selecionado é inválido.");
  }

  const authorization = await authorizePlatformAdmin();
  if (!authorization.success) return authorization;

  try {
    const { data, error } = await authorization.supabase.rpc("admin_list_department_members", {
      p_department_id: departmentId,
      p_organization_id: organizationId,
    });

    if (error) {
      if (error.code === "42501") {
        return failure(403, "FORBIDDEN", "A consulta de vínculos não foi autorizada.");
      }
      return failure(500, "MEMBER_QUERY_FAILED", "Não foi possível carregar os colaboradores vinculados.");
    }

    const memberships = (data ?? []) as Array<{ user_id: string; created_at: string; ended_at: string | null }>;
    if (memberships.length === 0) return { success: true, data: [] };

    const admin = createAdminClient();
    const userIds = [...new Set(memberships.map((membership) => membership.user_id))];
    const { data: profiles, error: profileError } = await admin
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds);

    if (profileError || !profiles) {
      return failure(500, "PROFILE_QUERY_FAILED", "Não foi possível carregar os nomes dos colaboradores.");
    }

    const names = new Map(profiles.map((profile) => [profile.id, profile.full_name?.trim() || "Nome não informado"]));
    return {
      success: true,
      data: memberships.map((membership) => ({
        id: membership.user_id,
        name: names.get(membership.user_id) ?? "Perfil não encontrado",
        status: membership.ended_at ? "historical" : "active",
        since: membership.created_at,
      })),
    };
  } catch {
    return failure(503, "MEMBER_QUERY_UNAVAILABLE", "A consulta de vínculos não está disponível.");
  }
}
