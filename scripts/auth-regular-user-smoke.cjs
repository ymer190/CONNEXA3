const { chromium } = require("playwright");
const { deleteDeviceFixture } = require("./issue97-isolated-device-fixture.cjs");

async function main() {
  const email = process.env.AUTH_TEST_USER_EMAIL;
  const password = process.env.AUTH_TEST_USER_PASSWORD;
  const baseUrl = process.env.AUTH_TEST_BASE_URL || "http://127.0.0.1:3000";
  const supabaseUrl = process.env.AUTH_TEST_SUPABASE_URL;
  const serviceRoleKey = process.env.AUTH_TEST_SUPABASE_SERVICE_ROLE_KEY;

  if (!email || !password) {
    throw new Error("AUTH_TEST_USER_EMAIL and AUTH_TEST_USER_PASSWORD are required.");
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("pageerror", (error) => console.error("Browser page error:", error.message));
  page.on("response", async (response) => {
    if (new URL(response.url()).pathname === "/api/device-sessions/register") {
      const body = await response.text().catch(() => "<unreadable>");
      console.log(`Device enrollment response: HTTP ${response.status()} ${body.slice(0, 300)}`);
    }
  });
  let deviceId;
  let deviceCookieWasAbsentBeforeTest = false;

  async function assertDenied(stage) {
    try {
      await page.waitForURL(
        (url) => ["/acesso-negado", "/dispositivo-pendente"].includes(url.pathname),
        { timeout: 20000, waitUntil: "domcontentloaded" },
      );
    } catch {
      const currentUrl = page.url();
      const visibleText = await page.locator("body").innerText().catch(() => "");
      throw new Error(
        `${stage}: expected a denied route, but remained at ${currentUrl}. Visible page text: ${visibleText.slice(0, 500)}`,
      );
    }
    const path = new URL(page.url()).pathname;
    if (path === "/dispositivo-pendente") {
      await page.getByRole("heading", { name: "Aguardando liberação da TI" }).waitFor();
    } else {
      await page.getByRole("heading", { name: "Acesso não autorizado" }).waitFor();
    }
    console.log(`PASS: ${stage}; regular user remains outside /admin (${path}).`);
  }

  try {
    // This isolated browser context must start without a device identity.
    // Cleanup is allowed only for the ID generated during this test run.
    const initialCookies = await context.cookies(baseUrl);
    deviceCookieWasAbsentBeforeTest = !initialCookies.some((cookie) => cookie.name === "connexa-device-id");
    if (!deviceCookieWasAbsentBeforeTest) {
      throw new Error("Refusing to run cleanup-capable smoke test with a pre-existing device cookie.");
    }

    await page.goto(`${baseUrl}/login?next=%2Fadmin`);
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.waitForTimeout(1500);
    console.log("Regular-user post-login URL:", page.url());
    const loginAlert = await page.locator('[role="alert"]').innerText().catch(() => "");
    if (loginAlert) console.log("Regular-user login alert:", loginAlert.slice(0, 300));

    await assertDenied("Authenticated regular user is denied access to /admin");

    await page.reload();
    await assertDenied("Authenticated session remains denied after refresh");

    const generatedCookie = (await context.cookies(baseUrl)).find((cookie) => cookie.name === "connexa-device-id");
    if (deviceCookieWasAbsentBeforeTest && generatedCookie?.value) {
      deviceId = generatedCookie.value;
    }
  } finally {
    try {
      // Never delete a device unless this fresh context demonstrably generated its ID.
      await deleteDeviceFixture({ baseUrl: supabaseUrl, serviceRoleKey, deviceId });
    } finally {
      await context.close();
      await browser.close();
    }
  }
}

main().catch((error) => {
  console.error("Authentication smoke test failed:", error.message);
  process.exit(1);
});
