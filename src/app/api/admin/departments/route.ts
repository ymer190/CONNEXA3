import { NextRequest, NextResponse } from "next/server";
import { listDepartmentsForAdmin } from "@/lib/admin/department-admin-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const organizationId = request.nextUrl.searchParams.get("organizationId") ?? "";
  const result = await listDepartmentsForAdmin(organizationId);
  if (!result.success) {
    return NextResponse.json(
      { success: false, error: { code: result.code, message: result.message } },
      { status: result.status },
    );
  }
  return NextResponse.json({ success: true, data: result.data });
}
