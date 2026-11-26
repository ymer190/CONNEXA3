const { chromium } = require("playwright");

async function main() {
  const email = process.env.AUTH_TEST_USER_EMAIL;
  const password = process.env.AUTH_TEST_USER_PASSWORD;
  const baseUrl = process.env.AUTH_TEST_BASE_URL || "http://127.0.0.1:3000";

  if (!email || !password) {
    throw new Error("AUTH_TEST_USER_EMAIL and AUTH_TEST_USER_PASSWORD are required.");
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

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
    await page.goto(`${baseUrl}/login?next=%2Fadmin`);
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: "Entrar" }).click();

    await assertDenied("Authenticated regular user is denied access to /admin");

    await page.reload();
    await assertDenied("Authenticated session remains denied after refresh");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("Authentication smoke test failed:", error.message);
  process.exit(1);
});

