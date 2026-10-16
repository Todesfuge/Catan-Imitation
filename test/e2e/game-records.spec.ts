import { expect, test } from "@playwright/test";

test("records open on demand, count visible events, and keep statistics usable", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Play Local Game" }).click();
  const opener = page.getByRole("button", { name: "Open records and statistics" });

  await expect(page.getByRole("log")).toHaveCount(0);
  await expect(page.locator(".stats-panel, .activity-shell")).toHaveCount(0);
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Records & Statistics" });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("button", { name: "Close utility panel" })).toBeFocused();
  await expect(page.getByRole("log").locator("p")).toHaveCount(1);
  await expect(dialog.locator(".log-count")).toHaveText("Entries: 1");

  const logTab = page.getByRole("tab", { name: "Game Log", exact: true });
  const statsTab = page.getByRole("tab", { name: "Yield Statistics", exact: true });
  await logTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(statsTab).toBeFocused();
  await expect(statsTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("log")).toHaveCount(0);
  await page.getByLabel("Statistics player", { exact: true }).selectOption("p2");
  await page.getByRole("button", { name: "dice", exact: true }).click();
  await page.getByLabel("Statistics dice total", { exact: true }).selectOption("8");
  await expect(page.getByLabel("Income by player for selected dice total").locator("p")).toHaveCount(4);
  await page.getByRole("button", { name: "matrix", exact: true }).click();
  await expect(dialog.locator(".matrix tbody tr")).toHaveCount(4);

  await statsTab.focus();
  await page.keyboard.press("Home");
  await expect(logTab).toBeFocused();
  await expect(page.getByRole("log")).toBeVisible();
  await page.keyboard.press("End");
  await expect(statsTab).toBeFocused();
  await page.getByRole("button", { name: "player", exact: true }).click();
  await expect(page.getByLabel("Statistics player", { exact: true })).toHaveValue("p2");
  await page.getByRole("button", { name: "dice", exact: true }).click();
  await expect(page.getByLabel("Statistics dice total", { exact: true })).toHaveValue("8");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(opener).toBeFocused();

  for (let placement = 0; placement < 8; placement += 1) {
    await page.locator('[data-board-action-target="setupSettlement"]').first().press("Enter");
    await page.locator('[data-board-action-target="setupRoad"]').first().press("Enter");
  }
  await page.getByRole("button", { name: "Roll Dice" }).click();
  await opener.click();
  await expect(logTab).toHaveAttribute("aria-selected", "true");
  const count = await page.getByRole("log").locator("p").count();
  expect(count).toBeGreaterThan(1);
  await expect(dialog.locator(".log-count")).toHaveText(`Entries: ${count}`);
  await page.getByRole("button", { name: "Close utility panel" }).click();
  await expect(opener).toBeFocused();
});
