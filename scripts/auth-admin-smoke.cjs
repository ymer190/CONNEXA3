const { chromium } = require("playwright");
const { createHash, randomBytes, randomUUID } = require("node:crypto");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

function decodeClaims(token) {
  const payload = token.split(".")[1];
  if (!payload) throw new Error("Supabase returned an invalid access token.");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

async function provisionApprovedSession(token) {
  if (!supabaseUrl || !publishableKey || !serviceKey) {
    throw new Error("Supabase URL, publishable key and private CI fixture key are required.");
  }

  const claims = decodeClaims(token);
  if (!claims.sub || !claims.session_id) {
    throw new Error("Admin Auth token is missing sub/session_id claims.");
  }

  const deviceId = randomUUID();
  const deviceSecret = randomBytes(32).toString("base64url");
  const secretHash = createHash("sha256").update(deviceSecret).digest("hex");
  let deviceCreated = false;

  async function serviceRequest(path, options = {}) {
    const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
      ...options,
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Temporary admin device fixture failed (HTTP ${response.status}): ${detail.slice(0, 300)}`);
    }
  }

  try {
    await serviceRequest("authorized_devices", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        id: deviceId,
        user_id: claims.sub,
        secret_hash: `\\x${secretHash}`,
        label: "CI admin browser smoke",
        user_agent: "CONNEXA GitHub Actions",
        status: "approved",
        approved_at: new Date().toISOString(),
        approved_by: claims.sub,
      }),
    });
    deviceCreated = true;

    const registration = await fetch(`${supabaseUrl}/rest/v1/rpc/register_device_session`, {
      method: "POST",
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_device_id: deviceId,
        p_device_secret: deviceSecret,
        p_label: "CI admin browser smoke",
        p_user_agent: "CONNEXA GitHub Actions",
      }),
    });
    const result = await registration.json().catch(() => null);
    if (!registration.ok || result !== "approved") {
      throw new Error(`Admin browser session could not register its approved CI fixture (HTTP ${registration.status}).`);
    }
  } catch (error) {
    if (deviceCreated) {
      await serviceRequest(`device_sessions?session_id=eq.${encodeURIComponent(claims.session_id)}`, { method: "DELETE" }).catch(() => {});
      await serviceRequest(`authorized_devices?id=eq.${encodeURIComponent(deviceId)}`, { method: "DELETE" }).catch(() => {});
    }
    throw error;
  }

  console.log("PASS: admin browser session registered against a temporary approved CI device.");
  return async () => {
    await serviceRequest(`device_sessions?session_id=eq.${encodeURIComponent(claims.session_id)}`, { method: "DELETE" });
    await serviceRequest(`authorized_devices?id=eq.${encodeURIComponent(deviceId)}`, { method: "DELETE" });
    console.log("PASS: temporary admin browser device/session fixture removed.");
  };
}

async function main() {
  const email = process.env.AUTH_TEST_ADMIN_EMAIL;
  const password = process.env.AUTH_TEST_ADMIN_PASSWORD;
  const baseUrl = process.env.AUTH_TEST_BASE_URL || "http://127.0.0.1:3000";

  if (!email || !password) {
    throw new Error("AUTH_TEST_ADMIN_EMAIL and AUTH_TEST_ADMIN_PASSWORD are required.");
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  let cleanupDeviceSession;

  async function assertAdminPage(stage) {
    const currentUrl = page.url();
    const visibleText = await page.locator("body").innerText().catch(() => "");

    if (new URL(currentUrl).pathname !== "/admin") {
      throw new Error(
        `${stage}: expected /admin, but landed on ${currentUrl}. Visible page text: ${visibleText.slice(0, 500)}`,
      );
    }

    try {
      await page.getByRole("heading", { name: "Área administrativa" }).waitFor();
      await page.getByText("platform_admin", { exact: true }).waitFor();
    } catch {
      const updatedText = await page.locator("body").innerText().catch(() => "");
      throw new Error(
        `${stage}: /admin loaded without the expected platform_admin profile. Visible page text: ${updatedText.slice(0, 500)}`,
      );
    }
  }

  try {
    await page.goto(`${baseUrl}/login?next=%2Fadmin`);
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    const authResponsePromise = page.waitForResponse(
      (response) => response.url().includes("/auth/v1/token?grant_type=password") && response.request().method() === "POST",
      { timeout: 20000 },
    );
    await page.getByRole("button", { name: "Entrar" }).click();
    const authResponse = await authResponsePromise;
    const authPayload = await authResponse.json();
    if (!authPayload.access_token) {
      throw new Error("Admin sign-in response did not contain an access token.");
    }

    // #97 intentionally denies a newly authenticated device until it is approved.
    // Register a disposable, pre-approved fixture so this smoke tests the
    // administrator UI after authorization rather than bypassing device policy.
    cleanupDeviceSession = await provisionApprovedSession(authPayload.access_token);
    await page.goto(`${baseUrl}/admin`);

    try {
      await page.waitForURL((url) => url.pathname === "/admin", { timeout: 20000 });
    } catch {
      const currentUrl = page.url();
      const visibleText = await page.locator("body").innerText().catch(() => "");
      throw new Error(`Admin login did not reach /admin. Current URL: ${currentUrl}. Visible page text: ${visibleText.slice(0, 500)}`);
    }

    await assertAdminPage("Initial admin access");
    console.log("PASS: platform administrator can sign in and access /admin.");

    // Wait for the reload navigation to finish before asserting the protected page.
    // waitForURL("**/admin") alone can pass immediately against the pre-reload URL.
    await page.reload({ waitUntil: "networkidle" });
    await assertAdminPage("Admin access after refresh");
    console.log("PASS: administrator session persists and access remains allowed after refresh.");

    // Register the navigation waiter before clicking to avoid a client-router race.
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/login", { timeout: 20000 }),
      page.getByRole("button", { name: "Sair" }).click(),
    ]);
    console.log("PASS: administrator can sign out.");

    // Verify the protected route redirects a signed-out session to login.
    await page.goto(`${baseUrl}/admin`);
    await page.waitForURL((url) => url.pathname === "/login", { timeout: 20000 });
    await page.getByRole("heading", { name: "Bem-vindo de volta" }).waitFor();
    console.log("PASS: signed-out administrator is redirected away from /admin.");
  } finally {
    if (cleanupDeviceSession) {
      await cleanupDeviceSession().catch((error) => {
        console.error("Failed to clean temporary admin device/session fixture:", error.message);
        process.exitCode = 1;
      });
    }
    await browser.close();
  }
}

main().catch((error) => {
  console.error("Administrator authentication smoke test failed:", error.message);
  process.exit(1);
});
