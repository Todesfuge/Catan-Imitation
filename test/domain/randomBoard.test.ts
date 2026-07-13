import { describe, expect, it, vi } from "vitest";
import {
  STANDARD_HEX_COORDINATES,
  createStandardBoardData,
  type StandardBoardData
} from "../../src/domain/board";
import {
  LEGACY_STANDARD_MAP_SEED,
  formatM1MapSeed,
  parseMapSeed,
  type MapSeed
} from "../../src/domain/mapSeed";
import { createBoardDataForSeed } from "../../src/domain/randomBoard";
import { resources, type Resource, type Terrain } from "../../src/domain/types";

const GOLDEN_M1_SEEDS = [
  parseMapSeed("M1-0000000000000000"),
  parseMapSeed("M1-0123456789ABCDEF")
];

const EXPECTED_TERRAINS: Terrain[] = [
  "desert",
  "field",
  "field",
  "field",
  "field",
  "forest",
  "forest",
  "forest",
  "forest",
  "hill",
  "hill",
  "hill",
  "mountain",
  "mountain",
  "mountain",
  "pasture",
  "pasture",
  "pasture",
  "pasture"
];

const EXPECTED_NUMBERS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];

const RESOURCE_BY_TERRAIN: Record<Exclude<Terrain, "desert">, Resource> = {
  forest: "wood",
  hill: "brick",
  pasture: "wool",
  field: "grain",
  mountain: "ore"
};

function completeBoardJson(data: StandardBoardData): string {
  return JSON.stringify(data, null, 2);
}

function sortedPair(values: readonly string[]): string {
  return [...values].sort().join("|");
}

function topologyCounts(data: StandardBoardData) {
  return {
    hexes: data.board.length,
    vertices: new Set(data.board.flatMap((hex) => hex.vertexIds)).size,
    referencedEdges: new Set(data.board.flatMap((hex) => hex.edgeIds)).size,
    edges: data.edges.length
  };
}

function deriveHexAdjacency(data: StandardBoardData): Map<string, Set<string>> {
  const hexIdsByEdge = new Map<string, string[]>();
  for (const hex of data.board) {
    for (const edgeId of hex.edgeIds) {
      hexIdsByEdge.set(edgeId, [...(hexIdsByEdge.get(edgeId) ?? []), hex.id]);
    }
  }

  const adjacency = new Map(data.board.map((hex) => [hex.id, new Set<string>()]));
  for (const hexIds of hexIdsByEdge.values()) {
    if (hexIds.length === 2) {
      adjacency.get(hexIds[0])?.add(hexIds[1]);
      adjacency.get(hexIds[1])?.add(hexIds[0]);
    }
  }
  return adjacency;
}

function identifyCoastalEdgeOrder(data: StandardBoardData) {
  const edgeUse = new Map<string, number>();
  for (const hex of data.board) {
    for (const edgeId of hex.edgeIds) {
      edgeUse.set(edgeId, (edgeUse.get(edgeId) ?? 0) + 1);
    }
  }

  const coastal = data.edges.filter((edge) => edgeUse.get(edge.id) === 1);
  const byVertex = new Map<string, typeof coastal>();
  for (const edge of coastal) {
    for (const vertexId of edge.vertexIds) {
      byVertex.set(vertexId, [...(byVertex.get(vertexId) ?? []), edge]);
    }
  }

  const startVertex = [...byVertex.keys()].sort()[0];
  const ordered: typeof coastal = [];
  let currentVertex = startVertex;
  let previousEdgeId: string | undefined;
  do {
    const edge = (byVertex.get(currentVertex) ?? [])
      .filter((candidate) => candidate.id !== previousEdgeId)
      .sort((left, right) => left.id.localeCompare(right.id))[0];
    if (!edge) {
      throw new Error("Expected the standard coast to form one closed cycle.");
    }
    ordered.push(edge);
    previousEdgeId = edge.id;
    currentVertex = edge.vertexIds.find((vertexId) => vertexId !== currentVertex) ?? startVertex;
  } while (currentVertex !== startVertex && ordered.length <= coastal.length);

  return ordered;
}

function assertM1Invariants(seed: MapSeed): void {
  const data = createBoardDataForSeed(seed);
  const allVertexIds = data.board.flatMap((hex) => hex.vertexIds);
  const allReferencedEdgeIds = data.board.flatMap((hex) => hex.edgeIds);
  const adjacency = deriveHexAdjacency(data);
  const coastalEdges = identifyCoastalEdgeOrder(data);
  const coastalByVertices = new Map(
    coastalEdges.map((edge) => [sortedPair(edge.vertexIds), edge])
  );

  expect(topologyCounts(data)).toEqual({ hexes: 19, vertices: 54, referencedEdges: 72, edges: 72 });
  expect(new Set(data.board.map((hex) => hex.id)).size).toBe(19);
  expect(new Set(allVertexIds).size).toBe(54);
  expect(new Set(allReferencedEdgeIds).size).toBe(72);
  expect(new Set(data.edges.map((edge) => edge.id)).size).toBe(72);
  expect(new Set(data.ports.map((port) => port.id)).size).toBe(9);
  expect(data.board.map(({ q, r }) => [q, r])).toEqual(STANDARD_HEX_COORDINATES);
  expect(data.board.every((hex) => hex.vertexIds.length === 6 && hex.edgeIds.length === 6)).toBe(true);
  expect(data.edges.every((edge) => allReferencedEdgeIds.includes(edge.id))).toBe(true);

  expect(data.board.map((hex) => hex.terrain).sort()).toEqual(EXPECTED_TERRAINS);
  expect(
    data.board.filter((hex) => hex.diceNumber !== null).map((hex) => hex.diceNumber).sort((a, b) => a! - b!)
  ).toEqual(EXPECTED_NUMBERS);

  const desertHexes = data.board.filter((hex) => hex.terrain === "desert");
  expect(desertHexes).toHaveLength(1);
  expect(desertHexes[0]).toMatchObject({ resource: null, diceNumber: null });
  expect(desertHexes[0].id).toMatch(/^hex-\d{2}$/);
  for (const hex of data.board) {
    if (hex.terrain !== "desert") {
      expect(hex.resource).toBe(RESOURCE_BY_TERRAIN[hex.terrain]);
      expect(hex.diceNumber).not.toBeNull();
    }
  }

  const redHexes = data.board.filter((hex) => hex.diceNumber === 6 || hex.diceNumber === 8);
  expect(redHexes).toHaveLength(4);
  for (let leftIndex = 0; leftIndex < redHexes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < redHexes.length; rightIndex += 1) {
      expect(adjacency.get(redHexes[leftIndex].id)?.has(redHexes[rightIndex].id)).toBe(false);
    }
  }

  expect(coastalEdges).toHaveLength(30);
  expect(data.ports).toHaveLength(9);
  expect(data.ports.filter((port) => port.kind === "generic")).toHaveLength(4);
  expect(
    data.ports.filter((port) => port.kind === "resource").map((port) => port.resource).sort()
  ).toEqual([...resources].sort());
  expect(new Set(data.ports.flatMap((port) => port.vertexIds)).size).toBe(18);
  const portEdgeIds = data.ports.map((port) => {
    const edge = coastalByVertices.get(sortedPair(port.vertexIds));
    expect(edge).toBeDefined();
    expect(port.id).toBe(`port-${edge?.id}`);
    return edge?.id;
  });
  expect(new Set(portEdgeIds).size).toBe(9);
}

describe("bounded deterministic board generation", () => {
  it("reconstructs the complete released M0 board including legacy IDs", () => {
    const legacy = createBoardDataForSeed(LEGACY_STANDARD_MAP_SEED);

    expect(legacy).toEqual(createStandardBoardData());
    expect(completeBoardJson(legacy)).toMatchSnapshot();
  });

  it.each(GOLDEN_M1_SEEDS)("publishes the complete M1 layout for %s", (seed) => {
    expect(completeBoardJson(createBoardDataForSeed(seed))).toMatchSnapshot();
  });

  it("is byte-equivalent for repeated calls and does not consume ambient randomness", () => {
    const seed = parseMapSeed("M1-FEDCBA9876543210");
    const random = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("Map generation must not use Math.random().");
    });

    try {
      expect(completeBoardJson(createBoardDataForSeed(seed))).toBe(
        completeBoardJson(createBoardDataForSeed(seed))
      );
      expect(random).not.toHaveBeenCalled();
    } finally {
      random.mockRestore();
    }
  });

  it("varies terrain, number, and port positions for fixed verification seeds", () => {
    const first = createBoardDataForSeed(parseMapSeed("M1-0000000000000001"));
    const second = createBoardDataForSeed(parseMapSeed("M1-FFFFFFFFFFFFFFFE"));

    expect(first.board.map((hex) => hex.terrain)).not.toEqual(second.board.map((hex) => hex.terrain));
    expect(first.board.map((hex) => hex.diceNumber)).not.toEqual(
      second.board.map((hex) => hex.diceNumber)
    );
    expect(first.ports.map((port) => sortedPair(port.vertexIds))).not.toEqual(
      second.ports.map((port) => sortedPair(port.vertexIds))
    );
  });

  it("keeps every M1 identity geometry-derived and content-neutral", () => {
    const first = createBoardDataForSeed(parseMapSeed("M1-1111111111111111"));
    const second = createBoardDataForSeed(parseMapSeed("M1-2222222222222222"));
    const topology = (data: StandardBoardData) => ({
      board: data.board.map(({ id, q, r, vertexIds, edgeIds }) => ({ id, q, r, vertexIds, edgeIds })),
      edges: data.edges
    });

    expect(topology(first)).toEqual(topology(second));
    expect(first.board.every((hex) => /^hex-\d{2}$/.test(hex.id))).toBe(true);
    expect(first.board.flatMap((hex) => hex.vertexIds).every((id) => /^vertex-\d{2}$/.test(id))).toBe(true);
    expect(first.edges.every((edge) => /^edge-\d{2}$/.test(edge.id))).toBe(true);
    expect(first.ports.every((port) => /^port-edge-\d{2}$/.test(port.id))).toBe(true);
  });

  it("satisfies every topology, multiset, red-token, and port invariant for 1,000 seeds", () => {
    for (let index = 0; index < 1_000; index += 1) {
      assertM1Invariants(formatM1MapSeed((index * 0x9e37_79b9) >>> 0, index));
    }
  });
});
