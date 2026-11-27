import assert from "node:assert/strict";
import test from "node:test";
import {
  createEmployeeProvisioningDatabase,
  type EmployeeProvisioningRpcClient,
} from "./employee-provisioning-database.ts";

test("reads reconciliation status without decrypting stored email or invite-link envelopes", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client: EmployeeProvisioningRpcClient = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      return {
        data: [{
          operation_id: "550e8400-e29b-41d4-a716-446655440000",
          status: "manual_reconciliation_required",
          phase: "manual_reconciliation_required",
          email_envelope: "v1.encrypted-email-envelope",
          invite_link_envelope: "v1.encrypted-invite-envelope",
          email_provider_message_id: null,
          failure_code: "invite_email_delivery_outcome_unknown",
        }],
        error: null,
      };
    },
  };

  const database = createEmployeeProvisioningDatabase(client);
  const result = await database.getOperationStatusForReconciliation(
    "550e8400-e29b-41d4-a716-446655440000",
  );

  assert.deepEqual(result, {
    operationId: "550e8400-e29b-41d4-a716-446655440000",
    status: "manual_reconciliation_required",
    phase: "manual_reconciliation_required",
    hasInviteLink: true,
    hasProviderReceipt: false,
    failureCode: "invite_email_delivery_outcome_unknown",
  });
  assert.deepEqual(calls, [{
    name: "admin_get_employee_provisioning_operation",
    args: { p_operation_id: "550e8400-e29b-41d4-a716-446655440000" },
  }]);
});

test("returns null for an operation that is not visible to the requesting administrator", async () => {
  const client: EmployeeProvisioningRpcClient = {
    rpc: async () => ({ data: [], error: null }),
  };
  const database = createEmployeeProvisioningDatabase(client);
  assert.equal(
    await database.getOperationStatusForReconciliation(
      "550e8400-e29b-41d4-a716-446655440000",
    ),
    null,
  );
});
