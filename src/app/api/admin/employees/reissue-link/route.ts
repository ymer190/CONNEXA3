import { reissueEmployeeFirstAccessLink } from "@/lib/admin/supabase-employee-invite";
import { requirePlatformAdmin } from "@/lib/admin/require-platform-admin";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

export async function POST(request: Request): Promise<Response> {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return Response.json(
      { success: false, error: { code: "INVALID_ORIGIN" } },
      { status: 403, headers: NO_STORE },
    );
  }

  let authorization;
  try {
    authorization = await requirePlatformAdmin();
  } catch {
    return Response.json(
      { success: false, error: { code: "AUTHORIZATION_CHECK_FAILED" } },
      { status: 503, headers: NO_STORE },
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
      { status, headers: NO_STORE },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { success: false, error: { code: "INVALID_PAYLOAD" } },
      { status: 400, headers: NO_STORE },
    );
  }

  const operationId =
    typeof body === "object" && body !== null && "operationId" in body
      ? (body as { operationId?: unknown }).operationId
      : undefined;
  if (
    typeof operationId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operationId)
  ) {
    return Response.json(
      { success: false, error: { code: "INVALID_OPERATION_ID" } },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    const firstAccessLink = await reissueEmployeeFirstAccessLink(
      operationId,
      authorization.userId,
    );
    if (!firstAccessLink) {
      return Response.json(
        { success: false, error: { code: "LINK_REISSUE_NOT_AVAILABLE" } },
        { status: 404, headers: NO_STORE },
      );
    }
    return Response.json(
      { success: true, data: { firstAccessLink } },
      { status: 200, headers: NO_STORE },
    );
  } catch {
    return Response.json(
      { success: false, error: { code: "LINK_REISSUE_UNAVAILABLE" } },
      { status: 503, headers: NO_STORE },
    );
  }
}
