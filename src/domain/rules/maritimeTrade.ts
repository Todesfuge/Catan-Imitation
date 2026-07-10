import {
  addResourceMaps,
  emptyResources,
  resources,
  type GameState,
  type MaritimePort,
  type Player,
  type PlayerId,
  type Resource,
  type ResourceMap
} from "../types";
import { RuleViolationError } from "../errors";

function subtractResources(left: ResourceMap, right: ResourceMap): ResourceMap {
  return {
    wood: left.wood - right.wood,
    brick: left.brick - right.brick,
    wool: left.wool - right.wool,
    grain: left.grain - right.grain,
    ore: left.ore - right.ore
  };
}

function getPlayer(game: GameState, playerId: PlayerId): Player {
  const player = game.players.find((candidate) => candidate.id === playerId);
  if (!player) {
    throw new RuleViolationError(`Unknown player: ${playerId}`);
  }
  return player;
}

function playerOwnsPort(game: GameState, playerId: PlayerId, port: MaritimePort): boolean {
  return game.buildings.some(
    (building) => building.ownerId === playerId && port.vertexIds.includes(building.vertexId)
  );
}

function getTradeRatio(game: GameState, playerId: PlayerId, give: Resource): number {
  const ownedPorts = game.ports.filter((port) => playerOwnsPort(game, playerId, port));
  if (ownedPorts.some((port) => port.kind === "resource" && port.resource === give)) {
    return 2;
  }
  if (ownedPorts.some((port) => port.kind === "generic")) {
    return 3;
  }
  return 4;
}

export function maritimeTrade(
  game: GameState,
  playerId: PlayerId,
  give: Resource,
  receive: Resource
): GameState {
  if (give === receive) {
    throw new RuleViolationError("Maritime trade must exchange two different resources.");
  }

  const player = getPlayer(game, playerId);
  const ratio = getTradeRatio(game, playerId, give);
  if (player.resources[give] < ratio) {
    if (ratio === 4 && player.resources[give] >= 2) {
      throw new RuleViolationError("A better maritime trade ratio requires an owned port.");
    }
    throw new RuleViolationError("Player does not have enough resources for this maritime trade.");
  }

  if (game.bank.resources[receive] < 1) {
    throw new RuleViolationError(`Bank has no ${receive} available for maritime trade.`);
  }

  const paid = { ...emptyResources(), [give]: ratio };
  const gained = { ...emptyResources(), [receive]: 1 };

  return {
    ...game,
    players: game.players.map((candidate) =>
      candidate.id === playerId
        ? {
            ...candidate,
            resources: addResourceMaps(subtractResources(candidate.resources, paid), gained)
          }
        : candidate
    ),
    bank: {
      resources: addResourceMaps(subtractResources(game.bank.resources, gained), paid)
    }
  };
}

export function getMaritimeTradeRatio(game: GameState, playerId: PlayerId, give: Resource): number {
  if (!resources.includes(give)) {
    throw new RuleViolationError(`Unknown resource: ${give}`);
  }
  getPlayer(game, playerId);
  return getTradeRatio(game, playerId, give);
}
