import { describe, expect, it } from "vitest";
import { createInitialAppState, gameReducer } from "../../src/app/gameReducer";
import {
  getLegalSetupRoadEdgeIds,
  getLegalSetupSettlementVertexIds
} from "../../src/domain/rules/building";

describe("complete local-game setup interaction", () => {
  it("starts a new game in setup and exposes the current legal placement targets", () => {
    const state = gameReducer(createInitialAppState(), { type: "START_NEW_GAME" });

    expect(state.game.phase).toBe("setup");
    expect(state.game.setup?.stage).toBe("settlement");
    expect(getLegalSetupSettlementVertexIds(state.game, state.game.activePlayerId).length).toBeGreaterThan(0);

    const vertexId = getLegalSetupSettlementVertexIds(
      state.game,
      state.game.activePlayerId
    )[0];
    const withSettlement = gameReducer(state, {
      type: "PLACE_SETUP_SETTLEMENT",
      playerId: state.game.activePlayerId,
      vertexId
    });

    expect(withSettlement.game.setup?.stage).toBe("road");
    expect(
      getLegalSetupRoadEdgeIds(withSettlement.game, withSettlement.game.activePlayerId).length
    ).toBeGreaterThan(0);
  });

  it("completes every snake-order pair and enters the first normal turn", () => {
    let state = gameReducer(createInitialAppState(), { type: "START_NEW_GAME" });

    while (state.game.phase === "setup") {
      if (state.game.setup?.stage === "settlement") {
        const vertexId = getLegalSetupSettlementVertexIds(
          state.game,
          state.game.activePlayerId
        )[0];
        state = gameReducer(state, {
          type: "PLACE_SETUP_SETTLEMENT",
          playerId: state.game.activePlayerId,
          vertexId
        });
      } else {
        const edgeId = getLegalSetupRoadEdgeIds(state.game, state.game.activePlayerId)[0];
        state = gameReducer(state, {
          type: "PLACE_SETUP_ROAD",
          playerId: state.game.activePlayerId,
          edgeId
        });
      }
    }

    expect(state.game.activePlayerId).toBe("p1");
    expect(state.game.turnState.phase).toBe("awaitingRoll");
    expect(state.game.buildings).toHaveLength(8);
    expect(state.game.roads).toHaveLength(8);
  });

  it("restarts a completed game without a page reload", () => {
    const initial = createInitialAppState();
    const completed = {
      ...initial,
      game: { ...initial.game, phase: "gameOver" as const, winnerId: "p1" }
    };

    const restarted = gameReducer(completed, { type: "START_NEW_GAME" });

    expect(restarted.game.phase).toBe("setup");
    expect(restarted.game.winnerId).toBeUndefined();
    expect(restarted.game.log[0]?.message).toMatch(/setup|new game/i);
  });
});
