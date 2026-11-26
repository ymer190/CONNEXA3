import { NextResponse } from "next/server";

import { listOrganizationsForAdmin } from "@/lib/admin/list-organizations";

export const runtime = "nodejs";

export async function GET() {
  const result = await listOrganizationsForAdmin();

  if (!result.success) {
    const statusByCode = {
      UNAUTHENTICATED: 401,
      FORBIDDEN: 403,
      AUTHORIZATION_CHECK_FAILED: 503,
      ORGANIZATION_QUERY_FAILED: 500,
    } as const;

    return NextResponse.json(
      {
        success: false,
        error: {
          code: result.code,
          message: result.message,
        },
      },
      { status: statusByCode[result.code] },
    );
  }

  return NextResponse.json(
    {
      success: true,
      data: result.data,
    },
    { status: 200 },
  );
}
