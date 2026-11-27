const { createHash, randomBytes, randomUUID } = require("node:crypto");

async function createApprovedDeviceFixture({ baseUrl, apiKey, serviceRoleKey, userId }) {
  if (!baseUrl || !apiKey || !serviceRoleKey || !userId) {
    throw new Error("An isolated Supabase API, service-role key, and Auth user ID are required for the device fixture.");
  }

  const id = randomUUID();
  const secret = randomBytes(32).toString("base64url");
  const secretHash = `\\x${createHash("sha256").update(secret).digest("hex")}`;
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/rest/v1/authorized_devices`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      id,
      user_id: userId,
      secret_hash: secretHash,
      label: "Disposable isolated SQA fixture",
      user_agent: "GitHub Actions isolated SQA",
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: null,
    }),
    cache: "no-store",
  });
  if (response.status !== 201 && response.status !== 204) {
    throw new Error(`Could not create the approved test-device fixture (HTTP ${response.status}).`);
  }

  return {
    id,
    secret,
    async cleanup() {
      const result = await fetch(
        `${baseUrl.replace(/\/$/, "")}/rest/v1/authorized_devices?id=eq.${encodeURIComponent(id)}`,
        {
          method: "DELETE",
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          cache: "no-store",
        },
      );
      if (!result.ok) throw new Error(`Could not remove the disposable test-device fixture (HTTP ${result.status}).`);
    },
  };
}

async function deleteDeviceFixture({ baseUrl, serviceRoleKey, deviceId }) {
  if (!baseUrl || !serviceRoleKey || !deviceId) return;
  const response = await fetch(
    `${baseUrl.replace(/\/$/, "")}/rest/v1/authorized_devices?id=eq.${encodeURIComponent(deviceId)}`,
    {
      method: "DELETE",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      cache: "no-store",
    },
  );
  if (!response.ok) throw new Error(`Could not remove the disposable test-device fixture (HTTP ${response.status}).`);
}

module.exports = { createApprovedDeviceFixture, deleteDeviceFixture };
