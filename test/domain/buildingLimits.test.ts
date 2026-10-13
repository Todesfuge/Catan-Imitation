import { describe, expect, it } from "vitest";
import {
  buildCity, buildRoad, buildSettlement, getLegalRoadEdgeIds,
  getLegalSettlementVertexIds, getUpgradeableBuildingIds, placeFreeRoad
} from "../../src/domain/rules/building";
import type { GameState } from "../../src/domain/types";
import { createScenarioGame } from "../fixtures/createScenarioGame";

function fundedGame(): GameState {
  const game = createScenarioGame();
  return {
    ...game,
    players: game.players.map((player) => player.id === "p1"
      ? { ...player, resources: { wood: 19, brick: 19, wool: 19, grain: 19, ore: 19 } } : player)
  };
}

describe("building piece limits", () => {
  it("allows the fifteenth road but rejects both paid and free sixteenth roads atomically", () => {
    let game = fundedGame();
    while (game.roads.filter((road) => road.ownerId === "p1").length < 14) {
      const edgeId = getLegalRoadEdgeIds(game, "p1")[0];
      expect(edgeId).toBeTruthy();
      game = buildRoad(game, "p1", edgeId);
    }
    const [lastEdge, spareEdge] = getLegalRoadEdgeIds(game, "p1");
    expect(spareEdge).toBeTruthy();
    game = buildRoad(game, "p1", lastEdge);
    const before = structuredClone(game);

    expect(game.roads.filter((road) => road.ownerId === "p1")).toHaveLength(15);
    expect(getLegalRoadEdgeIds(game, "p1")).toEqual([]);
    expect(() => buildRoad(game, "p1", spareEdge)).toThrow(/road pieces/i);
    expect(() => placeFreeRoad(game, "p1", spareEdge)).toThrow(/road pieces/i);
    expect(game).toEqual(before);
  });

  it("returns a settlement piece after a city upgrade and enforces the city limit", () => {
    const game = fundedGame();
    const vertices = [...new Set(game.board.flatMap((hex) => hex.vertexIds))];
    const independent: string[] = [];
    for (const vertex of vertices) {
      if (!independent.some((other) => game.edges.some((edge) =>
        edge.vertexIds.includes(vertex) && edge.vertexIds.includes(other)))) independent.push(vertex);
      if (independent.length === 6) break;
    }
    expect(independent).toHaveLength(6);
    const full: GameState = {
      ...game,
      buildings: independent.slice(0, 5).map((vertexId, index) => ({
        id: `settlement-${index}`, ownerId: "p1", vertexId, kind: "settlement"
      })),
      roads: game.edges.filter((edge) => edge.vertexIds.includes(independent[5])).slice(0, 1)
        .map((edge) => ({ id: "connected-road", ownerId: "p1", edgeId: edge.id }))
    };
    const before = structuredClone(full);
    expect(getLegalSettlementVertexIds(full, "p1")).toEqual([]);
    expect(() => buildSettlement(full, "p1", independent[5])).toThrow(/settlement pieces/i);
    expect(full).toEqual(before);

    let upgraded = buildCity(full, "p1", "settlement-0");
    expect(getLegalSettlementVertexIds(upgraded, "p1")).toContain(independent[5]);
    upgraded = buildSettlement(upgraded, "p1", independent[5]);
    for (let index = 1; index < 4; index++) upgraded = buildCity(upgraded, "p1", `settlement-${index}`);
    expect(upgraded.buildings.filter((building) => building.kind === "city")).toHaveLength(4);
    expect(getUpgradeableBuildingIds(upgraded, "p1")).toEqual([]);
    const beforeCity = structuredClone(upgraded);
    expect(() => buildCity(upgraded, "p1", "settlement-4")).toThrow(/city pieces/i);
    expect(upgraded).toEqual(beforeCity);
  });
});
