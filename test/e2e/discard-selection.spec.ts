import { expect, test, type Page } from "@playwright/test";
import { createUiState, localMatchSeats } from "../../src/app/localGameState";
import { getActionAvailabilityFacts } from "../../src/app/actionAvailability";
import { applyMatchCommand } from "../../src/domain/match/applyMatchCommand";
import { createSetupMatch } from "../../src/domain/match/createMatch";
import { parseMapSeed } from "../../src/domain/mapSeed";
import { getDiceIncome } from "../../src/domain/stats/income";
import { resources, type ResourceMap } from "../../src/domain/types";

const total = (cards: ResourceMap) => resources.reduce((sum, resource) => sum + cards[resource], 0);

async function roll(page: Page, diceTotal: number) {
  await page.evaluate((sum) => {
    const first = Math.max(1, sum - 6);
    const values = [(first - 0.5) / 6, (sum - first - 0.5) / 6];
    let index = 0;
    Math.random = () => values[index++ % 2];
  }, diceTotal);
  await page.locator('[data-action="roll-dice"]').click();
}

test("discard steppers show inventory, enforce limits and fit small screens", async ({ page }) => {
  const seed = parseMapSeed("M1-1234567890ABCDEF");
  let dice = [0, 0];
  let randomIndex = 0;
  const context = {
    random: { nextInt: (maximum: number) => dice[randomIndex++ % 2] % maximum },
    nextMapSeed: () => seed,
    nextLogId: () => crypto.randomUUID(),
    now: () => 0
  };
  let match = createSetupMatch(localMatchSeats, { kind: "seed", seed }, context);
  await page.addInitScript(() => {
    const original = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = ((array: ArrayBufferView) => {
      if (array instanceof Uint32Array && array.length === 2) {
        array[0] = 0x12345678;
        array[1] = 0x90abcdef;
        return array;
      }
      return original(array);
    }) as typeof crypto.getRandomValues;
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Play Local Game" }).click();
  for (let placement = 0; placement < 8; placement += 1) {
    for (const kind of ["settlement", "road"] as const) {
      const playerId = match.game.activePlayerId;
      const facts = getActionAvailabilityFacts({ ...match, ...createUiState(playerId) }, playerId);
      const target = facts.setup[kind].targets[0];
      expect(target).toBeTruthy();
      await page.locator(`[data-board-action-target="setup${kind === "road" ? "Road" : "Settlement"}"]`).first().press("Enter");
      match = applyMatchCommand(match, kind === "road"
        ? { type: "PLACE_SETUP_ROAD", playerId, edgeId: target }
        : { type: "PLACE_SETUP_SETTLEMENT", playerId, vertexId: target }, context);
    }
  }
  // Accumulate real production, then trigger seven without injecting application state.
  for (let turn = 0; Math.max(...match.game.players.map(player => total(player.resources))) < 10; turn += 1) {
    expect(turn).toBeLessThan(24);
    const income = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12]
      .map(diceTotal => getDiceIncome(match.game, diceTotal))
      .sort((a, b) => Math.max(...Object.values(b.players).map(total)) - Math.max(...Object.values(a.players).map(total)))[0];
    dice = [Math.max(1, income.diceTotal - 6) - 1, Math.min(6, income.diceTotal - 1) - 1];
    randomIndex = 0;
    await roll(page, income.diceTotal);
    match = applyMatchCommand(match, { type: "ROLL_DICE", playerId: match.game.activePlayerId }, context);
    await page.locator('[data-action="end-turn"]').click();
    match = applyMatchCommand(match, { type: "END_TURN", playerId: match.game.activePlayerId }, context);
  }
  dice = [0, 5];
  randomIndex = 0;
  await roll(page, 7);
  match = applyMatchCommand(match, { type: "ROLL_DICE", playerId: match.game.activePlayerId }, context);
  const pending = match.game.players.filter(player => match.game.turnState.pendingDiscards[player.id] !== undefined);
  expect(pending.length).toBeGreaterThan(0);
  const player = pending[0];
  const required = match.game.turnState.pendingDiscards[player.id]!;
  const panel = page.locator('[data-turn-flow="discard"]');
  const submit = panel.getByRole("button", { name: "Submit Discard" });
  await expect(panel.locator("strong")).toHaveText(`${player.name} must discard ${required}`);
  await expect(submit).toBeDisabled();
  for (const resource of resources) {
    const row = panel.locator(`[data-discard-resource="${resource}"]`);
    const input = row.getByRole("spinbutton");
    await expect(row.locator(".discard-owned")).toHaveText(`Owned: ${player.resources[resource]}`);
    await expect(row.getByRole("button").first()).toBeDisabled();
    await input.fill("999");
    await expect(input).toHaveValue(String(Math.min(required, player.resources[resource])));
    await expect(row.getByRole("button").last()).toBeDisabled();
    await input.fill("-2");
    await expect(input).toHaveValue("0");
    if (player.resources[resource] > 0) {
      await row.getByRole("button").last().click();
      await expect(input).toHaveValue("1");
      await row.getByRole("button").first().click();
      await input.fill("1.9");
      await expect(input).toHaveValue("1");
      await input.fill("0");
    }
  }
  for (const viewport of [{ width: 1280, height: 720 }, { width: 412, height: 915 },
    { width: 320, height: 640 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await expect(submit).toBeInViewport();
    const bounds = await panel.boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    const controls = await panel.locator(".discard-stepper button, .discard-stepper input").evaluateAll(elements =>
      elements.map(element => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height })));
    expect(controls.every(box => box.width >= 44 && box.height >= 44)).toBe(true);
    expect(await panel.locator(".turn-flow-resources").evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize({ width: 412, height: 915 });
  let remaining = required;
  for (const resource of resources) {
    const amount = Math.min(remaining, player.resources[resource]);
    await panel.locator(`[data-discard-resource="${resource}"] input`).fill(String(amount));
    remaining -= amount;
  }
  expect(remaining).toBe(0);
  await expect(submit).toBeEnabled();
  for (const button of await panel.locator(".discard-stepper button:last-child").all()) await expect(button).toBeDisabled();
  const selected = resources.find(resource => Number(player.resources[resource]) > 0)!;
  const selectedRow = panel.locator(`[data-discard-resource="${selected}"]`);
  await selectedRow.getByRole("button").first().click();
  await expect(submit).toBeDisabled();
  // Typing into another resource cannot exceed the total remaining allowance.
  const alternative = resources.find(resource => resource !== selected && player.resources[resource] > 0);
  const refill = panel.locator(`[data-discard-resource="${alternative ?? selected}"] input`);
  const before = Number(await refill.inputValue());
  await refill.fill("999");
  await expect(refill).toHaveValue(String(before + 1));
  await expect(submit).toBeEnabled();
  await submit.click();
  if (pending.length > 1) {
    await expect(panel.locator("strong")).toContainText(pending[1].name);
    for (const input of await panel.getByRole("spinbutton").all()) await expect(input).toHaveValue("0");
    await expect(submit).toBeDisabled();
  } else {
    await expect(panel).toHaveCount(0);
  }
});
