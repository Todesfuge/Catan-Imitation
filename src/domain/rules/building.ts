import {
  emptyResources,
  resources,
  type GameState,
  type Player,
  type PlayerId,
  type ResourceMap
} from "../types";

export const buildCosts = {
  road: { ...emptyResources(), wood: 1, brick: 1 },
  settlement: { ...emptyResources(), wood: 1, brick: 1, wool: 1, grain: 1 },
  city: { ...emptyResources(), grain: 2, ore: 3 },
  developmentCard: { ...emptyResources(), wool: 1, grain: 1, ore: 1 }
} satisfies Record<string, ResourceMap>;

function getPlayer(game: GameState, playerId: PlayerId): Player {
  const player = game.players.find((candidate) => candidate.id === playerId);
  if (!player) {
    throw new Error(`Unknown player: ${playerId}`);
  }
  return player;
}

export function canAfford(player: Player, cost: ResourceMap): boolean {
  return resources.every((resource) => player.resources[resource] >= cost[resource]);
}

function payCost(player: Player, cost: ResourceMap): Player {
  if (!canAfford(player, cost)) {
    throw new Error(`${player.name} cannot afford this build.`);
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

export function buildRoad(game: GameState, playerId: PlayerId, edgeId: string): GameState {
  getPlayer(game, playerId);
  if (game.roads.some((road) => road.edgeId === edgeId)) {
    throw new Error(`Road edge is already occupied: ${edgeId}`);
  }

  const paidGame = updatePlayer(game, playerId, (player) => payCost(player, buildCosts.road));
  return {
    ...paidGame,
    roads: [
      ...paidGame.roads,
      {
        id: `built-road-${playerId}-${edgeId}`,
        ownerId: playerId,
        edgeId
      }
    ]
  };
}

export function buildSettlement(game: GameState, playerId: PlayerId, vertexId: string): GameState {
  getPlayer(game, playerId);
  if (game.buildings.some((building) => building.vertexId === vertexId)) {
    throw new Error(`Building vertex is already occupied: ${vertexId}`);
  }

  const paidGame = updatePlayer(game, playerId, (player) => payCost(player, buildCosts.settlement));
  return {
    ...paidGame,
    buildings: [
      ...paidGame.buildings,
      {
        id: `built-settlement-${playerId}-${vertexId}`,
        ownerId: playerId,
        vertexId,
        kind: "settlement"
      }
    ]
  };
}

export function buildCity(game: GameState, playerId: PlayerId, buildingId: string): GameState {
  const building = game.buildings.find((candidate) => candidate.id === buildingId);
  if (!building || building.ownerId !== playerId || building.kind !== "settlement") {
    throw new Error("City upgrades require one of the player's settlements.");
  }

  const paidGame = updatePlayer(game, playerId, (player) => payCost(player, buildCosts.city));
  return {
    ...paidGame,
    buildings: paidGame.buildings.map((candidate) =>
      candidate.id === buildingId ? { ...candidate, kind: "city" } : candidate
    )
  };
}

