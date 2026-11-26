const { chromium } = require("playwright");

async function main() {
  const email = process.env.AUTH_TEST_ADMIN_EMAIL;
  const password = process.env.AUTH_TEST_ADMIN_PASSWORD;
  const baseUrl = process.env.AUTH_TEST_BASE_URL || "http://127.0.0.1:3000";
  const deviceId = process.env.AUTH_TEST_ADMIN_DEVICE_ID;
  const deviceSecret = process.env.AUTH_TEST_ADMIN_DEVICE_SECRET;

  if (!email || !password) {
    throw new Error("AUTH_TEST_ADMIN_EMAIL and AUTH_TEST_ADMIN_PASSWORD are required.");
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  if (Boolean(deviceId) !== Boolean(deviceSecret)) {
    throw new Error("AUTH_TEST_ADMIN_DEVICE_ID and AUTH_TEST_ADMIN_DEVICE_SECRET must be configured together.");
  }
  if (deviceId) {
    const secure = baseUrl.startsWith("https://");
    await context.addCookies([
      { name: "connexa-device-id", value: deviceId, url: baseUrl, httpOnly: true, secure, sameSite: "Strict" },
      { name: "connexa-device-secret", value: deviceSecret, url: baseUrl, httpOnly: true, secure, sameSite: "Strict" },
    ]);
  }
  const page = await context.newPage();

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
    await page.getByRole("button", { name: "Entrar" }).click();

    if (!deviceId) {
      await page.waitForURL((url) => url.pathname === "/dispositivo-pendente", { timeout: 20000, waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: "Aguardando liberação da TI" }).waitFor();
      console.log("PASS: platform_admin with a new/unapproved browser is held at device authorization.");

      await page.reload({ waitUntil: "networkidle" });
      await page.waitForURL((url) => url.pathname === "/dispositivo-pendente", { timeout: 20000, waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: "Aguardando liberação da TI" }).waitFor();
      console.log("PASS: unapproved administrator device remains blocked after refresh.");
    } else {
      try {
        await page.waitForURL((url) => url.pathname === "/admin", { timeout: 20000, waitUntil: "domcontentloaded" });
      } catch {
        const currentUrl = page.url();
        const visibleText = await page.locator("body").innerText().catch(() => "");
        throw new Error(`Admin login did not reach /admin with the approved device fixture. Current URL: ${currentUrl}. Visible page text: ${visibleText.slice(0, 500)}`);
      }

      await assertAdminPage("Initial admin access");
      console.log("PASS: platform administrator with approved device can access /admin.");

      await page.reload({ waitUntil: "networkidle" });
      await assertAdminPage("Admin access after refresh");
      console.log("PASS: authorized administrator access persists after refresh.");
    }

    // Register the navigation waiter before clicking to avoid a client-router race.
    if (deviceId) {
      await Promise.all([
        page.waitForURL((url) => url.pathname === "/login", { timeout: 20000, waitUntil: "domcontentloaded" }),
        page.getByRole("button", { name: "Sair" }).click(),
      ]);
      console.log("PASS: administrator can sign out.");
    }

    // Verify the protected route redirects a signed-out session to login.
    await page.goto(`${baseUrl}/admin`);
    await page.waitForURL((url) => url.pathname === "/login", { timeout: 20000, waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Bem-vindo de volta" }).waitFor();
    console.log("PASS: signed-out administrator is redirected away from /admin.");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("Administrator authentication smoke test failed:", error.message);
  process.exit(1);
});

