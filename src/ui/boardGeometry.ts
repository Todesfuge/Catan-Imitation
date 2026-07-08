import type { BoardEdge, BoardHex, VertexId } from "../domain/types";

export interface BoardPoint {
  x: number;
  y: number;
}

export interface BoardVertexPoint extends BoardPoint {
  vertexId: VertexId;
}

export const boardViewBox = {
  width: 900,
  height: 620
} as const;

const hexRadius = 58;
const centerOrigin = {
  x: boardViewBox.width / 2,
  y: boardViewBox.height / 2 - 10
} as const;

function roundCoordinate(value: number) {
  return Math.round(value * 10) / 10;
}

export function hexCenterPoint(hex: Pick<BoardHex, "q" | "r">): BoardPoint {
  return {
    x: roundCoordinate(centerOrigin.x + Math.sqrt(3) * hexRadius * (hex.q + hex.r / 2)),
    y: roundCoordinate(centerOrigin.y + 1.5 * hexRadius * hex.r)
  };
}

function hexCornerPoint(hex: BoardHex, vertexIndex: number): BoardVertexPoint {
  const center = hexCenterPoint(hex);
  const angle = ((vertexIndex * 60 - 90) * Math.PI) / 180;

  return {
    vertexId: hex.vertexIds[vertexIndex],
    x: roundCoordinate(center.x + Math.cos(angle) * hexRadius),
    y: roundCoordinate(center.y + Math.sin(angle) * hexRadius)
  };
}

export function hexPolygonPoints(hex: BoardHex): BoardVertexPoint[] {
  return hex.vertexIds.map((_, vertexIndex) => hexCornerPoint(hex, vertexIndex));
}

export function pointsAttribute(points: BoardPoint[]) {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

export function vertexProjection(hexes: BoardHex[], vertexId: VertexId): BoardVertexPoint {
  const hex = hexes.find((candidate) => candidate.vertexIds.includes(vertexId));

  if (!hex) {
    throw new Error(`Unknown board vertex: ${vertexId}`);
  }

  return hexCornerPoint(hex, hex.vertexIds.indexOf(vertexId));
}

export function edgeProjection(hexes: BoardHex[], edge: BoardEdge) {
  return {
    from: vertexProjection(hexes, edge.vertexIds[0]),
    to: vertexProjection(hexes, edge.vertexIds[1])
  };
}
