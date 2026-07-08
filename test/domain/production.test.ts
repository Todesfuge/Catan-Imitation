import { describe, expect, it } from "vitest";
import { createStandardBoardData } from "../../src/domain/board";
import { createDemoGame } from "../../src/domain/setup";
import { collectProduction } from "../../src/domain/rules/production";
import type { ResourceMap } from "../../src/domain/types";

describe("dice production", () => {
  it("uses shared intersections and edges across neighboring hexes", () => {
    const { board, edges } = createStandardBoardData();
    const vertexUseCounts = new Map<string, number>();

    for (const hex of board) {
      for (const vertexId of hex.vertexIds) {
        vertexUseCounts.set(vertexId, (vertexUseCounts.get(vertexId) ?? 0) + 1);
      }
    }

    expect(new Set(board.flatMap((hex) => hex.vertexIds)).size).toBe(54);
    expect(new Set(board.flatMap((hex) => hex.edgeIds)).size).toBe(72);
    expect(edges).toHaveLength(72);
    expect([...vertexUseCounts.values()].some((count) => count === 3)).toBe(true);
    expect([...vertexUseCounts.values()].some((count) => count === 2)).toBe(true);
  });

  it("produces from every terrain adjacent to a shared settlement vertex", () => {
    const game = createDemoGame();
    const sharedVertexId = game.board.find((hex) => hex.id === "pasture-8")?.vertexIds[1];
    const adjacentHexes = game.board.filter((hex) => hex.vertexIds.includes(sharedVertexId ?? ""));
    const adjacentHexIds = adjacentHexes.map((hex) => hex.id);

    expect(adjacentHexes).toHaveLength(3);

    const production = collectProduction(
      {
        ...game,
        board: game.board.map((hex) =>
          adjacentHexIds.includes(hex.id) && hex.resource ? { ...hex, diceNumber: 11 } : hex
        ),
        buildings: [
          {
            id: "shared-settlement",
            ownerId: "p1",
            vertexId: sharedVertexId ?? "",
            kind: "settlement"
          }
        ],
        robberHexId: "desert"
      },
      11
    );

    expect(production.byPlayer.p1).toMatchObject<ResourceMap>({
      wood: 0,
      brick: 1,
      wool: 1,
      grain: 1,
      ore: 0
    });
    expect(production.events.map((event) => event.hexId).sort()).toEqual(adjacentHexIds.sort());
  });

  it("gives one resource for settlements and two for cities adjacent to the rolled number", () => {
    const game = createDemoGame();

    const production = collectProduction(game, 8);

    expect(production.byPlayer.p1).toMatchObject<ResourceMap>({
      wood: 0,
      brick: 0,
      wool: 2,
      grain: 0,
      ore: 0
    });
    expect(production.byPlayer.p2).toMatchObject<ResourceMap>({
      wood: 0,
      brick: 0,
      wool: 0,
      grain: 0,
      ore: 1
    });
  });

  it("blocks production on the robber hex", () => {
    const game = {
      ...createDemoGame(),
      robberHexId: "pasture-8"
    };

    const production = collectProduction(game, 8);

    expect(production.byPlayer.p1.wool).toBe(0);
    expect(production.events.every((event) => event.hexId !== "pasture-8")).toBe(true);
  });
});
