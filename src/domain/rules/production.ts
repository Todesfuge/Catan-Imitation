import {
  emptyResources,
  type GameState,
  type PlayerId,
  type ProductionEvent,
  type ProductionResult,
  type ResourceMap
} from "../types";

function createPlayerResourceIndex(game: GameState): Record<PlayerId, ResourceMap> {
  return Object.fromEntries(
    game.players.map((player) => [player.id, emptyResources()])
  ) as Record<PlayerId, ResourceMap>;
}

export function collectProduction(game: GameState, diceTotal: number): ProductionResult {
  const byPlayer = createPlayerResourceIndex(game);
  const events: ProductionEvent[] = [];

  for (const hex of game.board) {
    if (hex.diceNumber !== diceTotal || hex.resource === null || hex.id === game.robberHexId) {
      continue;
    }

    const adjacentBuildings = game.buildings.filter((building) =>
      hex.vertexIds.includes(building.vertexId)
    );

    for (const building of adjacentBuildings) {
      const amount = building.kind === "city" ? 2 : 1;
      byPlayer[building.ownerId][hex.resource] += amount;
      events.push({
        playerId: building.ownerId,
        hexId: hex.id,
        resource: hex.resource,
        amount,
        buildingId: building.id
      });
    }
  }

  return { byPlayer, events };
}

