import type { BoardEdge, EdgeId, GameState, PlayerId, VertexId } from "../types";

function getPlayerRoadEdges(game: GameState, playerId: PlayerId): BoardEdge[] {
  const edgeById = new Map(game.edges.map((edge) => [edge.id, edge]));
  return game.roads
    .filter((road) => road.ownerId === playerId)
    .map((road) => edgeById.get(road.edgeId))
    .filter((edge): edge is BoardEdge => Boolean(edge));
}

function getBlockedVertices(game: GameState, playerId: PlayerId): Set<VertexId> {
  return new Set(
    game.buildings
      .filter((building) => building.ownerId !== playerId)
      .map((building) => building.vertexId)
  );
}

function buildAdjacency(edges: BoardEdge[]): Map<VertexId, Array<{ edgeId: EdgeId; to: VertexId }>> {
  const adjacency = new Map<VertexId, Array<{ edgeId: EdgeId; to: VertexId }>>();

  for (const edge of edges) {
    const [left, right] = edge.vertexIds;
    adjacency.set(left, [...(adjacency.get(left) ?? []), { edgeId: edge.id, to: right }]);
    adjacency.set(right, [...(adjacency.get(right) ?? []), { edgeId: edge.id, to: left }]);
  }

  return adjacency;
}

function walkLongest(
  adjacency: Map<VertexId, Array<{ edgeId: EdgeId; to: VertexId }>>,
  blockedVertices: Set<VertexId>,
  vertexId: VertexId,
  usedEdges: Set<EdgeId>
): number {
  if (usedEdges.size > 0 && blockedVertices.has(vertexId)) {
    return 0;
  }

  let best = 0;
  for (const next of adjacency.get(vertexId) ?? []) {
    if (usedEdges.has(next.edgeId)) {
      continue;
    }

    const nextUsedEdges = new Set(usedEdges);
    nextUsedEdges.add(next.edgeId);
    best = Math.max(best, 1 + walkLongest(adjacency, blockedVertices, next.to, nextUsedEdges));
  }

  return best;
}

export function calculateLongestRoadLength(game: GameState, playerId: PlayerId): number {
  const edges = getPlayerRoadEdges(game, playerId);
  if (edges.length === 0) {
    return 0;
  }

  const adjacency = buildAdjacency(edges);
  const blockedVertices = getBlockedVertices(game, playerId);
  let best = 0;

  for (const vertexId of adjacency.keys()) {
    best = Math.max(best, walkLongest(adjacency, blockedVertices, vertexId, new Set()));
  }

  return best;
}

export function updateLongestRoadAward(game: GameState): GameState {
  const lengths = new Map(
    game.players.map((player) => [player.id, calculateLongestRoadLength(game, player.id)])
  );
  const currentOwnerLength = game.longestRoadOwnerId ? lengths.get(game.longestRoadOwnerId) ?? 0 : 0;
  const leader = [...lengths.entries()].sort((left, right) => right[1] - left[1])[0];

  if (!leader || leader[1] < 5) {
    return game;
  }

  if (game.longestRoadOwnerId && leader[1] <= currentOwnerLength) {
    return game;
  }

  const tiedLeaders = [...lengths.values()].filter((length) => length === leader[1]).length;
  if (!game.longestRoadOwnerId && tiedLeaders > 1) {
    return game;
  }

  return {
    ...game,
    longestRoadOwnerId: leader[0]
  };
}
