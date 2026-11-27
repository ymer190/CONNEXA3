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
    "has_provider_receipt boolean",
    "failure_code text",
  ]) {
    assert.ok(rpc.includes(field), `status RPC must expose ${field}`);
  }

  for (const sensitiveField of [
    "auth_user_id",
    "email_envelope",
    "invite_link_envelope",
    "email_provider_message_id",
  ]) {
    assert.ok(
      !rpc.includes(sensitiveField),
      `status RPC must not expose ${sensitiveField}`,
    );
  }

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
  assert.match(adapter, /has_provider_receipt/);
});
