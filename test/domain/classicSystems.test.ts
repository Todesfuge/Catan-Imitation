import { describe, expect, it } from "vitest";
import { createDemoGame } from "../../src/domain/setup";
import {
  buyDevelopmentCard,
  createDevelopmentDeck,
  playKnightCard,
  updateLargestArmyAward
} from "../../src/domain/rules/developmentCards";
import {
  calculateLongestRoadLength,
  updateLongestRoadAward
} from "../../src/domain/rules/longestRoad";
import { maritimeTrade } from "../../src/domain/rules/maritimeTrade";
import { calculatePlayerScore } from "../../src/domain/rules/scoring";
import type { BoardEdge, GameState, Player, ResourceMap } from "../../src/domain/types";

function withPlayer(game: GameState, playerId: string, update: (player: Player) => Player): GameState {
  return {
    ...game,
    players: game.players.map((player) => (player.id === playerId ? update(player) : player))
  };
}

function withPlayerResources(game: GameState, playerId: string, resources: Partial<ResourceMap>): GameState {
  return withPlayer(game, playerId, (player) => ({
    ...player,
    resources: { ...player.resources, ...resources }
  }));
}

describe("classic Catan systems", () => {
  it("buys a hidden development card from the deck and blocks same-turn non-victory play", () => {
    const game = withPlayerResources(
      {
        ...createDemoGame(),
        turn: 3,
        developmentDeck: createDevelopmentDeck(["knight", "victoryPoint"])
      },
      "p1",
      { wool: 1, grain: 1, ore: 1 }
    );

    const purchase = buyDevelopmentCard(game, "p1");
    const p1 = purchase.game.players.find((player) => player.id === "p1");

    expect(purchase.card.kind).toBe("knight");
    expect(purchase.card.revealed).toBe(false);
    expect(purchase.game.developmentDeck).toHaveLength(1);
    expect(p1?.developmentCards.map((card) => card.id)).toEqual([purchase.card.id]);
    expect(p1?.resources).toMatchObject({ wool: 0, grain: 0, ore: 0 });
    expect(purchase.game.bank.resources).toMatchObject({ wool: 20, grain: 20, ore: 20 });
    expect(() => playKnightCard(purchase.game, "p1", purchase.card.id)).toThrow(
      /same turn/i
    );
  });

  it("plays knights after purchase turn and awards Largest Army only on threshold-leading counts", () => {
    const initialPurchase = buyDevelopmentCard(
      withPlayerResources(
        {
          ...createDemoGame(),
          turn: 2,
          developmentDeck: createDevelopmentDeck(["knight"])
        },
        "p1",
        { wool: 1, grain: 1, ore: 1 }
      ),
      "p1"
    );
    const readyGame = withPlayer(initialPurchase.game, "p1", (player) => ({
      ...player,
      knightsPlayed: 2
    }));

    const played = playKnightCard({ ...readyGame, turn: 3 }, "p1", initialPurchase.card.id);
    const p1 = played.players.find((player) => player.id === "p1");

    expect(p1?.knightsPlayed).toBe(3);
    expect(p1?.developmentCards).toHaveLength(0);
    expect(played.largestArmyOwnerId).toBe("p1");
    expect(calculatePlayerScore(played, "p1")).toBe(4);

    const tiedGame = {
      ...played,
      players: played.players.map((player) =>
        player.id === "p2" ? { ...player, knightsPlayed: 3 } : player
      )
    };
    expect(updateLargestArmyAward(tiedGame, "p2").largestArmyOwnerId).toBe("p1");
  });

  it("calculates and awards Longest Road without summing branches or crossing opponent buildings", () => {
    const customEdges: BoardEdge[] = [
      { id: "arm-a", hexId: "custom", vertexIds: ["center", "a"] },
      { id: "arm-b", hexId: "custom", vertexIds: ["center", "b"] },
      { id: "arm-c", hexId: "custom", vertexIds: ["center", "c"] }
    ];
    const branchedGame = {
      ...createDemoGame(),
      edges: customEdges,
      buildings: [],
      roads: customEdges.map((edge) => ({
        id: `road-${edge.id}`,
        ownerId: "p1",
        edgeId: edge.id
      }))
    };

    expect(calculateLongestRoadLength(branchedGame, "p1")).toBe(2);

    const chainGame = {
      ...createDemoGame(),
      roads: ["forest-4-e0", "forest-4-e1", "forest-4-e2", "forest-4-e3", "forest-4-e4"].map(
        (edgeId) => ({
          id: `road-${edgeId}`,
          ownerId: "p1",
          edgeId
        })
      )
    };
    const awarded = updateLongestRoadAward(chainGame);

    expect(calculateLongestRoadLength(chainGame, "p1")).toBe(5);
    expect(awarded.longestRoadOwnerId).toBe("p1");
    expect(calculatePlayerScore(awarded, "p1")).toBe(4);

    const blockedGame = {
      ...createDemoGame(),
      buildings: [
        ...createDemoGame().buildings,
        {
          id: "block-p2-forest-4-v1",
          ownerId: "p2",
          vertexId: "forest-4-v1",
          kind: "settlement" as const
        }
      ],
      roads: ["forest-4-e0", "forest-4-e1"].map((edgeId) => ({
        id: `road-${edgeId}`,
        ownerId: "p1",
        edgeId
      }))
    };

    expect(calculateLongestRoadLength(blockedGame, "p1")).toBe(1);
  });

  it("resolves maritime trades with default, generic port, and resource-specific port ratios", () => {
    const demoGame = createDemoGame();
    const p1PortVertexId = demoGame.buildings.find((building) => building.ownerId === "p1")?.vertexId ?? "";
    const defaultTrade = maritimeTrade(
      withPlayerResources(demoGame, "p1", { wood: 4 }),
      "p1",
      "wood",
      "ore"
    );
    expect(defaultTrade.players.find((player) => player.id === "p1")?.resources).toMatchObject({
      wood: 0,
      ore: 1
    });
    expect(defaultTrade.bank.resources).toMatchObject({ wood: 23, ore: 18 });

    const genericTrade = maritimeTrade(
      withPlayerResources(
        {
          ...demoGame,
          ports: [{ id: "generic-port", kind: "generic" as const, vertexIds: [p1PortVertexId] }]
        },
        "p1",
        { brick: 3 }
      ),
      "p1",
      "brick",
      "wool"
    );
    expect(genericTrade.players.find((player) => player.id === "p1")?.resources).toMatchObject({
      brick: 0,
      wool: 1
    });

    const specificPortGame = {
      ...demoGame,
      ports: [
        {
          id: "wood-port",
          kind: "resource" as const,
          resource: "wood" as const,
          vertexIds: [p1PortVertexId]
        }
      ]
    };
    const specificTrade = maritimeTrade(
      withPlayerResources(specificPortGame, "p1", { wood: 2 }),
      "p1",
      "wood",
      "grain"
    );
    expect(specificTrade.players.find((player) => player.id === "p1")?.resources).toMatchObject({
      wood: 0,
      grain: 1
    });
    expect(() =>
      maritimeTrade(withPlayerResources(specificPortGame, "p2", { wood: 2 }), "p2", "wood", "ore")
    ).toThrow(/port/i);
  });
});
