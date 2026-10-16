import { expect, test } from "@playwright/test";

test("all trading opens in one dialog with keyboard tabs and returns focus on close", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Play Local Game" }).click();
  const opener = page.getByRole("button", { name: "Open trading", exact: true });
  await expect(page.locator(".trade-hub-panel, .maritime-action-group, .bottom-dock")).toHaveCount(0);
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Trading", exact: true });
  await expect(page.getByRole("button", { name: "Close utility panel" })).toBeFocused();
  await expect(dialog.getByRole("tab")).toHaveCount(3);
  const player = dialog.getByRole("tab", { name: "Player Trade", exact: true });
  const maritime = dialog.getByRole("tab", { name: "Maritime Trade", exact: true });
  const commerce = dialog.getByRole("tab", { name: "Commerce Guild", exact: true });
  await player.focus();
  await page.keyboard.press("ArrowRight");
  await expect(maritime).toBeFocused();
  await expect(maritime).toHaveAttribute("aria-selected", "true");
  await expect(dialog.getByLabel("Maritime give resource")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Maritime", exact: true })).toBeDisabled();
  await page.keyboard.press("ArrowRight");
  await expect(commerce).toBeFocused();
  await expect(dialog.getByLabel("Token recipient")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Start Gathering" })).toBeDisabled();
  await page.keyboard.press("ArrowRight");
  await expect(player).toBeFocused();
  await expect(dialog.getByLabel("Offer Wood")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Publish Public Offer" })).toBeDisabled();
  await page.keyboard.press("End");
  await expect(commerce).toBeFocused();
  await page.keyboard.press("Home");
  await expect(player).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(opener).toBeFocused();

  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByLabel("Language", { exact: true }).selectOption("zh-CN");
  await page.locator("[data-dialog-close]").click();
  await page.getByRole("button", { name: "打开交易", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "交易", exact: true })).toBeVisible();
  for (const name of ["玩家交易", "海上交易", "商业公会"]) {
    await expect(page.getByRole("tab", { name, exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "关闭工具面板" }).click();
  await expect(page.getByRole("button", { name: "打开交易", exact: true })).toBeFocused();
});
