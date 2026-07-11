import { describe, expect, expectTypeOf, it } from "vitest";
import { createInitialAppState } from "../../src/app/gameReducer";
import { DeterministicRandomSource } from "../../src/domain/match/random";
import type {
  DiceRoll,
  MatchExecutionContext,
  MatchState
} from "../../src/domain/match/types";

describe("match transition foundations", () => {
  it("keeps only synchronized gameplay fields in MatchState", () => {
    const appState = createInitialAppState();
    const lastDice: DiceRoll = { first: 3, second: 5, total: 8 };
    const matchState: MatchState = {
      game: appState.game,
      guild: appState.guild,
      lastDice,
      pendingPlayerTrade: appState.pendingPlayerTrade
    };

    expect(Object.keys(matchState).sort()).toEqual([
      "game",
      "guild",
      "lastDice",
      "pendingPlayerTrade"
    ]);
    expect(matchState).not.toHaveProperty("selectedDiceTotal");
    expect(matchState).not.toHaveProperty("selectedPlayerId");
    expect(matchState).not.toHaveProperty("notice");
    expectTypeOf(matchState).not.toHaveProperty("selectedDiceTotal");
    expectTypeOf(matchState).not.toHaveProperty("selectedPlayerId");
    expectTypeOf(matchState).not.toHaveProperty("notice");
  });

  it("accepts deterministic execution dependencies for log IDs, time, and dice", () => {
    let nextLogNumber = 0;
    const context: MatchExecutionContext = {
      random: new DeterministicRandomSource([2, 4]),
      nextLogId: () => `test-log-${++nextLogNumber}`,
      now: () => 1_700_000_000_000
    };

    expect(context.nextLogId()).toBe("test-log-1");
    expect(context.nextLogId()).toBe("test-log-2");
    expect(context.now()).toBe(1_700_000_000_000);
    expect([
      context.random.nextInt(6) + 1,
      context.random.nextInt(6) + 1
    ]).toEqual([3, 5]);
  });

  it("rejects invalid deterministic random values instead of changing their distribution", () => {
    expect(() => new DeterministicRandomSource([6]).nextInt(6)).toThrow(RangeError);
    expect(() => new DeterministicRandomSource([0]).nextInt(0)).toThrow(RangeError);
  });
});
