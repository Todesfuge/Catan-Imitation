import { describe, expect, it } from "vitest";
import { createDemoGame } from "../../src/domain/setup";
import {
  getDiceIncome,
  getExpectedIncomeMatrix,
  getPlayerIncome
} from "../../src/domain/stats/income";

describe("income statistics", () => {
  it("reports a player's resource gain and probability for each dice total", () => {
    const game = createDemoGame();

    const rows = getPlayerIncome(game, "p1");
    const eight = rows.find((row) => row.diceTotal === 8);

    expect(eight).toMatchObject({
      diceTotal: 8,
      probability: 5 / 36,
      resources: { wool: 2 }
    });
  });

  it("reports all player gains for a selected dice total", () => {
    const game = createDemoGame();

    const income = getDiceIncome(game, 8);

    expect(income.players).toMatchObject({
      p1: { wool: 2 },
      p2: { ore: 1 }
    });
  });

  it("builds expected income totals per player and resource", () => {
    const game = createDemoGame();

    const matrix = getExpectedIncomeMatrix(game);

    expect(matrix.totals.p1.wool).toBeCloseTo(10 / 36);
    expect(matrix.totals.p2.ore).toBeCloseTo(5 / 36);
  });
});

