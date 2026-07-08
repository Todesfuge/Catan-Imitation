import {
  emptyResources,
  resources,
  type BoardHex,
  type GameState,
  type Player,
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

function totalResources(resourceMap: ResourceMap): number {
  return resources.reduce((total, resource) => total + resourceMap[resource], 0);
}

function discardOverLimit(player: Player): Player {
  const total = totalResources(player.resources);
  if (total <= 7) {
    return player;
  }

  let remainingDiscard = Math.floor(total / 2);
  const discarded = emptyResources();

  for (const resource of resources) {
    const amount = Math.min(player.resources[resource], remainingDiscard);
    discarded[resource] = amount;
    remainingDiscard -= amount;

    if (remainingDiscard === 0) {
      break;
    }
  }

  return {
    ...player,
    resources: subtractResources(player.resources, discarded)
  };
}

function getHex(game: GameState, hexId: string): BoardHex {
  const hex = game.board.find((candidate) => candidate.id === hexId);
  if (!hex) {
    throw new Error(`Unknown robber target hex: ${hexId}`);
  }
  return hex;
}

function getStealableCards(player: Player): Array<keyof ResourceMap> {
  return [...resources]
    .reverse()
    .flatMap((resource) => Array.from({ length: player.resources[resource] }, () => resource));
}

function isAdjacentToHex(game: GameState, playerId: PlayerId, hex: BoardHex): boolean {
  return game.buildings.some(
    (building) => building.ownerId === playerId && hex.vertexIds.includes(building.vertexId)
  );
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

export function resolveSevenRoll(
  game: GameState,
  targetHexId: string,
  stealFromPlayerId?: PlayerId,
  random: () => number = Math.random
): GameState {
  const targetHex = getHex(game, targetHexId);
  const discardedGame = {
    ...game,
    players: game.players.map(discardOverLimit),
    robberHexId: targetHex.id
  };

  if (!stealFromPlayerId) {
    return discardedGame;
  }

  const victim = discardedGame.players.find((player) => player.id === stealFromPlayerId);
  if (!victim || victim.id === discardedGame.activePlayerId) {
    throw new Error("Robber steal requires an adjacent opponent.");
  }

  if (!isAdjacentToHex(discardedGame, victim.id, targetHex)) {
    throw new Error("Robber steal target must have a building on the robber hex.");
  }

  const stealableCards = getStealableCards(victim);
  if (stealableCards.length === 0) {
    return discardedGame;
  }

  const stolenResource = stealableCards[Math.floor(random() * stealableCards.length)];

  return {
    ...discardedGame,
    players: discardedGame.players.map((player) => {
      if (player.id === victim.id) {
        return {
          ...player,
          resources: subtractResources(player.resources, { [stolenResource]: 1 })
        };
      }

      if (player.id === discardedGame.activePlayerId) {
        return {
          ...player,
          resources: addResources(player.resources, { [stolenResource]: 1 })
        };
      }

      return player;
    })
  };
}
