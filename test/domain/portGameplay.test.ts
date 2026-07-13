import { describe, expect, it } from "vitest";
import { parseMapSeed } from "../../src/domain/mapSeed";
import { createBoardDataForSeed } from "../../src/domain/randomBoard";
import { getMaritimeTradeRatio } from "../../src/domain/rules/maritimeTrade";
import { createSetupGame } from "../../src/domain/setup";
import { createScenarioGame } from "../fixtures/createScenarioGame";
import { portProjection, vertexProjection } from "../../src/ui/boardGeometry";
import { resources, type GameState, type MaritimePort } from "../../src/domain/types";

const portSeed = parseMapSeed("M1-89ABCDEF01234567");

function withPortBuilding(game: GameState, port: MaritimePort, endpointIndex: 0 | 1): GameState {
  return {
    ...game,
    buildings: [
      ...game.buildings.filter((building) => building.vertexId !== port.vertexIds[endpointIndex]),
      {
        id: `port-building-${port.id}-${endpointIndex}`,
        ownerId: "p1",
        vertexId: port.vertexIds[endpointIndex],
        kind: "settlement"
      }
    ]
  };
}

describe("standard playable ports", () => {
  it("generates nine deterministic non-overlapping seeded coastal ports with the standard distribution", () => {
    const first = createBoardDataForSeed(portSeed);
    const second = createBoardDataForSeed(portSeed);
    const edgeUse = new Map<string, number>();
    for (const hex of first.board) {
      for (const edgeId of hex.edgeIds) {
        edgeUse.set(edgeId, (edgeUse.get(edgeId) ?? 0) + 1);
      }
    }
    const coastalPairs = new Set(
      first.edges
        .filter((edge) => edgeUse.get(edge.id) === 1)
        .map((edge) => [...edge.vertexIds].sort().join("|"))
    );

    expect(first.ports).toHaveLength(9);
    expect(second.ports).toEqual(first.ports);
    expect(first.ports.filter((port) => port.kind === "generic")).toHaveLength(4);
    expect(
      first.ports.filter((port) => port.kind === "resource").map((port) => port.resource).sort()
    ).toEqual([...resources].sort());
    expect(new Set(first.ports.flatMap((port) => port.vertexIds))).toHaveProperty("size", 18);
    for (const port of first.ports) {
      expect(port.vertexIds).toHaveLength(2);
      expect(coastalPairs.has([...port.vertexIds].sort().join("|"))).toBe(true);
    }
  });

  it("wires standard ports into both demo and setup games", () => {
    expect(createScenarioGame().ports).toHaveLength(9);
    expect(createSetupGame().ports).toHaveLength(9);
  });

  it("derives 4:1, 3:1, and 2:1 ratios from buildings on either real port endpoint", () => {
    const base = { ...createScenarioGame(), buildings: [] };
    const generic = base.ports.find((port) => port.kind === "generic");
    const wood = base.ports.find(
      (port) => port.kind === "resource" && port.resource === "wood"
    );
    if (!generic || !wood) {
      throw new Error("Expected standard generic and wood ports.");
    }

    expect(getMaritimeTradeRatio(base, "p1", "wood")).toBe(4);
    const genericOwned = withPortBuilding(base, generic, 1);
    expect(getMaritimeTradeRatio(genericOwned, "p1", "wood")).toBe(3);
    const bothOwned = withPortBuilding(genericOwned, wood, 0);
    expect(getMaritimeTradeRatio(bothOwned, "p1", "wood")).toBe(2);
    expect(getMaritimeTradeRatio(bothOwned, "p1", "ore")).toBe(3);
    expect(getMaritimeTradeRatio(bothOwned, "p2", "wood")).toBe(4);
  });

  it("projects port connectors from the same shared board vertices and places labels seaward", () => {
    const { board, ports } = createBoardDataForSeed(portSeed);
    const port = ports[0];
    const projection = portProjection(board, port);
    const firstVertex = vertexProjection(board, port.vertexIds[0]);
    const secondVertex = vertexProjection(board, port.vertexIds[1]);
    const endpointMidpoint = {
      x: (firstVertex.x + secondVertex.x) / 2,
      y: (firstVertex.y + secondVertex.y) / 2
    };
    const distanceFromCenter = (point: { x: number; y: number }) =>
      Math.hypot(point.x - 450, point.y - 310);

    expect(projection.from).toEqual(firstVertex);
    expect(projection.to).toEqual(secondVertex);
    expect(distanceFromCenter(projection.label)).toBeGreaterThan(distanceFromCenter(endpointMidpoint));
  });
});
