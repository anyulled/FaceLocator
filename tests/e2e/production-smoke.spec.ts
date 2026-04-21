import { expect, test } from "@playwright/test";

const PRODUCTION_EVENT_SLUG = "speaker-session-2026";

test.describe("Production smoke", () => {
  test("loads the hosted registration page", async ({ page }) => {
    await page.goto(`/events/${PRODUCTION_EVENT_SLUG}/register`);

    await expect(page).toHaveURL(new RegExp(`/events/${PRODUCTION_EVENT_SLUG}/register`));
    await expect(page.getByRole("heading", { name: /devbcn 2026/i })).toBeVisible();
    await expect(page.getByLabel(/full name/i)).toBeVisible();
    await expect(page.getByLabel(/email address/i)).toBeVisible();
    await expect(page.getByLabel(/selfie upload/i)).toBeVisible();
  });
});
