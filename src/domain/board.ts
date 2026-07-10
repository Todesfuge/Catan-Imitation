import type { BoardEdge, BoardHex, MaritimePort, Resource } from "./types";

const ringCoords = [
  [0, -2],
  [1, -2],
  [2, -2],
  [-1, -1],
  [0, -1],
  [1, -1],
  [2, -1],
  [-2, 0],
  [-1, 0],
  [0, 0],
  [1, 0],
  [2, 0],
  [-2, 1],
  [-1, 1],
  [0, 1],
  [1, 1],
  [-2, 2],
  [-1, 2],
  [0, 2]
] as const;

const terrainPlan: Array<Pick<BoardHex, "id" | "terrain" | "resource" | "diceNumber">> = [
  { id: "forest-4", terrain: "forest", resource: "wood", diceNumber: 4 },
  { id: "mountain-8", terrain: "mountain", resource: "ore", diceNumber: 8 },
  { id: "pasture-5", terrain: "pasture", resource: "wool", diceNumber: 5 },
  { id: "field-11-a", terrain: "field", resource: "grain", diceNumber: 11 },
  { id: "field-3", terrain: "field", resource: "grain", diceNumber: 3 },
  { id: "mountain-10", terrain: "mountain", resource: "ore", diceNumber: 10 },
  { id: "pasture-2", terrain: "pasture", resource: "wool", diceNumber: 2 },
  { id: "forest-12", terrain: "forest", resource: "wood", diceNumber: 12 },
  { id: "pasture-8", terrain: "pasture", resource: "wool", diceNumber: 8 },
  { id: "hill-11", terrain: "hill", resource: "brick", diceNumber: 11 },
  { id: "forest-9", terrain: "forest", resource: "wood", diceNumber: 9 },
  { id: "field-6", terrain: "field", resource: "grain", diceNumber: 6 },
  { id: "mountain-9", terrain: "mountain", resource: "ore", diceNumber: 9 },
  { id: "hill-5", terrain: "hill", resource: "brick", diceNumber: 5 },
  { id: "hill-4", terrain: "hill", resource: "brick", diceNumber: 4 },
  { id: "field-3-b", terrain: "field", resource: "grain", diceNumber: 3 },
  { id: "pasture-10", terrain: "pasture", resource: "wool", diceNumber: 10 },
  { id: "pasture-6", terrain: "pasture", resource: "wool", diceNumber: 6 },
  { id: "desert", terrain: "desert", resource: null, diceNumber: null }
];

export interface StandardBoardData {
  board: BoardHex[];
  edges: BoardEdge[];
  ports: MaritimePort[];
}

const geometryScale = {
  centerQx: 3464,
  centerRx: 1732,
  centerRy: 3000,
  cornerOffsets: [
    [0, -2000],
    [1732, -1000],
    [1732, 1000],
    [0, 2000],
    [-1732, 1000],
    [-1732, -1000]
  ]
} as const;

function centerPoint(q: number, r: number) {
  return {
    x: q * geometryScale.centerQx + r * geometryScale.centerRx,
    y: r * geometryScale.centerRy
  };
}

function vertexKey(q: number, r: number, vertexIndex: number): string {
  const center = centerPoint(q, r);
  const [offsetX, offsetY] = geometryScale.cornerOffsets[vertexIndex];
  return `${center.x + offsetX}:${center.y + offsetY}`;
}

function edgeKey(leftVertexId: string, rightVertexId: string): string {
  return [leftVertexId, rightVertexId].sort().join("|");
}

function orderCoastalEdges(board: BoardHex[], edges: BoardEdge[]): BoardEdge[] {
  const edgeUse = new Map<string, number>();
  for (const hex of board) {
    for (const edgeId of hex.edgeIds) {
      edgeUse.set(edgeId, (edgeUse.get(edgeId) ?? 0) + 1);
    }
  }
  const coastalEdges = edges.filter((edge) => edgeUse.get(edge.id) === 1);
  const byVertex = new Map<string, BoardEdge[]>();
  for (const edge of coastalEdges) {
    for (const vertexId of edge.vertexIds) {
      byVertex.set(vertexId, [...(byVertex.get(vertexId) ?? []), edge]);
    }
  }

  const startVertex = [...byVertex.keys()].sort()[0];
  const ordered: BoardEdge[] = [];
  let currentVertex = startVertex;
  let previousEdgeId: string | undefined;
  do {
    const candidates = (byVertex.get(currentVertex) ?? [])
      .filter((edge) => edge.id !== previousEdgeId)
      .sort((left, right) => left.id.localeCompare(right.id));
    const edge = candidates[0];
    if (!edge) {
      throw new Error("Standard coastal edges must form one closed boundary.");
    }
    ordered.push(edge);
    previousEdgeId = edge.id;
    currentVertex = edge.vertexIds.find((vertexId) => vertexId !== currentVertex) ?? startVertex;
  } while (currentVertex !== startVertex && ordered.length <= coastalEdges.length);

  if (ordered.length !== coastalEdges.length) {
    throw new Error("Standard coastal boundary traversal did not include every edge.");
  }
  return ordered;
}

function createStandardPorts(board: BoardHex[], edges: BoardEdge[]): MaritimePort[] {
  const coastalEdges = orderCoastalEdges(board, edges);
  const portEdgeIndices = [0, 3, 6, 10, 13, 16, 20, 23, 26];
  const portKinds: Array<{ kind: "generic" } | { kind: "resource"; resource: Resource }> = [
    { kind: "generic" },
    { kind: "resource", resource: "wood" },
    { kind: "generic" },
    { kind: "resource", resource: "brick" },
    { kind: "resource", resource: "wool" },
    { kind: "generic" },
    { kind: "resource", resource: "grain" },
    { kind: "generic" },
    { kind: "resource", resource: "ore" }
  ];

  return portEdgeIndices.map((edgeIndex, index) => {
    const edge = coastalEdges[edgeIndex];
    const portKind = portKinds[index];
    return {
      id: `standard-port-${index + 1}`,
      ...portKind,
      vertexIds: [...edge.vertexIds]
    };
  });
}

export function createStandardBoardData(): StandardBoardData {
  const edges: BoardEdge[] = [];
  const vertexIdsByKey = new Map<string, string>();
  const edgeIdsByKey = new Map<string, string>();
  const board = terrainPlan.map((hex, index) => {
    const [q, r] = ringCoords[index];
    const vertexIds = Array.from({ length: 6 }, (_, vertexIndex) => {
      const key = vertexKey(q, r, vertexIndex);
      const existingVertexId = vertexIdsByKey.get(key);
      if (existingVertexId) {
        return existingVertexId;
      }

      const vertexId = `${hex.id}-v${vertexIndex}`;
      vertexIdsByKey.set(key, vertexId);
      return vertexId;
    });

    const edgeIds = vertexIds.map((leftVertexId, edgeIndex) => {
      const rightVertexId = vertexIds[(edgeIndex + 1) % vertexIds.length];
      const key = edgeKey(leftVertexId, rightVertexId);
      const existingEdgeId = edgeIdsByKey.get(key);
      if (existingEdgeId) {
        return existingEdgeId;
      }

      const edgeId = `${hex.id}-e${edgeIndex}`;
      edgeIdsByKey.set(key, edgeId);
      edges.push({
        id: edgeId,
        hexId: hex.id,
        vertexIds: [leftVertexId, rightVertexId]
      });
      return edgeId;
    });

    return {
      ...hex,
      q,
      r,
      vertexIds,
      edgeIds
    };
  });

  return { board, edges, ports: createStandardPorts(board, edges) };
}

export function createStandardBoard(): BoardHex[] {
  return createStandardBoardData().board;
}
