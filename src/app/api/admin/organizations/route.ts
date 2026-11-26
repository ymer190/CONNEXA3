import { createOrganizationsGetHandler } from "@/lib/admin/organizations-handler";
import { listOrganizationsForAdmin } from "@/lib/admin/list-organizations";

export const runtime = "nodejs";

const handleGet = createOrganizationsGetHandler(listOrganizationsForAdmin);

export async function GET(): Promise<Response> {
  return handleGet();
}
