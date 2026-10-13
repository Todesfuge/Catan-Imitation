import { describe, expect, it } from "vitest";
import { MAX_GAME_LOG_ENTRIES } from "../../src/domain/gameLog";
import { applyMatchCommand } from "../../src/domain/match/applyMatchCommand";
import type { MatchState } from "../../src/domain/match/types";
import { emptyResources } from "../../src/domain/types";
import { createScenarioAppState } from "../fixtures/createScenarioGame";

describe("bounded match history", () => {
  it("retains the newest events after repeated legal player-trade commands", () => {
    const initial = createScenarioAppState();
    let state: MatchState = {
      ...initial,
      game: {
        ...initial.game,
        turnState: { phase: "action" as const, pendingDiscards: {} },
        players: initial.game.players.map((player) => player.id === "p1"
          ? { ...player, resources: { ...emptyResources(), wood: 1 } } : player)
      }
    };
    let sequence = 0;
    const context = {
      random: { nextInt: () => 0 }, nextMapSeed: () => initial.game.mapSeed,
      nextLogId: () => `entry-${++sequence}`, now: () => 1
    };
    for (let index = 0; index < 250; index++) {
      state = applyMatchCommand(state, {
        type: "PUBLISH_PLAYER_TRADE", playerId: "p1",
        offered: { ...emptyResources(), wood: 1 }, requested: { ...emptyResources(), grain: 1 }
      }, context);
      state = applyMatchCommand(state, { type: "CANCEL_PLAYER_TRADE", playerId: "p1" }, context);
    }
    expect(state.game.log).toHaveLength(MAX_GAME_LOG_ENTRIES);
    expect(state.game.log[0].id).toBe("entry-500");
    expect(state.game.log.at(-1)?.id).toBe("entry-301");
    expect(state.game.players.find((player) => player.id === "p1")?.resources.wood).toBe(1);
    expect(state.pendingPlayerTrade).toBeUndefined();
  });
});
