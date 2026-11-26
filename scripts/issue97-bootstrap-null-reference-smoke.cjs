const { randomUUID } = require("node:crypto");

async function main() {
  const baseUrl = process.env.AUTH_TEST_SUPABASE_URL?.replace(/\/$/, "");
  const serviceRoleKey = process.env.AUTH_TEST_SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !serviceRoleKey) {
    throw new Error("Isolated Supabase URL and service-role key are required.");
  }

  const response = await fetch(`${baseUrl}/rest/v1/rpc/bootstrap_approve_admin_device`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_device_id: randomUUID(),
      p_ticket_reference: "SQA-NULL-REFERENCE",
      p_justification: "Regression test: a null operator reference must be rejected.",
      p_operator_audit_reference: null,
    }),
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({}));
  if (response.status !== 400 || body.code !== "22023") {
    throw new Error(`Expected SQLSTATE 22023 for a null operator reference; received HTTP ${response.status}, code ${body.code ?? "none"}.`);
  }
  console.log("PASS: break-glass bootstrap explicitly rejects a null operator audit reference before any write.");
}

main().catch((error) => {
  console.error("Issue 97 bootstrap regression test failed:", error.message);
  process.exit(1);
});
