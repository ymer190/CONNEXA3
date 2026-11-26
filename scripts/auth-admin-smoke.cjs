const { chromium } = require("playwright");
const { createApprovedDeviceFixture, deleteDeviceFixture } = require("./issue97-isolated-device-fixture.cjs");

async function main() {
  const email = process.env.AUTH_TEST_ADMIN_EMAIL;
  const password = process.env.AUTH_TEST_ADMIN_PASSWORD;
  const baseUrl = process.env.AUTH_TEST_BASE_URL || "http://127.0.0.1:3000";
  const supabaseUrl = process.env.AUTH_TEST_SUPABASE_URL;
  const apiKey = process.env.AUTH_TEST_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.AUTH_TEST_SUPABASE_SERVICE_ROLE_KEY;

  if (!email || !password) {
    throw new Error("AUTH_TEST_ADMIN_EMAIL and AUTH_TEST_ADMIN_PASSWORD are required.");
  }

  if (!supabaseUrl || !apiKey || !serviceRoleKey) throw new Error("Isolated Supabase credentials are required.");

  const auth = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const authBody = await auth.json().catch(() => ({}));
  if (!auth.ok || !authBody.user?.id) throw new Error(`Admin test sign-in failed with HTTP ${auth.status}.`);

  const fixture = await createApprovedDeviceFixture({ baseUrl: supabaseUrl, apiKey, serviceRoleKey, userId: authBody.user.id });
  const browser = await chromium.launch({ headless: true });
  let pendingDeviceId;

  async function newContext(device) {
    const context = await browser.newContext();
    if (device) {
      const secure = baseUrl.startsWith("https://");
      await context.addCookies([
        { name: "connexa-device-id", value: device.id, url: baseUrl, httpOnly: true, secure, sameSite: "Strict" },
        { name: "connexa-device-secret", value: device.secret, url: baseUrl, httpOnly: true, secure, sameSite: "Strict" },
      ]);
    }
    return context;
  }

  async function assertAdminPage(page, stage) {
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
    const context = await newContext(fixture);
    const page = await context.newPage();
    await page.goto(`${baseUrl}/login?next=%2Fadmin`);
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: "Entrar" }).click();

    {
      try {
        await page.waitForURL((url) => url.pathname === "/admin", { timeout: 20000, waitUntil: "domcontentloaded" });
      } catch {
        const currentUrl = page.url();
        const visibleText = await page.locator("body").innerText().catch(() => "");
        throw new Error(`Admin login did not reach /admin with the approved device fixture. Current URL: ${currentUrl}. Visible page text: ${visibleText.slice(0, 500)}`);
      }

      await assertAdminPage(page, "Initial admin access");
      console.log("PASS: platform administrator with approved device can access /admin.");

      await page.reload({ waitUntil: "networkidle" });
      await assertAdminPage(page, "Admin access after refresh");
      console.log("PASS: authorized administrator access persists after refresh.");
    }

    // Register the navigation waiter before clicking to avoid a client-router race.
    {
      await Promise.all([
        page.waitForURL((url) => url.pathname === "/login", { timeout: 20000, waitUntil: "domcontentloaded" }),
        page.getByRole("button", { name: "Sair" }).click(),
      ]);
      console.log("PASS: administrator can sign out.");
    }

    {
      // Verify the protected route redirects a signed-out session to login.
      await page.goto(`${baseUrl}/admin`);
      await page.waitForURL((url) => url.pathname === "/login", { timeout: 20000, waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: "Bem-vindo de volta" }).waitFor();
      console.log("PASS: signed-out administrator is redirected away from /admin.");
    }

    await context.close();

    const pendingContext = await newContext(null);
    const pendingPage = await pendingContext.newPage();
    await pendingPage.goto(`${baseUrl}/login?next=%2Fadmin`);
    await pendingPage.locator("#email").fill(email);
    await pendingPage.locator("#password").fill(password);
    await pendingPage.getByRole("button", { name: "Entrar" }).click();
    await pendingPage.waitForURL((url) => url.pathname === "/dispositivo-pendente", { timeout: 20000, waitUntil: "domcontentloaded" });
    await pendingPage.getByRole("heading", { name: "Aguardando liberação da TI" }).waitFor();
    console.log("PASS: platform_admin with a new/unapproved browser is held at device authorization.");
    await pendingPage.reload({ waitUntil: "networkidle" });
    await pendingPage.waitForURL((url) => url.pathname === "/dispositivo-pendente", { timeout: 20000, waitUntil: "domcontentloaded" });
    await pendingPage.getByRole("heading", { name: "Aguardando liberação da TI" }).waitFor();
    console.log("PASS: unapproved administrator device remains blocked after refresh.");
    pendingDeviceId = (await pendingContext.cookies(baseUrl)).find((cookie) => cookie.name === "connexa-device-id")?.value;
    await pendingContext.close();
  } finally {
    await fixture.cleanup();
    await deleteDeviceFixture({ baseUrl: supabaseUrl, serviceRoleKey, deviceId: pendingDeviceId });
    await browser.close();
  }
}

main().catch((error) => {
  console.error("Administrator authentication smoke test failed:", error.message);
  process.exit(1);
});
