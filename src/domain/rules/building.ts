import {
  addResourceMaps,
  emptyResources,
  resources,
  type BoardEdge,
  type EdgeId,
  type GameState,
  type Player,
  type PlayerId,
  type ResourceMap,
  type VertexId
} from "../types";
import { RuleViolationError } from "../errors";

export const buildCosts = {
  road: { ...emptyResources(), wood: 1, brick: 1 },
  settlement: { ...emptyResources(), wood: 1, brick: 1, wool: 1, grain: 1 },
  city: { ...emptyResources(), grain: 2, ore: 3 },
  developmentCard: { ...emptyResources(), wool: 1, grain: 1, ore: 1 }
} satisfies Record<string, ResourceMap>;

function getPlayer(game: GameState, playerId: PlayerId): Player {
  const player = game.players.find((candidate) => candidate.id === playerId);
  if (!player) {
    throw new RuleViolationError(`Unknown player: ${playerId}`);
  }
  return player;
}

export function canAfford(player: Player, cost: ResourceMap): boolean {
  return resources.every((resource) => player.resources[resource] >= cost[resource]);
}

function payCost(player: Player, cost: ResourceMap): Player {
  if (!canAfford(player, cost)) {
    throw new RuleViolationError(`${player.name} cannot afford this build.`);
  }

  return {
    ...player,
    resources: {
      wood: player.resources.wood - cost.wood,
      brick: player.resources.brick - cost.brick,
      wool: player.resources.wool - cost.wool,
      grain: player.resources.grain - cost.grain,
      ore: player.resources.ore - cost.ore
    }
  };
}

function updatePlayer(game: GameState, playerId: PlayerId, update: (player: Player) => Player): GameState {
  return {
    ...game,
    players: game.players.map((player) => (player.id === playerId ? update(player) : player))
  };
}

function payBuildCost(game: GameState, playerId: PlayerId, cost: ResourceMap): GameState {
  const paidGame = updatePlayer(game, playerId, (player) => payCost(player, cost));
  return {
    ...paidGame,
    bank: {
      resources: addResourceMaps(paidGame.bank.resources, cost)
    }
  };
}

function getEdge(game: GameState, edgeId: EdgeId): BoardEdge | undefined {
  return game.edges.find((edge) => edge.id === edgeId);
}

function isVertexOccupied(game: GameState, vertexId: VertexId): boolean {
  return game.buildings.some((building) => building.vertexId === vertexId);
}

function isBoardVertex(game: GameState, vertexId: VertexId): boolean {
  return game.board.some((hex) => hex.vertexIds.includes(vertexId));
}

function getAdjacentVertexIds(game: GameState, vertexId: VertexId): Set<VertexId> {
  const adjacent = new Set<VertexId>();

  for (const edge of game.edges) {
    if (!edge.vertexIds.includes(vertexId)) {
      continue;
    }

    for (const candidate of edge.vertexIds) {
      if (candidate !== vertexId) {
        adjacent.add(candidate);
      }
    }
  }

  return adjacent;
}

function hasAdjacentBuilding(game: GameState, vertexId: VertexId): boolean {
  const adjacent = getAdjacentVertexIds(game, vertexId);
  return game.buildings.some((building) => adjacent.has(building.vertexId));
}

function isConnectedToOwnedRoad(
  game: GameState,
  playerId: PlayerId,
  vertexId: VertexId
): boolean {
  return game.roads.some((road) => {
    if (road.ownerId !== playerId) {
      return false;
    }
    return getEdge(game, road.edgeId)?.vertexIds.includes(vertexId) ?? false;
  });
}

function assertSettlementLocation(game: GameState, vertexId: VertexId): void {
  if (!isBoardVertex(game, vertexId)) {
    throw new RuleViolationError(`Settlement must be placed on a board vertex: ${vertexId}`);
  }

  if (isVertexOccupied(game, vertexId)) {
    throw new RuleViolationError(`Building vertex is already occupied: ${vertexId}`);
  }

  if (hasAdjacentBuilding(game, vertexId)) {
    throw new RuleViolationError(`Settlement violates distance rule at vertex: ${vertexId}`);
  }
}

function edgeConnectsToOwnedPiece(game: GameState, playerId: PlayerId, edge: BoardEdge): boolean {
  const endpointIds = new Set(edge.vertexIds);
  const touchesOwnedBuilding = game.buildings.some(
    (building) => building.ownerId === playerId && endpointIds.has(building.vertexId)
  );
  if (touchesOwnedBuilding) {
    return true;
  }

  return game.roads.some((road) => {
    if (road.ownerId !== playerId) {
      return false;
    }

    const ownedEdge = getEdge(game, road.edgeId);
    return (
      ownedEdge?.vertexIds.some(
        (vertexId) =>
          endpointIds.has(vertexId) &&
          !game.buildings.some(
            (building) => building.vertexId === vertexId && building.ownerId !== playerId
          )
      ) ?? false
    );
  });
}

function assertRoadLocation(game: GameState, playerId: PlayerId, edgeId: EdgeId): BoardEdge {
  const edge = getEdge(game, edgeId);
  if (!edge) {
    throw new RuleViolationError(`Road must connect to an owned building or road: ${edgeId}`);
  }

  if (game.roads.some((road) => road.edgeId === edgeId)) {
    throw new RuleViolationError(`Road edge is already occupied: ${edgeId}`);
  }

  if (!edgeConnectsToOwnedPiece(game, playerId, edge)) {
    throw new RuleViolationError(`Road must connect to an owned building or road: ${edgeId}`);
  }

  return edge;
}

function addRoad(game: GameState, playerId: PlayerId, edgeId: EdgeId, prefix = "built-road"): GameState {
  return {
    ...game,
    roads: [
      ...game.roads,
      {
        id: `${prefix}-${playerId}-${edgeId}`,
        ownerId: playerId,
        edgeId
      }
    ]
  };
}

function addSettlement(game: GameState, playerId: PlayerId, vertexId: VertexId, prefix = "built-settlement"): GameState {
  return {
    ...game,
    buildings: [
      ...game.buildings,
      {
        id: `${prefix}-${playerId}-${vertexId}`,
        ownerId: playerId,
        vertexId,
        kind: "settlement"
      }
    ]
  };
}

export function buildRoad(game: GameState, playerId: PlayerId, edgeId: EdgeId): GameState {
  if (game.phase === "setup") {
    throw new RuleViolationError("Use setup placement during setup.");
  }
  getPlayer(game, playerId);
  assertRoadLocation(game, playerId, edgeId);

  const paidGame = payBuildCost(game, playerId, buildCosts.road);
  return addRoad(paidGame, playerId, edgeId);
}

export function getLegalRoadEdgeIds(game: GameState, playerId: PlayerId): EdgeId[] {
  getPlayer(game, playerId);
  return game.edges
    .filter(
      (edge) =>
        !game.roads.some((road) => road.edgeId === edge.id) &&
        edgeConnectsToOwnedPiece(game, playerId, edge)
    )
    .map((edge) => edge.id);
}

export function getLegalSettlementVertexIds(
  game: GameState,
  playerId: PlayerId
): VertexId[] {
  getPlayer(game, playerId);
  const vertexIds = new Set(game.board.flatMap((hex) => hex.vertexIds));
  return [...vertexIds].filter(
    (vertexId) =>
      !isVertexOccupied(game, vertexId) &&
      !hasAdjacentBuilding(game, vertexId) &&
      isConnectedToOwnedRoad(game, playerId, vertexId)
  );
}

export function getUpgradeableBuildingIds(game: GameState, playerId: PlayerId): string[] {
  getPlayer(game, playerId);
  return game.buildings
    .filter((building) => building.ownerId === playerId && building.kind === "settlement")
    .map((building) => building.id);
}

export function getLegalSetupSettlementVertexIds(
  game: GameState,
  playerId: PlayerId
): VertexId[] {
  if (
    game.phase !== "setup" ||
    game.setup?.stage !== "settlement" ||
    game.activePlayerId !== playerId ||
    game.setup.order[game.setup.placementIndex] !== playerId
  ) {
    return [];
  }
  getPlayer(game, playerId);
  const vertexIds = new Set(game.board.flatMap((hex) => hex.vertexIds));
  return [...vertexIds].filter(
    (vertexId) => !isVertexOccupied(game, vertexId) && !hasAdjacentBuilding(game, vertexId)
  );
}

export function getLegalSetupRoadEdgeIds(
  game: GameState,
  playerId: PlayerId
): EdgeId[] {
  const pendingVertexId = game.setup?.pendingSettlement?.vertexId;
  if (
    game.phase !== "setup" ||
    game.setup?.stage !== "road" ||
    game.activePlayerId !== playerId ||
    game.setup.pendingSettlement?.playerId !== playerId ||
    !pendingVertexId
  ) {
    return [];
  }
  getPlayer(game, playerId);
  return game.edges
    .filter(
      (edge) =>
        edge.vertexIds.includes(pendingVertexId) &&
        !game.roads.some((road) => road.edgeId === edge.id)
    )
    .map((edge) => edge.id);
}

export function placeFreeRoad(game: GameState, playerId: PlayerId, edgeId: EdgeId): GameState {
  if (game.phase !== "playing") {
    throw new RuleViolationError("A free road can only be placed during normal play.");
  }
  getPlayer(game, playerId);
  assertRoadLocation(game, playerId, edgeId);
  return addRoad(game, playerId, edgeId, "free-road");
}

export function buildSettlement(game: GameState, playerId: PlayerId, vertexId: VertexId): GameState {
  if (game.phase === "setup") {
    throw new RuleViolationError("Use setup placement during setup.");
  }
  getPlayer(game, playerId);
  assertSettlementLocation(game, vertexId);
  if (!isConnectedToOwnedRoad(game, playerId, vertexId)) {
    throw new RuleViolationError("A normal settlement must connect to one of the player's roads.");
  }

  const paidGame = payBuildCost(game, playerId, buildCosts.settlement);
  return addSettlement(paidGame, playerId, vertexId);
}

export function buildCity(game: GameState, playerId: PlayerId, buildingId: string): GameState {
  const building = game.buildings.find((candidate) => candidate.id === buildingId);
  if (!building || building.ownerId !== playerId || building.kind !== "settlement") {
    throw new RuleViolationError("City upgrades require one of the player's settlements.");
  }

  const paidGame = payBuildCost(game, playerId, buildCosts.city);
  return {
    ...paidGame,
    buildings: paidGame.buildings.map((candidate) =>
      candidate.id === buildingId ? { ...candidate, kind: "city" } : candidate
    )
  };
}

export function placeSetupSettlement(
  game: GameState,
  playerId: PlayerId,
  vertexId: VertexId
): GameState {
  if (game.phase !== "setup" || !game.setup) {
    throw new RuleViolationError("Setup settlement placement is only available during setup.");
  }

  if (game.setup.stage !== "settlement") {
    throw new RuleViolationError("A setup road must be placed before the next settlement.");
  }

  if (game.activePlayerId !== playerId || game.setup.order[game.setup.placementIndex] !== playerId) {
    throw new RuleViolationError("It is not this player's setup placement.");
  }

  getPlayer(game, playerId);
  assertSettlementLocation(game, vertexId);

  return {
    ...addSettlement(game, playerId, vertexId, "setup-settlement"),
    setup: {
      ...game.setup,
      stage: "road",
      pendingSettlement: {
        playerId,
        vertexId
      }
    }
  };
}

export function placeSetupRoad(game: GameState, playerId: PlayerId, edgeId: EdgeId): GameState {
  if (game.phase !== "setup" || !game.setup) {
    throw new RuleViolationError("Setup road placement is only available during setup.");
  }

  if (game.setup.stage !== "road" || game.setup.pendingSettlement?.playerId !== playerId) {
    throw new RuleViolationError("A setup settlement must be placed before its road.");
  }

  if (game.activePlayerId !== playerId) {
    throw new RuleViolationError("It is not this player's setup placement.");
  }

  const edge = getEdge(game, edgeId);
  if (!edge || !edge.vertexIds.includes(game.setup.pendingSettlement.vertexId)) {
    throw new RuleViolationError(`Setup road must touch the just-placed settlement: ${edgeId}`);
  }

  if (game.roads.some((road) => road.edgeId === edgeId)) {
    throw new RuleViolationError(`Road edge is already occupied: ${edgeId}`);
  }

  const roadGame = addRoad(game, playerId, edgeId, "setup-road");
  const nextPlacementIndex = game.setup.placementIndex + 1;

  if (nextPlacementIndex >= game.setup.order.length) {
    return {
      ...roadGame,
      phase: "playing",
      activePlayerId: game.setup.order[0],
      setup: undefined
    };
  }

  return {
    ...roadGame,
    activePlayerId: game.setup.order[nextPlacementIndex],
    setup: {
      order: game.setup.order,
      placementIndex: nextPlacementIndex,
      stage: "settlement"
    }
  };
}
