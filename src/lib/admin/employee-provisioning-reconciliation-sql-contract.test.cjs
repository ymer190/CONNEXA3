const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const root = process.cwd();
const sql = readFileSync(
  join(root, "docs/contracts/employee-provisioning-issue-92-migration-draft.sql"),
  "utf8",
);
const adapter = readFileSync(
  join(root, "src/lib/admin/employee-provisioning-database.ts"),
  "utf8",
);

test("reconciliation RPC exposes status-only fields to authenticated admins", () => {
  const start = sql.indexOf(
    "create or replace function public.admin_get_employee_provisioning_operation(",
  );
  const end = sql.indexOf(
    "\ncreate or replace function public.admin_commit_employee_provisioning(",
    start,
  );

  assert.notEqual(start, -1, "status RPC must exist in the SQL draft");
  assert.notEqual(end, -1, "status RPC must end before the domain commit RPC");

  const rpc = sql.slice(start, end);
  for (const field of [
    "operation_id uuid",
    "status text",
    "phase text",
    "has_invite_link boolean",
    "failure_code text",
  ]) {
    assert.ok(rpc.includes(field), `status RPC must expose ${field}`);
  }

  const returnTable = rpc.match(/returns\s+table\s*\(([\s\S]*?)\)\s*language/i);
  assert.ok(returnTable, "status RPC must declare its return table");

  const returnedFields = returnTable[1]
    .split(",")
    .map((field) => field.trim().replace(/\s+/g, " ").toLowerCase());
  assert.deepEqual(returnedFields, [
    "operation_id uuid",
    "status text",
    "phase text",
    "has_invite_link boolean",
    "failure_code text",
  ]);

  const projection = rpc.match(/return\s+query\s+select([\s\S]*?)\s+from\s+/i);
  assert.ok(projection, "status RPC must have a SELECT projection");
  const projectedExpressions = projection[1]
    .split(",")
    .map((expression) => expression.trim().replace(/\s+/g, " ").toLowerCase());
  assert.deepEqual(projectedExpressions, [
    "op.id",
    "op.status",
    "op.phase",
    "(op.invite_link_envelope is not null)",
    "op.failure_code",
  ]);

  assert.match(rpc, /op\.actor_user_id\s*=\s*actor_id/);
  assert.match(
    sql,
    /grant execute on function public\.admin_get_employee_provisioning_operation\(uuid\) to authenticated;/,
  );
});

test("authenticated reconciliation adapter never decrypts operational secrets", () => {
  assert.doesNotMatch(adapter, /getOperationForReconciliation/);
  assert.doesNotMatch(adapter, /decryptProvisioningEmail|decryptProvisioningInviteLink/);
  assert.match(adapter, /has_invite_link/);
  assert.doesNotMatch(adapter, /has_provider_receipt|provider_message_id|email_sent/);
});

test("claim replay does not disclose the Auth user ID", () => {
  const start = sql.indexOf(
    "create or replace function public.admin_claim_employee_provisioning(",
  );
  const end = sql.indexOf(
    "\ncreate or replace function public.admin_mark_employee_auth_creation_started(",
    start,
  );

  assert.notEqual(start, -1, "claim RPC must exist in the SQL draft");
  assert.notEqual(end, -1, "claim RPC must end before the Auth phase RPC");

  const rpc = sql.slice(start, end);
  assert.doesNotMatch(rpc, /auth_user_id/i);
});

test("first-access link recovery is restricted to the original actor and service role", () => {
  const start = sql.indexOf(
    "create or replace function public.admin_get_employee_provisioning_invite_link(",
  );
  const end = sql.indexOf(
    "\\ncreate or replace function public.admin_mark_employee_compensation_pending(",
    start,
  );
  assert.notEqual(start, -1, "privileged link recovery RPC must exist");
  assert.notEqual(end, -1, "link recovery RPC must end before compensation RPC");

  const rpc = sql.slice(start, end);
  assert.match(rpc, /auth\\.jwt\\(\\)\\s*->>\\s*'role'\\s*<>\\s*'service_role'/);
  assert.match(rpc, /op\\.actor_user_id\\s*=\\s*p_actor_user_id/);
  assert.match(rpc, /op\\.status\\s*=\\s*'completed'/);
  assert.match(rpc, /op\\.phase\\s*=\\s*'completed'/);
  assert.match(rpc, /op\\.invite_link_envelope\\s+is\\s+not\\s+null/);
  assert.match(
    sql,
    /revoke all on function public\\.admin_get_employee_provisioning_invite_link\\(uuid,uuid\\)\\s+from public, anon, authenticated, service_role;/,
  );
  assert.match(
    sql,
    /grant execute on function public\\.admin_get_employee_provisioning_invite_link\\(uuid,uuid\\) to service_role;/,
  );
});
