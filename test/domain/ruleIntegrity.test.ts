import { describe, expect, it } from "vitest";
import { gameReducer } from "../../src/app/gameReducer";
import { buildSettlement, placeSetupSettlement } from "../../src/domain/rules/building";
import { calculatePlayerScore } from "../../src/domain/rules/scoring";
import { createSetupGame } from "../../src/domain/setup";
import {
  createScenarioAppState,
  createScenarioGame
} from "../fixtures/createScenarioGame";
import { updateLongestRoadAward } from "../../src/domain/rules/longestRoad";
import type { BoardEdge, GameState, PlayerId, ResourceMap } from "../../src/domain/types";

function withPlayerResources(
  game: GameState,
  playerId: PlayerId,
  resources: Partial<ResourceMap>
): GameState {
  return {
    ...game,
    players: game.players.map((player) =>
      player.id === playerId
        ? { ...player, resources: { ...player.resources, ...resources } }
        : player
    )
  };
}

function roadChain(playerId: PlayerId, length: number, prefix: string) {
  const edges: BoardEdge[] = Array.from({ length }, (_, index) => ({
    id: `${prefix}-edge-${index}`,
    hexId: "custom",
    vertexIds: [`${prefix}-vertex-${index}`, `${prefix}-vertex-${index + 1}`]
  }));
  return {
    edges,
    roads: edges.map((edge) => ({
      id: `${playerId}-${edge.id}`,
      ownerId: playerId,
      edgeId: edge.id
    }))
  };
}

function gameWithRoadLengths(
  lengths: Partial<Record<PlayerId, number>>,
  currentOwnerId?: PlayerId
): GameState {
  const chains = Object.entries(lengths).map(([playerId, length], index) =>
    roadChain(playerId, length ?? 0, `chain-${index}-${playerId}`)
  );
  return {
    ...createScenarioGame(),
    edges: chains.flatMap((chain) => chain.edges),
    roads: chains.flatMap((chain) => chain.roads),
    buildings: [],
    longestRoadOwnerId: currentOwnerId
  };
}

describe("core rule integrity", () => {
  it("requires a normal settlement to connect to one of the player's roads", () => {
    const game = withPlayerResources(createScenarioGame(), "p1", {
      wood: 1,
      brick: 1,
      wool: 1,
      grain: 1
    });
    const occupiedVertices = new Set(game.buildings.map((building) => building.vertexId));
    const adjacentToBuilding = new Set(
      game.edges
        .filter((edge) => edge.vertexIds.some((vertexId) => occupiedVertices.has(vertexId)))
        .flatMap((edge) => edge.vertexIds)
    );
    const ownedRoadVertices = new Set(
      game.roads
        .filter((road) => road.ownerId === "p1")
        .flatMap((road) => game.edges.find((edge) => edge.id === road.edgeId)?.vertexIds ?? [])
    );
    const targetVertexId = game.board
      .flatMap((hex) => hex.vertexIds)
      .find(
        (vertexId) =>
          !occupiedVertices.has(vertexId) &&
          !adjacentToBuilding.has(vertexId) &&
          !ownedRoadVertices.has(vertexId)
      );

    expect(targetVertexId).toBeDefined();
    expect(() => buildSettlement(game, "p1", targetVertexId ?? "")).toThrow(/road/i);
  });

  it("accepts a connected normal settlement and preserves the setup exemption", () => {
    const demo = createScenarioGame();
    const p1Road = demo.roads.find((road) => road.ownerId === "p1");
    const p1Edge = demo.edges.find((edge) => edge.id === p1Road?.edgeId);
    const connectedVertexId = p1Edge?.vertexIds[0] ?? "";
    const connectedGame = withPlayerResources(
      { ...demo, buildings: [] },
      "p1",
      { wood: 1, brick: 1, wool: 1, grain: 1 }
    );

    expect(() => buildSettlement(connectedGame, "p1", connectedVertexId)).not.toThrow();

    const setup = createSetupGame();
    expect(() => placeSetupSettlement(setup, "p1", setup.board[0].vertexIds[0])).not.toThrow();
  });

  it("does not accept an opponent road or a dangling owned road as settlement connectivity", () => {
    const base = withPlayerResources(
      {
        ...createScenarioGame(),
        board: [
          {
            id: "custom",
            terrain: "desert",
            resource: null,
            diceNumber: null,
            vertexIds: ["v0", "v1"],
            edgeIds: ["e0"],
            q: 0,
            r: 0
          }
        ],
        edges: [{ id: "e0", hexId: "custom", vertexIds: ["v0", "v1"] }],
        buildings: []
      },
      "p1",
      { wood: 1, brick: 1, wool: 1, grain: 1 }
    );
    const opponentRoadGame = {
      ...base,
      roads: [{ id: "p2-road", ownerId: "p2", edgeId: "e0" }]
    };
    const danglingRoadGame = {
      ...base,
      roads: [{ id: "p1-dangling-road", ownerId: "p1", edgeId: "missing-edge" }]
    };

    expect(() => buildSettlement(opponentRoadGame, "p1", "v0")).toThrow(/player's roads/i);
    expect(() => buildSettlement(danglingRoadGame, "p1", "v0")).toThrow(/player's roads/i);
  });

  it("clears Longest Road when every route falls below five", () => {
    const game = gameWithRoadLengths({ p1: 4 }, "p1");

    expect(updateLongestRoadAward(game).longestRoadOwnerId).toBeUndefined();
  });

  it("retains the incumbent on a qualifying tie", () => {
    const game = gameWithRoadLengths({ p1: 5, p2: 5 }, "p1");

    expect(updateLongestRoadAward(game).longestRoadOwnerId).toBe("p1");
  });

  it("transfers Longest Road to a unique qualifying leader", () => {
    const game = gameWithRoadLengths({ p1: 5, p2: 6 }, "p1");

    expect(updateLongestRoadAward(game).longestRoadOwnerId).toBe("p2");
  });

  it("clears Longest Road when tied challengers overtake the incumbent", () => {
    const game = gameWithRoadLengths({ p1: 5, p2: 6, p3: 6 }, "p1");

    expect(updateLongestRoadAward(game).longestRoadOwnerId).toBeUndefined();
  });

  it("recalculates Longest Road and score after an opponent settlement blocks a route", () => {
    const p1Chain = roadChain("p1", 5, "shared");
    const blockingEdge: BoardEdge = {
      id: "p2-blocking-edge",
      hexId: "custom",
      vertexIds: ["shared-vertex-3", "p2-branch"]
    };
    const base = createScenarioAppState();
    const game = withPlayerResources(
      {
        ...base.game,
        activePlayerId: "p2",
        targetScore: 20,
        board: [
          {
            id: "custom",
            terrain: "desert",
            resource: null,
            diceNumber: null,
            vertexIds: [...Array.from({ length: 6 }, (_, index) => `shared-vertex-${index}`), "p2-branch"],
            edgeIds: [...p1Chain.edges.map((edge) => edge.id), blockingEdge.id],
            q: 0,
            r: 0
          }
        ],
        edges: [...p1Chain.edges, blockingEdge],
        roads: [
          ...p1Chain.roads,
          { id: "p2-blocking-road", ownerId: "p2", edgeId: blockingEdge.id }
        ],
        buildings: [],
        robberHexId: "custom",
        longestRoadOwnerId: "p1",
        turnState: { phase: "action", pendingDiscards: {} }
      },
      "p2",
      { wood: 1, brick: 1, wool: 1, grain: 1 }
    );

    const next = gameReducer(
      { ...base, game },
      { type: "BUILD_SETTLEMENT", playerId: "p2", vertexId: "shared-vertex-3" }
    );

    expect(next.game.longestRoadOwnerId).toBeUndefined();
    expect(calculatePlayerScore(next.game, "p1")).toBe(0);
  });

  it("recalculates a fifth road before winner detection in the reducer", () => {
    const chain = roadChain("p1", 5, "winning");
    const base = createScenarioAppState();
    const game = withPlayerResources(
      {
        ...base.game,
        targetScore: 2,
        edges: chain.edges,
        roads: chain.roads.slice(0, 4),
        buildings: [],
        longestRoadOwnerId: undefined,
        turnState: { phase: "action", pendingDiscards: {} }
      },
      "p1",
      { wood: 1, brick: 1 }
    );

    const next = gameReducer(
      { ...base, game },
      { type: "BUILD_ROAD", playerId: "p1", edgeId: chain.edges[4].id }
    );

    expect(next.game.longestRoadOwnerId).toBe("p1");
    expect(calculatePlayerScore(next.game, "p1")).toBe(2);
    expect(next.game.phase).toBe("gameOver");
    expect(next.game.winnerId).toBe("p1");
  });
});
