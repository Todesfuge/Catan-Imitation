import { describe, expect, it } from "vitest";
import { parseMapSeed } from "../../src/domain/mapSeed";
import { createBoardDataForSeed } from "../../src/domain/randomBoard";
import {
  boardViewBox,
  edgeProjection,
  hexCenterPoint,
  hexPolygonPoints,
  vertexProjection
} from "../../src/ui/boardGeometry";

const geometrySeed = parseMapSeed("M1-1234567890ABCDEF");

describe("board SVG geometry", () => {
  it("projects neighboring hexes onto a shared vertex point", () => {
    const { board } = createBoardDataForSeed(geometrySeed);
    const first = board[0];
    const second = board.find(
      (hex) => hex.id !== first.id && hex.vertexIds.some((vertexId) => first.vertexIds.includes(vertexId))
    );

    if (!first || !second) {
      throw new Error("Expected neighboring standard board hexes to exist.");
    }

    const sharedVertexId = first.vertexIds.find((vertexId) => second.vertexIds.includes(vertexId));

    if (!sharedVertexId) {
      throw new Error("Expected selected neighboring hexes to share a vertex.");
    }

    const fromFirst = hexPolygonPoints(first).find(
      (point) => point.vertexId === sharedVertexId
    );
    const projected = vertexProjection(board, sharedVertexId);

    expect(fromFirst).toEqual(projected);
  });

  it("projects roads exactly between the shared board vertices", () => {
    const { board, edges } = createBoardDataForSeed(geometrySeed);
    const roadEdge = edges[0];
    const projected = edgeProjection(board, roadEdge);
    const from = vertexProjection(board, roadEdge.vertexIds[0]);
    const to = vertexProjection(board, roadEdge.vertexIds[1]);

    expect(projected.from).toEqual(from);
    expect(projected.to).toEqual(to);
  });

  it("keeps all rendered hex centers inside the board viewbox", () => {
    const { board } = createBoardDataForSeed(geometrySeed);

    for (const hex of board) {
      const center = hexCenterPoint(hex);

      expect(center.x).toBeGreaterThan(0);
      expect(center.y).toBeGreaterThan(0);
      expect(center.x).toBeLessThan(boardViewBox.width);
      expect(center.y).toBeLessThan(boardViewBox.height);
    }
  });
});
