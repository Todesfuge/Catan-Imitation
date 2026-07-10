import {
  emptyResources,
  resources,
  type GameState,
  type Player,
  type PlayerId,
  type ProductionEvent,
  type ProductionResult,
  type ResourceMap
} from "../types";
import { RuleViolationError } from "../errors";

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

function addResources(left: ResourceMap, right: Partial<ResourceMap>): ResourceMap {
  return {
    wood: left.wood + (right.wood ?? 0),
    brick: left.brick + (right.brick ?? 0),
    wool: left.wool + (right.wool ?? 0),
    grain: left.grain + (right.grain ?? 0),
    ore: left.ore + (right.ore ?? 0)
  };
}

function subtractResources(left: ResourceMap, right: Partial<ResourceMap>): ResourceMap {
  return {
    wood: left.wood - (right.wood ?? 0),
    brick: left.brick - (right.brick ?? 0),
    wool: left.wool - (right.wool ?? 0),
    grain: left.grain - (right.grain ?? 0),
    ore: left.ore - (right.ore ?? 0)
  };
}

export function totalResources(resourceMap: ResourceMap): number {
  return resources.reduce((total, resource) => total + resourceMap[resource], 0);
}

function getStealableCards(player: Player): Array<keyof ResourceMap> {
  return [...resources]
    .reverse()
    .flatMap((resource) => Array.from({ length: player.resources[resource] }, () => resource));
}

export function applyProduction(
  game: GameState,
  diceTotal: number
): { game: GameState; events: ProductionEvent[] } {
  const production = collectProduction(game, diceTotal);
  const bank = { ...game.bank.resources };
  const playerGains = Object.fromEntries(
    game.players.map((player) => [player.id, emptyResources()])
  ) as Record<PlayerId, ResourceMap>;
  const paidEvents: ProductionEvent[] = [];

  for (const event of production.events) {
    const paidAmount = Math.min(event.amount, bank[event.resource]);
    if (paidAmount <= 0) {
      continue;
    }

    bank[event.resource] -= paidAmount;
    playerGains[event.playerId][event.resource] += paidAmount;
    paidEvents.push({
      ...event,
      amount: paidAmount
    });
  }

  return {
    game: {
      ...game,
      players: game.players.map((player) => ({
        ...player,
        resources: addResources(player.resources, playerGains[player.id])
      })),
      bank: {
        resources: bank
      }
    },
    events: paidEvents
  };
}

export function discardResourcesToBank(
  game: GameState,
  playerId: PlayerId,
  discarded: ResourceMap
): GameState {
  return {
    ...game,
    players: game.players.map((player) =>
      player.id === playerId
        ? { ...player, resources: subtractResources(player.resources, discarded) }
        : player
    ),
    bank: {
      resources: addResources(game.bank.resources, discarded)
    }
  };
}

export function stealRandomResource(
  game: GameState,
  fromPlayerId: PlayerId,
  toPlayerId: PlayerId,
  random: () => number = Math.random
): GameState {
  const victim = game.players.find((player) => player.id === fromPlayerId);
  if (!victim) {
    throw new RuleViolationError(`Unknown player: ${fromPlayerId}`);
  }

  if (!game.players.some((player) => player.id === toPlayerId)) {
    throw new RuleViolationError(`Unknown player: ${toPlayerId}`);
  }

  const stealableCards = getStealableCards(victim);
  if (stealableCards.length === 0) {
    throw new RuleViolationError("Robber victim has no resource cards to steal.");
  }

  const randomValue = random();
  if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
    throw new RuleViolationError("Random source must return a finite value from 0 inclusive to 1 exclusive.");
  }
  const stolenResource = stealableCards[Math.floor(randomValue * stealableCards.length)];

  return {
    ...game,
    players: game.players.map((player) => {
      if (player.id === victim.id) {
        return {
          ...player,
          resources: subtractResources(player.resources, { [stolenResource]: 1 })
        };
      }

      if (player.id === toPlayerId) {
        return {
          ...player,
          resources: addResources(player.resources, { [stolenResource]: 1 })
        };
      }

      return player;
    })
  };
}
