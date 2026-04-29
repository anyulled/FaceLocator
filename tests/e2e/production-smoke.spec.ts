import { expect, test } from "@playwright/test";

test.describe("Production smoke", () => {
  test("loads the hosted registration page", async ({ page }) => {
    await page.goto("/");

    const startFreeLink = page.getByRole("link", { name: /start free/i });
    await expect(startFreeLink).toBeVisible();
    const registrationUrl = await startFreeLink.getAttribute("href");

    expect(registrationUrl).toMatch(/\/events\/[^/]+\/register$/);
    await page.goto(registrationUrl ?? "/");

    await expect(page).toHaveURL(/\/events\/[^/]+\/register/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByLabel(/full name/i)).toBeVisible();
    await expect(page.getByLabel(/email address/i)).toBeVisible();
    await expect(page.getByLabel("Selfie upload dropzone", { exact: true })).toBeVisible();
  });
});
