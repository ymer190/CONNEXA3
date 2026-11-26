import { NextResponse } from "next/server";
import { listOrganizationsForDepartmentAdmin } from "@/lib/admin/department-admin-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await listOrganizationsForDepartmentAdmin();
  if (!result.success) {
    return NextResponse.json(
      { success: false, error: { code: result.code, message: result.message } },
      { status: result.status },
    );
  }
  return NextResponse.json({ success: true, data: result.data });
}
