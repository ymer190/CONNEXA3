import { NextRequest, NextResponse } from "next/server";
import { listDepartmentMembersForAdmin } from "@/lib/admin/department-admin-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ departmentId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { departmentId } = await context.params;
  const organizationId = request.nextUrl.searchParams.get("organizationId") ?? "";
  const result = await listDepartmentMembersForAdmin(organizationId, departmentId);
  if (!result.success) {
    return NextResponse.json(
      { success: false, error: { code: result.code, message: result.message } },
      { status: result.status },
    );
  }
  return NextResponse.json({ success: true, data: result.data });
}
