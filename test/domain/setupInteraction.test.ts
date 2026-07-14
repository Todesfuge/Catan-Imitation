import { describe, expect, it } from "vitest";
import { createInitialAppState, gameReducer } from "../../src/app/gameReducer";
import { createLocalGameTableView } from "../../src/app/localGameState";
import { formatM1MapSeed } from "../../src/domain/mapSeed";
import { createSetupMatch } from "../../src/domain/match/createMatch";
import { DeterministicRandomSource } from "../../src/domain/match/random";
import {
  getLegalSetupRoadEdgeIds,
  getLegalSetupSettlementVertexIds
} from "../../src/domain/rules/building";

describe("complete local-game setup interaction", () => {
  it("leaves player and bank resources unchanged after the first setup settlement", () => {
    const state = gameReducer(createInitialAppState(), {
      type: "START_NEW_GAME",
      mode: "sameMap"
    });
    const playerId = state.game.activePlayerId;
    const playerResources = structuredClone(
      state.game.players.find((player) => player.id === playerId)?.resources
    );
    const bankResources = structuredClone(state.game.bank.resources);
    const vertexId = getLegalSetupSettlementVertexIds(state.game, playerId)[0];

    const settled = gameReducer(state, {
      type: "PLACE_SETUP_SETTLEMENT",
      playerId,
      vertexId
    });

    expect(settled.game.players.find((player) => player.id === playerId)?.resources).toEqual(
      playerResources
    );
    expect(settled.game.bank.resources).toEqual(bankResources);
  });

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

  it("grants second-settlement resources exactly once across later setup transitions and projection", () => {
    let state = gameReducer(createInitialAppState(), {
      type: "START_NEW_GAME",
      mode: "sameMap"
    });

    while (state.game.setup?.placementIndex !== state.game.players.length) {
      const playerId = state.game.activePlayerId;
      if (state.game.setup?.stage === "settlement") {
        state = gameReducer(state, {
          type: "PLACE_SETUP_SETTLEMENT",
          playerId,
          vertexId: getLegalSetupSettlementVertexIds(state.game, playerId)[0]
        });
      } else {
        state = gameReducer(state, {
          type: "PLACE_SETUP_ROAD",
          playerId,
          edgeId: getLegalSetupRoadEdgeIds(state.game, playerId)[0]
        });
      }
    }

    const awardedPlayerId = state.game.activePlayerId;
    const producingVertexId = getLegalSetupSettlementVertexIds(
      state.game,
      awardedPlayerId
    ).find((vertexId) =>
      state.game.board.some((hex) => hex.resource && hex.vertexIds.includes(vertexId))
    );
    expect(producingVertexId).toBeDefined();
    state = gameReducer(state, {
      type: "PLACE_SETUP_SETTLEMENT",
      playerId: awardedPlayerId,
      vertexId: producingVertexId ?? ""
    });
    const awardedResources = structuredClone(
      state.game.players.find((player) => player.id === awardedPlayerId)?.resources
    );
    expect(Object.values(awardedResources ?? {}).reduce((total, count) => total + count, 0)).toBeGreaterThan(0);

    state = gameReducer(state, {
      type: "PLACE_SETUP_ROAD",
      playerId: awardedPlayerId,
      edgeId: getLegalSetupRoadEdgeIds(state.game, awardedPlayerId)[0]
    });
    expect(state.game.players.find((player) => player.id === awardedPlayerId)?.resources).toEqual(
      awardedResources
    );

    const nextPlayerId = state.game.activePlayerId;
    state = gameReducer(state, {
      type: "PLACE_SETUP_SETTLEMENT",
      playerId: nextPlayerId,
      vertexId: getLegalSetupSettlementVertexIds(state.game, nextPlayerId)[0]
    });
    expect(state.game.players.find((player) => player.id === awardedPlayerId)?.resources).toEqual(
      awardedResources
    );

    const projected = createLocalGameTableView(state);
    expect(
      projected.controlledPlayers.find((player) => player.displayName === "Amias")?.resources
    ).toEqual(awardedResources);
    expect(state.game.players.find((player) => player.id === awardedPlayerId)?.resources).toEqual(
      awardedResources
    );

    while (state.game.phase === "setup") {
      const playerId = state.game.activePlayerId;
      if (state.game.setup?.stage === "settlement") {
        state = gameReducer(state, {
          type: "PLACE_SETUP_SETTLEMENT",
          playerId,
          vertexId: getLegalSetupSettlementVertexIds(state.game, playerId)[0]
        });
      } else {
        state = gameReducer(state, {
          type: "PLACE_SETUP_ROAD",
          playerId,
          edgeId: getLegalSetupRoadEdgeIds(state.game, playerId)[0]
        });
      }
    }

    expect(state.game.players.find((player) => player.id === awardedPlayerId)?.resources).toEqual(
      awardedResources
    );
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
