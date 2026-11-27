import { createEmployeeValidationPostHandler } from "@/lib/admin/employee-validation-handler";
import { validateEmployeeRegistrationForAdmin } from "@/lib/admin/validate-employee-registration";

export const runtime = "nodejs";

const handlePost = createEmployeeValidationPostHandler(
  validateEmployeeRegistrationForAdmin,
);

export async function POST(request: Request): Promise<Response> {
  return handlePost(request);
}
