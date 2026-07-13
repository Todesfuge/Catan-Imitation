import { describe, expect, it } from "vitest";
import { parseMapSeed } from "../../src/domain/mapSeed";
import { createBoardDataForSeed } from "../../src/domain/randomBoard";
import { createDemoGame } from "../../src/domain/setup";
import { collectProduction } from "../../src/domain/rules/production";
import type { ResourceMap } from "../../src/domain/types";

const productionSeed = parseMapSeed("M1-0F1E2D3C4B5A6978");

describe("dice production", () => {
  it("uses shared intersections and edges across neighboring hexes", () => {
    const { board, edges } = createBoardDataForSeed(productionSeed);
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
    const generated = createBoardDataForSeed(productionSeed);
    const desert = generated.board.find((hex) => hex.terrain === "desert");
    const game = {
      ...createDemoGame(),
      ...generated,
      buildings: [],
      robberHexId: desert?.id ?? ""
    };
    const vertexUseCounts = new Map<string, number>();
    for (const hex of game.board.filter((candidate) => candidate.resource !== null)) {
      for (const vertexId of hex.vertexIds) {
        vertexUseCounts.set(vertexId, (vertexUseCounts.get(vertexId) ?? 0) + 1);
      }
    }
    const sharedVertexId = [...vertexUseCounts].find(([, count]) => count === 3)?.[0];
    const adjacentHexes = game.board.filter((hex) => hex.vertexIds.includes(sharedVertexId ?? ""));
    const adjacentHexIds = adjacentHexes.map((hex) => hex.id);
    const expected: ResourceMap = { wood: 0, brick: 0, wool: 0, grain: 0, ore: 0 };
    for (const hex of adjacentHexes) {
      if (hex.resource) {
        expected[hex.resource] += 1;
      }
    }

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
        ]
      },
      11
    );

    expect(production.byPlayer.p1).toMatchObject<ResourceMap>(expected);
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

  it("blocks production when the robber occupies a neutral-ID generated hex", () => {
    const generated = createBoardDataForSeed(productionSeed);
    const vertexUseCounts = new Map<string, number>();
    for (const hex of generated.board) {
      for (const vertexId of hex.vertexIds) {
        vertexUseCounts.set(vertexId, (vertexUseCounts.get(vertexId) ?? 0) + 1);
      }
    }
    const blockedHex = generated.board.find(
      (hex) =>
        hex.resource !== null &&
        hex.diceNumber !== null &&
        hex.vertexIds.some((vertexId) => vertexUseCounts.get(vertexId) === 1)
    );
    const settlementVertexId = blockedHex?.vertexIds.find(
      (vertexId) => vertexUseCounts.get(vertexId) === 1
    );
    if (!blockedHex || !blockedHex.resource || blockedHex.diceNumber === null || !settlementVertexId) {
      throw new Error("Expected a productive generated coastal hex with an exclusive vertex.");
    }
    const game = {
      ...createDemoGame(),
      ...generated,
      buildings: [
        {
          id: "generated-blocked-settlement",
          ownerId: "p1",
          vertexId: settlementVertexId,
          kind: "settlement" as const
        }
      ],
      robberHexId: blockedHex.id
    };

    const production = collectProduction(game, blockedHex.diceNumber);

    expect(blockedHex.id).toMatch(/^hex-\d{2}$/);
    expect(production.byPlayer.p1[blockedHex.resource]).toBe(0);
    expect(production.events.every((event) => event.hexId !== blockedHex.id)).toBe(true);
  });
});
