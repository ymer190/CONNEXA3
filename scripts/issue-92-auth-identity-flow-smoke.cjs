const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { createClient } = require("@supabase/supabase-js");

const url = process.env.SUPABASE_CI_URL;
const key = process.env.SUPABASE_CI_ADMIN_KEY;

if (!url || !key) {
  throw new Error("Dedicated Supabase CI URL and admin key are required.");
}

const parsedUrl = new URL(url);
if (
  parsedUrl.hostname.includes("dzsacdtolxrqgwlekzdg") ||
  parsedUrl.hostname.includes("uwrzrwwzkurjdhxituwq")
) {
  throw new Error("Refusing to run the Auth flow test against shared DEV or Production.");
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const operationId = randomUUID();
  const email = `issue92-auth-${randomUUID()}@example.invalid`;
  const identitiesToDelete = new Set();

  try {
    const { data: created, error: createError } =
      await supabase.auth.admin.createUser({
        email,
        email_confirm: false,
        app_metadata: {
          first_access_pending: true,
          employee_provisioning_operation_id: operationId,
        },
      });

    if (createError) throw new Error(`createUser failed: ${createError.message}`);
    assert.ok(created.user?.id, "createUser must return an Auth user ID");
    identitiesToDelete.add(created.user.id);

    const { data: generated, error: generateError } =
      await supabase.auth.admin.generateLink({ type: "invite", email });

    if (generated.user?.id) identitiesToDelete.add(generated.user.id);
    if (generateError) {
      throw new Error(`generateLink(invite) failed for the existing unconfirmed identity: ${generateError.message}`);
    }

    assert.equal(
      generated.user?.id,
      created.user.id,
      "generateLink(invite) must reuse the exact Auth identity created by createUser",
    );
    assert.equal(
      generated.user?.email_confirmed_at,
      null,
      "the invite identity must remain unconfirmed until the first-access flow is accepted",
    );
    assert.equal(
      generated.user?.app_metadata?.first_access_pending,
      true,
      "the first-access pending marker must survive invite link generation",
    );
    assert.equal(
      generated.user?.app_metadata?.employee_provisioning_operation_id,
      operationId,
      "the operation correlation marker must survive invite link generation",
    );
    assert.equal(
      typeof generated.properties?.action_link,
      "string",
      "Auth must return an invite action link",
    );

    process.stdout.write("PASS: createUser + generateLink(invite) reused one unconfirmed Auth identity; metadata remained intact.\n");
  } finally {
    const cleanupErrors = [];
    for (const userId of identitiesToDelete) {
      const { error } = await supabase.auth.admin.deleteUser(userId);
      if (error) cleanupErrors.push(error.message);
    }
    if (cleanupErrors.length) {
      throw new Error(`Synthetic Auth identity cleanup failed: ${cleanupErrors.join("; ")}`);
    }
  }
}

main().catch((error) => {
  process.stderr.write(`FAIL: ${error.message}\n`);
  process.exitCode = 1;
});
