import type { BoardEdge, BoardHex } from "./types";

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
}

export function createStandardBoardData(): StandardBoardData {
  const edges: BoardEdge[] = [];
  const board = terrainPlan.map((hex, index) => {
    const [q, r] = ringCoords[index];
    const vertexIds = Array.from({ length: 6 }, (_, vertexIndex) => `${hex.id}-v${vertexIndex}`);
    const edgeIds = Array.from({ length: 6 }, (_, edgeIndex) => `${hex.id}-e${edgeIndex}`);

    edgeIds.forEach((edgeId, edgeIndex) => {
      edges.push({
        id: edgeId,
        hexId: hex.id,
        vertexIds: [vertexIds[edgeIndex], vertexIds[(edgeIndex + 1) % vertexIds.length]]
      });
    });

    return {
      ...hex,
      q,
      r,
      vertexIds,
      edgeIds
    };
  });

  return { board, edges };
}

export function createStandardBoard(): BoardHex[] {
  return createStandardBoardData().board;
}
