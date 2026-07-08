import { describe, expect, it } from "vitest";
import { createStandardBoardData } from "../../src/domain/board";
import {
  boardViewBox,
  edgeProjection,
  hexCenterPoint,
  hexPolygonPoints,
  vertexProjection
} from "../../src/ui/boardGeometry";

describe("board SVG geometry", () => {
  it("projects neighboring hexes onto a shared vertex point", () => {
    const { board } = createStandardBoardData();
    const first = board.find((hex) => hex.id === "forest-4");
    const second = board.find((hex) => hex.id === "field-11-a");

    if (!first || !second) {
      throw new Error("Expected demo board hexes to exist.");
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
    const { board, edges } = createStandardBoardData();
    const roadEdge = edges[0];
    const projected = edgeProjection(board, roadEdge);
    const from = vertexProjection(board, roadEdge.vertexIds[0]);
    const to = vertexProjection(board, roadEdge.vertexIds[1]);

    expect(projected.from).toEqual(from);
    expect(projected.to).toEqual(to);
  });

  it("keeps all rendered hex centers inside the board viewbox", () => {
    const { board } = createStandardBoardData();

    for (const hex of board) {
      const center = hexCenterPoint(hex);

      expect(center.x).toBeGreaterThan(0);
      expect(center.y).toBeGreaterThan(0);
      expect(center.x).toBeLessThan(boardViewBox.width);
      expect(center.y).toBeLessThan(boardViewBox.height);
    }
  });
});
