import { describe, expect, it } from "vitest";
import { createInitialAppState, gameReducer } from "../../src/app/gameReducer";
import { formatM1MapSeed } from "../../src/domain/mapSeed";
import { createSetupMatch } from "../../src/domain/match/createMatch";
import { DeterministicRandomSource } from "../../src/domain/match/random";
import {
  getLegalSetupRoadEdgeIds,
  getLegalSetupSettlementVertexIds
} from "../../src/domain/rules/building";

describe("complete local-game setup interaction", () => {
  it("completes a three-player setup using the generated snake order", () => {
    const mapSeed = formatM1MapSeed(0x0123_4567, 0x89ab_cdef);
    const match = createSetupMatch(
      ["One", "Two", "Three"].map((nickname) => ({ nickname })),
      { kind: "seed", seed: mapSeed },
      {
        random: new DeterministicRandomSource(Array.from({ length: 24 }, () => 0)),
        nextMapSeed: () => mapSeed,
        nextLogId: () => "unused",
        now: () => 0
      }
    );
    let game = match.game;

    while (game.phase === "setup") {
      const playerId = game.activePlayerId;
      if (game.setup?.stage === "settlement") {
        game = gameReducer(
          { ...match, game, selectedDiceTotal: 8, selectedPlayerId: playerId, notice: null },
          {
            type: "PLACE_SETUP_SETTLEMENT",
            playerId,
            vertexId: getLegalSetupSettlementVertexIds(game, playerId)[0]
          }
        ).game;
      } else {
        game = gameReducer(
          { ...match, game, selectedDiceTotal: 8, selectedPlayerId: playerId, notice: null },
          {
            type: "PLACE_SETUP_ROAD",
            playerId,
            edgeId: getLegalSetupRoadEdgeIds(game, playerId)[0]
          }
        ).game;
      }
    }

    expect(game.activePlayerId).toBe("p1");
    expect(game.buildings).toHaveLength(6);
    expect(game.roads).toHaveLength(6);
  });

  it("starts a new game in setup and exposes the current legal placement targets", () => {
    const state = gameReducer(createInitialAppState(), {
      type: "START_NEW_GAME",
      mode: "sameMap"
    });

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
    let state = gameReducer(createInitialAppState(), {
      type: "START_NEW_GAME",
      mode: "sameMap"
    });

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
    expect(Object.hasOwn(state.game, "setup")).toBe(false);
  });

  it("restarts a completed game without a page reload", () => {
    const initial = createInitialAppState();
    const completed = {
      ...initial,
      game: { ...initial.game, phase: "gameOver" as const, winnerId: "p1" }
    };

    const restarted = gameReducer(completed, {
      type: "START_NEW_GAME",
      mode: "sameMap"
    });

    expect(restarted.game.phase).toBe("setup");
    expect(restarted.game.winnerId).toBeUndefined();
    expect(restarted.game.log[0]?.message).toMatch(/setup|new game/i);
  });
});
