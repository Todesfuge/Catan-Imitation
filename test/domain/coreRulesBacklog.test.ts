import { describe, expect, it } from "vitest";
import { gameReducer, createInitialAppState } from "../../src/app/gameReducer";
import { createSetupGame } from "../../src/domain/setup";
import { applyProduction } from "../../src/domain/rules/production";
import {
  buildRoad,
  buildSettlement,
  placeSetupRoad,
  placeSetupSettlement
} from "../../src/domain/rules/building";
import type { GameState, PlayerId, ResourceMap } from "../../src/domain/types";

function withPlayerResources(game: GameState, playerId: string, resources: Partial<ResourceMap>) {
  return {
    ...game,
    players: game.players.map((player) =>
      player.id === playerId
        ? {
            ...player,
            resources: { ...player.resources, ...resources }
          }
        : player
    )
  };
}

function placeSetupPairOnHex(game: GameState, playerId: PlayerId, hexId: string): GameState {
  const hex = game.board.find((candidate) => candidate.id === hexId);
  if (!hex) {
    throw new Error(`Unknown test hex: ${hexId}`);
  }

  for (const vertexId of hex.vertexIds) {
    try {
      const settlementGame = placeSetupSettlement(game, playerId, vertexId);
      const edge = settlementGame.edges.find(
        (candidate) =>
          candidate.vertexIds.includes(vertexId) &&
          !settlementGame.roads.some((road) => road.edgeId === candidate.id)
      );
      if (!edge) {
        continue;
      }
      return placeSetupRoad(settlementGame, playerId, edge.id);
    } catch {
      continue;
    }
  }

  throw new Error(`No legal setup pair found for ${playerId} on ${hexId}`);
}

describe("post-MVP core Catan rules", () => {
  it("runs setup in settlement-road pairs using snake player order before normal play", () => {
    let game = createSetupGame();

    expect(game.phase).toBe("setup");
    expect(game.activePlayerId).toBe("p1");

    const forest = game.board.find((hex) => hex.id === "forest-4");
    const firstVertex = forest?.vertexIds[0] ?? "";
    game = placeSetupSettlement(game, "p1", firstVertex);
    expect(game.setup?.stage).toBe("road");
    expect(game.activePlayerId).toBe("p1");

    const firstEdge = game.edges.find((edge) => edge.vertexIds.includes(firstVertex));
    game = placeSetupRoad(game, "p1", firstEdge?.id ?? "");
    expect(game.setup?.stage).toBe("settlement");
    expect(game.activePlayerId).toBe("p2");

    for (const [playerId, hexId] of [
      ["p2", "mountain-8"],
      ["p3", "pasture-5"],
      ["p4", "field-11-a"],
      ["p4", "field-3"],
      ["p3", "mountain-10"],
      ["p2", "pasture-2"],
      ["p1", "forest-12"]
    ] as const) {
      game = placeSetupPairOnHex(game, playerId, hexId);
    }

    expect(game.phase).toBe("playing");
    expect(game.setup).toBeUndefined();
    expect(game.activePlayerId).toBe("p1");
  });

  it("blocks normal dice rolls during setup", () => {
    const state = {
      ...createInitialAppState(),
      game: createSetupGame()
    };

    expect(() =>
      gameReducer(state, { type: "ROLL_DICE", playerId: "p1", dice: [3, 4] })
    ).toThrow(/setup/i);
  });

  it("rejects occupied and adjacent settlement vertices", () => {
    const game = withPlayerResources(createSetupGame(), "p1", {
      wood: 4,
      brick: 4,
      wool: 4,
      grain: 4
    });
    const fundedGame = withPlayerResources(game, "p2", {
      wood: 4,
      brick: 4,
      wool: 4,
      grain: 4
    });
    const forest = fundedGame.board.find((hex) => hex.id === "forest-4");
    const settlementVertexId = forest?.vertexIds[0] ?? "";
    const settlementRoad = fundedGame.edges.find((edge) => edge.vertexIds.includes(settlementVertexId));
    const adjacentVertexId =
      fundedGame.edges.find((edge) => edge.vertexIds.includes(settlementVertexId))?.vertexIds.find(
        (vertexId) => vertexId !== settlementVertexId
      ) ?? "";
    const withSettlement = buildSettlement(
      {
        ...fundedGame,
        phase: "playing",
        setup: undefined,
        roads: [
          {
            id: "p1-settlement-seed-road",
            ownerId: "p1",
            edgeId: settlementRoad?.id ?? ""
          }
        ]
      },
      "p1",
      settlementVertexId
    );

    expect(() => buildSettlement(withSettlement, "p2", settlementVertexId)).toThrow(/occupied/i);
    expect(() => buildSettlement(withSettlement, "p2", adjacentVertexId)).toThrow(/distance/i);
    expect(() => buildSettlement(withSettlement, "p2", "not-a-board-vertex")).toThrow(/board vertex/i);
  });

  it("requires roads to use valid edges and connect to owned pieces", () => {
    const game = withPlayerResources(createSetupGame(), "p1", {
      wood: 4,
      brick: 4,
      wool: 4,
      grain: 4
    });
    const settlementVertexId = "forest-4-v0";
    const seedEdge = game.edges.find(
      (edge) => edge.vertexIds.includes(settlementVertexId) && edge.id !== "forest-4-e0"
    );
    const playingGame = buildSettlement(
      {
        ...game,
        phase: "playing",
        setup: undefined,
        roads: [
          {
            id: "p1-road-seed",
            ownerId: "p1",
            edgeId: seedEdge?.id ?? ""
          }
        ]
      },
      "p1",
      settlementVertexId
    );

    expect(() => buildRoad(playingGame, "p1", "desert-e3")).toThrow(/connect/i);

    const withRoad = buildRoad(playingGame, "p1", "forest-4-e0");
    expect(withRoad.roads.some((road) => road.edgeId === "forest-4-e0")).toBe(true);
    expect(() => buildRoad(withRoad, "p2", "forest-4-e0")).toThrow(/occupied/i);
  });

  it("updates bank resources during production and caps payout when the bank is short", () => {
    const game = {
      ...createInitialAppState().game,
      bank: { resources: { wood: 19, brick: 19, wool: 1, grain: 19, ore: 19 } }
    };

    const result = applyProduction(game, 8);
    const p1 = result.game.players.find((player) => player.id === "p1");
    const p2 = result.game.players.find((player) => player.id === "p2");

    expect(p1?.resources.wool).toBe(1);
    expect(p2?.resources.ore).toBe(1);
    expect(result.game.bank.resources.wool).toBe(0);
    expect(result.game.bank.resources.ore).toBe(18);
  });

  it("enters game-over state when the active player reaches the target score", () => {
    const state = {
      ...createInitialAppState(),
      game: {
        ...createInitialAppState().game,
        targetScore: 2
      }
    };

    const next = gameReducer(state, { type: "ROLL_DICE", playerId: "p1", dice: [4, 4] });

    expect(next.game.phase).toBe("gameOver");
    expect(next.game.winnerId).toBe("p1");
    expect(() => gameReducer(next, { type: "END_TURN", playerId: "p1" })).toThrow(/over/i);
  });
});
