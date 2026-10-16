import type { Page } from "@playwright/test";

export async function openTrading(page: Page, tab: "player" | "maritime" | "commerce" = "player") {
  if (await page.getByRole("dialog", { name: /^(Trading|交易)$/ }).count() === 0) {
    await page.getByRole("button", { name: /^(Open trading|打开交易)$/ }).click();
  }
  await page.locator(`#trade-tab-${tab}`).click();
}

export async function closeTrading(page: Page) {
  const dialog = page.getByRole("dialog", { name: /^(Trading|交易)$/ });
  if (await dialog.count()) await dialog.locator("[data-dialog-close]").click();
}
