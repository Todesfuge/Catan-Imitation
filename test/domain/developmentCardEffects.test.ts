import { describe, expect, it } from "vitest";
import {
  createInitialAppState,
  type AppState
} from "../../src/app/gameReducer";
import { executeMatchCommandForTest as gameReducer } from "./matchCommandTestUtils";
import { emptyResources, resources, type DevelopmentCardKind, type Resource } from "../../src/domain/types";

function withCard(
  kind: DevelopmentCardKind,
  phase: "awaitingRoll" | "action" = "action",
  purchasedTurn = 0,
  additionalKinds: DevelopmentCardKind[] = []
): AppState {
  const state = createInitialAppState();
  const cards = [kind, ...additionalKinds].map((cardKind, index) => ({
    id: `test-${cardKind}-${index}`,
    kind: cardKind,
    purchasedTurn,
    revealed: false
  }));
  return {
    ...state,
    game: {
      ...state.game,
      turnState: {
        phase,
        pendingDiscards: {},
        developmentCardPlayed: false
      },
      players: state.game.players.map((player) =>
        player.id === "p1" ? { ...player, developmentCards: cards } : player
      )
    }
  };
}

function playerResource(state: AppState, playerId: string, resource: Resource): number {
  return state.game.players.find((player) => player.id === playerId)?.resources[resource] ?? 0;
}

function connectedFreeRoadEdges(state: AppState): [string, string] {
  const ownedRoad = state.game.roads.find((road) => road.ownerId === "p1");
  const ownedEdge = state.game.edges.find((edge) => edge.id === ownedRoad?.edgeId);
  if (!ownedEdge) {
    throw new Error("Expected a demo road for p1.");
  }

  const occupied = new Set(state.game.roads.map((road) => road.edgeId));
  const first = state.game.edges.find(
    (edge) => !occupied.has(edge.id) && edge.vertexIds.some((vertexId) => ownedEdge.vertexIds.includes(vertexId))
  );
  if (!first) {
    throw new Error("Expected a first free road edge.");
  }

  const second = state.game.edges.find(
    (edge) =>
      !occupied.has(edge.id) &&
      edge.id !== first.id &&
      edge.vertexIds.some((vertexId) => first.vertexIds.includes(vertexId)) &&
      !edge.vertexIds.some((vertexId) => ownedEdge.vertexIds.includes(vertexId))
  );
  if (!second) {
    throw new Error("Expected a second edge that becomes connected through the first.");
  }

  return [first.id, second.id];
}

describe("standard development-card effects", () => {
  it("places two player-selected legal roads sequentially without paying resources", () => {
    const state = withCard("roadBuilding");
    const [firstEdgeId, secondEdgeId] = connectedFreeRoadEdges(state);
    const beforeResources = structuredClone(
      state.game.players.find((player) => player.id === "p1")?.resources
    );

    const started = gameReducer(state, {
      type: "PLAY_DEVELOPMENT_CARD",
      playerId: "p1",
      cardId: "test-roadBuilding-0"
    });
    expect(started.game.turnState).toMatchObject({
      phase: "awaitingDevelopmentEffect",
      developmentCardPlayed: true,
      pendingDevelopmentEffect: {
        kind: "roadBuilding",
        playerId: "p1",
        remainingRoads: 2,
        resumePhase: "action"
      }
    });

    const first = gameReducer(started, {
      type: "PLACE_FREE_ROAD",
      playerId: "p1",
      edgeId: firstEdgeId
    });
    expect(first.game.roads.some((road) => road.edgeId === firstEdgeId)).toBe(true);
    expect(first.game.turnState.pendingDevelopmentEffect).toMatchObject({ remainingRoads: 1 });

    const second = gameReducer(first, {
      type: "PLACE_FREE_ROAD",
      playerId: "p1",
      edgeId: secondEdgeId
    });
    expect(second.game.roads.some((road) => road.edgeId === secondEdgeId)).toBe(true);
    expect(second.game.turnState.phase).toBe("action");
    expect(second.game.turnState.pendingDevelopmentEffect).toBeUndefined();
    expect(second.game.players.find((player) => player.id === "p1")?.resources).toEqual(beforeResources);
  });

  it("ends Road Building early when no legal edge remains", () => {
    const state = withCard("roadBuilding", "awaitingRoll");
    const blocked = {
      ...state,
      game: {
        ...state.game,
        roads: state.game.edges.map((edge, index) => ({
          id: `occupied-${index}`,
          ownerId: index === 0 ? "p1" : "p2",
          edgeId: edge.id
        }))
      }
    };

    const result = gameReducer(blocked, {
      type: "PLAY_DEVELOPMENT_CARD",
      playerId: "p1",
      cardId: "test-roadBuilding-0"
    });

    expect(result.game.turnState.phase).toBe("awaitingRoll");
    expect(result.game.turnState.developmentCardPlayed).toBe(true);
    expect(result.game.turnState.pendingDevelopmentEffect).toBeUndefined();
  });

  it("takes two selected Year of Plenty resources from live bank stock", () => {
    const state = withCard("yearOfPlenty", "awaitingRoll");
    const beforeWood = playerResource(state, "p1", "wood");
    const beforeBankWood = state.game.bank.resources.wood;
    const started = gameReducer(state, {
      type: "PLAY_DEVELOPMENT_CARD",
      playerId: "p1",
      cardId: "test-yearOfPlenty-0"
    });

    const first = gameReducer(started, {
      type: "CHOOSE_YEAR_OF_PLENTY_RESOURCE",
      playerId: "p1",
      resource: "wood"
    });
    const second = gameReducer(first, {
      type: "CHOOSE_YEAR_OF_PLENTY_RESOURCE",
      playerId: "p1",
      resource: "wood"
    });

    expect(playerResource(second, "p1", "wood")).toBe(beforeWood + 2);
    expect(second.game.bank.resources.wood).toBe(beforeBankWood - 2);
    expect(second.game.turnState.phase).toBe("awaitingRoll");
  });

  it("ends Year of Plenty early only when the bank becomes empty", () => {
    const state = withCard("yearOfPlenty");
    const scarce = {
      ...state,
      game: {
        ...state.game,
        bank: { resources: { ...emptyResources(), ore: 1 } }
      }
    };
    const started = gameReducer(scarce, {
      type: "PLAY_DEVELOPMENT_CARD",
      playerId: "p1",
      cardId: "test-yearOfPlenty-0"
    });
    const result = gameReducer(started, {
      type: "CHOOSE_YEAR_OF_PLENTY_RESOURCE",
      playerId: "p1",
      resource: "ore"
    });

    expect(result.game.bank.resources).toEqual(emptyResources());
    expect(result.game.turnState.phase).toBe("action");
    expect(result.game.turnState.pendingDevelopmentEffect).toBeUndefined();
  });

  it("monopolizes the selected resource from every opponent without changing the bank", () => {
    const state = withCard("monopoly");
    const prepared = {
      ...state,
      game: {
        ...state.game,
        players: state.game.players.map((player, index) => ({
          ...player,
          resources: { ...player.resources, grain: index }
        }))
      }
    };
    const beforeBank = structuredClone(prepared.game.bank);
    const started = gameReducer(prepared, {
      type: "PLAY_DEVELOPMENT_CARD",
      playerId: "p1",
      cardId: "test-monopoly-0"
    });
    const result = gameReducer(started, {
      type: "CHOOSE_MONOPOLY_RESOURCE",
      playerId: "p1",
      resource: "grain"
    });

    expect(playerResource(result, "p1", "grain")).toBe(6);
    expect(result.game.players.slice(1).every((player) => player.resources.grain === 0)).toBe(true);
    expect(result.game.bank).toEqual(beforeBank);
    expect(result.game.turnState.phase).toBe("action");
  });

  it("shares the one-card-per-turn limit across non-victory card kinds", () => {
    const state = withCard("monopoly", "action", 0, ["yearOfPlenty"]);
    const started = gameReducer(state, {
      type: "PLAY_DEVELOPMENT_CARD",
      playerId: "p1",
      cardId: "test-monopoly-0"
    });
    const resolved = gameReducer(started, {
      type: "CHOOSE_MONOPOLY_RESOURCE",
      playerId: "p1",
      resource: "wood"
    });

    expect(() =>
      gameReducer(resolved, {
        type: "PLAY_DEVELOPMENT_CARD",
        playerId: "p1",
        cardId: "test-yearOfPlenty-1"
      })
    ).toThrow(/one .*development card|already played/i);
  });

  it("counts a knight toward the same one-card-per-turn limit", () => {
    const state = withCard("knight", "action", 0, ["monopoly"]);
    const started = gameReducer(state, {
      type: "PLAY_DEVELOPMENT_CARD",
      playerId: "p1",
      cardId: "test-knight-0"
    });
    expect(started.game.turnState.pendingRobber).toMatchObject({
      source: "knight",
      resumePhase: "action"
    });
    const resolved = gameReducer(started, {
      type: "PLACE_ROBBER",
      playerId: "p1",
      hexId: "forest-4"
    });

    expect(() =>
      gameReducer(resolved, {
        type: "PLAY_DEVELOPMENT_CARD",
        playerId: "p1",
        cardId: "test-monopoly-1"
      })
    ).toThrow(/one .*development card|already played/i);
  });

  it("does not let Road Building continue through an opponent building", () => {
    const state = withCard("roadBuilding");
    const [firstEdgeId, secondEdgeId] = connectedFreeRoadEdges(state);
    const firstEdge = state.game.edges.find((edge) => edge.id === firstEdgeId);
    const secondEdge = state.game.edges.find((edge) => edge.id === secondEdgeId);
    const blockedVertexId = firstEdge?.vertexIds.find((vertexId) =>
      secondEdge?.vertexIds.includes(vertexId)
    );
    if (!blockedVertexId) {
      throw new Error("Expected connected test edges.");
    }
    const blocked = {
      ...state,
      game: {
        ...state.game,
        buildings: [
          ...state.game.buildings,
          {
            id: "opponent-road-block",
            ownerId: "p2",
            vertexId: blockedVertexId,
            kind: "settlement" as const
          }
        ]
      }
    };
    const started = gameReducer(blocked, {
      type: "PLAY_DEVELOPMENT_CARD",
      playerId: "p1",
      cardId: "test-roadBuilding-0"
    });
    const first = gameReducer(started, {
      type: "PLACE_FREE_ROAD",
      playerId: "p1",
      edgeId: firstEdgeId
    });

    expect(() =>
      gameReducer(first, {
        type: "PLACE_FREE_ROAD",
        playerId: "p1",
        edgeId: secondEdgeId
      })
    ).toThrow(/road|connect|building/i);
  });

  it("rejects same-turn cards and invalid effect choices without mutating input state", () => {
    const sameTurn = withCard("monopoly", "action", 1);
    const sameTurnBefore = structuredClone(sameTurn);
    expect(() =>
      gameReducer(sameTurn, {
        type: "PLAY_DEVELOPMENT_CARD",
        playerId: "p1",
        cardId: "test-monopoly-0"
      })
    ).toThrow(/same turn|purchased/i);
    expect(sameTurn).toEqual(sameTurnBefore);

    const state = withCard("yearOfPlenty");
    const emptyBank = {
      ...state,
      game: { ...state.game, bank: { resources: emptyResources() } }
    };
    const started = gameReducer(emptyBank, {
      type: "PLAY_DEVELOPMENT_CARD",
      playerId: "p1",
      cardId: "test-yearOfPlenty-0"
    });
    expect(started.game.turnState.phase).toBe("action");

    const roadState = withCard("roadBuilding");
    const roadStarted = gameReducer(roadState, {
      type: "PLAY_DEVELOPMENT_CARD",
      playerId: "p1",
      cardId: "test-roadBuilding-0"
    });
    const beforeInvalidRoad = structuredClone(roadStarted);
    expect(() =>
      gameReducer(roadStarted, {
        type: "PLACE_FREE_ROAD",
        playerId: "p1",
        edgeId: "not-a-board-edge"
      })
    ).toThrow(/road|edge/i);
    expect(roadStarted).toEqual(beforeInvalidRoad);

    expect(resources).toContain("wood");
  });
});
