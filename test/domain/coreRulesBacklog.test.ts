import { describe, expect, it } from "vitest";
import {
  createInitialAppState
} from "../../src/app/gameReducer";
import { executeMatchCommandForTest as gameReducer } from "./matchCommandTestUtils";
import { createScenarioAppState } from "../fixtures/createScenarioGame";
import { createSetupGame } from "../../src/domain/setup";
import { applyProduction } from "../../src/domain/rules/production";
import {
  buildRoad,
  buildSettlement,
  placeSetupRoad,
  placeSetupSettlement
} from "../../src/domain/rules/building";
import {
  emptyResources,
  type GameState,
  type PlayerId,
  type Resource,
  type ResourceMap,
  type VertexId
} from "../../src/domain/types";

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

function asSecondSetupPlacement(game: GameState, playerId: PlayerId): GameState {
  if (!game.setup) {
    throw new Error("Expected a setup game.");
  }
  const placementIndex = game.setup.order.lastIndexOf(playerId);
  return {
    ...game,
    activePlayerId: playerId,
    setup: {
      order: game.setup.order,
      placementIndex,
      stage: "settlement"
    }
  };
}

function adjacentResources(game: GameState, vertexId: VertexId): Resource[] {
  return game.board.flatMap((hex) =>
    hex.vertexIds.includes(vertexId) && hex.resource ? [hex.resource] : []
  );
}

function countResources(values: readonly Resource[]): ResourceMap {
  const counts = emptyResources();
  for (const resource of values) {
    counts[resource] += 1;
  }
  return counts;
}

describe("post-MVP core Catan rules", () => {
  it("grants one card per productive hex adjacent to a second setup settlement and debits the bank equally", () => {
    const game = asSecondSetupPlacement(createSetupGame(), "p4");
    const vertexId = game.board
      .flatMap((hex) => hex.vertexIds)
      .find((candidate) => adjacentResources(game, candidate).length >= 2);
    expect(vertexId).toBeDefined();
    const expected = countResources(adjacentResources(game, vertexId ?? ""));

    const settled = placeSetupSettlement(game, "p4", vertexId ?? "");
    const player = settled.players.find((candidate) => candidate.id === "p4");

    expect(player?.resources).toEqual(expected);
    expect(settled.bank.resources).toEqual({
      wood: game.bank.resources.wood - expected.wood,
      brick: game.bank.resources.brick - expected.brick,
      wool: game.bank.resources.wool - expected.wool,
      grain: game.bank.resources.grain - expected.grain,
      ore: game.bank.resources.ore - expected.ore
    });
  });

  it("grants both cards when two adjacent hexes share a resource", () => {
    const game = asSecondSetupPlacement(createSetupGame(), "p4");
    const vertexId = game.board
      .flatMap((hex) => hex.vertexIds)
      .find((candidate) => {
        const adjacent = adjacentResources(game, candidate);
        return adjacent.some(
          (resource, index) => adjacent.indexOf(resource) !== index
        );
      });
    expect(vertexId).toBeDefined();
    const adjacent = adjacentResources(game, vertexId ?? "");
    const sharedResource = adjacent.find(
      (resource, index) => adjacent.indexOf(resource) !== index
    );
    expect(sharedResource).toBeDefined();

    const settled = placeSetupSettlement(game, "p4", vertexId ?? "");

    expect(settled.players.find((player) => player.id === "p4")?.resources[sharedResource ?? "wood"]).toBe(2);
    expect(settled.bank.resources[sharedResource ?? "wood"]).toBe(
      game.bank.resources[sharedResource ?? "wood"] - 2
    );
  });

  it("ignores an adjacent desert while granting the other adjacent resources", () => {
    const game = asSecondSetupPlacement(createSetupGame(), "p4");
    const vertexId = game.board
      .flatMap((hex) => hex.vertexIds)
      .find(
        (candidate) =>
          game.board.some(
            (hex) => hex.resource === null && hex.vertexIds.includes(candidate)
          ) && adjacentResources(game, candidate).length > 0
      );
    expect(vertexId).toBeDefined();
    const expected = countResources(adjacentResources(game, vertexId ?? ""));

    const settled = placeSetupSettlement(game, "p4", vertexId ?? "");
    const playerResources = settled.players.find((player) => player.id === "p4")?.resources;

    expect(playerResources).toEqual(expected);
    expect(Object.values(playerResources ?? {}).reduce((total, count) => total + count, 0)).toBe(
      adjacentResources(game, vertexId ?? "").length
    );
  });

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
      ...createScenarioAppState().game,
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
      ...createScenarioAppState(),
      game: {
        ...createScenarioAppState().game,
        targetScore: 2
      }
    };

    const next = gameReducer(state, { type: "ROLL_DICE", playerId: "p1", dice: [4, 4] });

    expect(next.game.phase).toBe("gameOver");
    expect(next.game.winnerId).toBe("p1");
    expect(() => gameReducer(next, { type: "END_TURN", playerId: "p1" })).toThrow(/over/i);
  });
});
