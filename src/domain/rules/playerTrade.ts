import { RuleViolationError } from "../errors";
import {
  addResourceMaps,
  resources,
  type GameState,
  type Player,
  type PlayerId,
  type ResourceMap
} from "../types";

export interface PlayerTradeOffer {
  proposerId: PlayerId;
  offered: ResourceMap;
  requested: ResourceMap;
}

function getPlayer(game: GameState, playerId: PlayerId): Player {
  const player = game.players.find((candidate) => candidate.id === playerId);
  if (!player) {
    throw new RuleViolationError(`Unknown player: ${playerId}`);
  }
  return player;
}

function getBundleReason(bundle: ResourceMap, label: "Offered" | "Requested"): string | null {
  if (resources.some((resource) => !Number.isInteger(bundle[resource]) || bundle[resource] < 0)) {
    return "Player trade quantities must be non-negative whole numbers.";
  }
  if (resources.every((resource) => bundle[resource] === 0)) {
    return `${label} bundle must contain at least one resource.`;
  }
  return null;
}

function canAfford(inventory: ResourceMap, cost: ResourceMap): boolean {
  return resources.every((resource) => inventory[resource] >= cost[resource]);
}

function subtractResourceMaps(left: ResourceMap, right: ResourceMap): ResourceMap {
  return {
    wood: left.wood - right.wood,
    brick: left.brick - right.brick,
    wool: left.wool - right.wool,
    grain: left.grain - right.grain,
    ore: left.ore - right.ore
  };
}

export function createPlayerTradeOffer(
  game: GameState,
  proposerId: PlayerId,
  offered: ResourceMap,
  requested: ResourceMap
): PlayerTradeOffer {
  const reason = getPlayerTradePublishReason(game, proposerId, offered, requested);
  if (reason) {
    throw new RuleViolationError(reason);
  }
  return {
    proposerId,
    offered: { ...offered },
    requested: { ...requested }
  };
}

export function getPlayerTradePublishReason(
  game: GameState,
  proposerId: PlayerId,
  offered: ResourceMap,
  requested: ResourceMap
): string | null {
  if (game.phase !== "playing" || game.turnState.phase !== "action") {
    return "Player trades are available only during the action phase.";
  }
  if (game.activePlayerId !== proposerId) {
    return "Only the active player may publish a player trade.";
  }
  const offeredReason = getBundleReason(offered, "Offered");
  if (offeredReason) {
    return offeredReason;
  }
  const requestedReason = getBundleReason(requested, "Requested");
  if (requestedReason) {
    return requestedReason;
  }
  const proposer = getPlayer(game, proposerId);
  if (!canAfford(proposer.resources, offered)) {
    return "The active player cannot afford the offered resources.";
  }
  return null;
}

export function getPlayerTradeAcceptanceReason(
  game: GameState,
  offer: PlayerTradeOffer,
  acceptingPlayerId: PlayerId
): string | null {
  if (game.phase !== "playing" || game.turnState.phase !== "action") {
    return "Player trades are available only during the action phase.";
  }
  if (game.activePlayerId !== offer.proposerId) {
    return "The player who published this offer is no longer active.";
  }
  const acceptingPlayer = game.players.find((player) => player.id === acceptingPlayerId);
  const proposer = game.players.find((player) => player.id === offer.proposerId);
  if (!acceptingPlayer || !proposer) {
    return "This trade references an unknown player.";
  }
  if (acceptingPlayerId === offer.proposerId) {
    return "The active player cannot accept their own offer.";
  }
  if (!canAfford(proposer.resources, offer.offered)) {
    return "The proposer can no longer afford the offered resources.";
  }
  if (!canAfford(acceptingPlayer.resources, offer.requested)) {
    return `${acceptingPlayer.name} cannot afford the requested resources.`;
  }
  return null;
}

export function acceptPlayerTrade(
  game: GameState,
  offer: PlayerTradeOffer,
  acceptingPlayerId: PlayerId
): GameState {
  const offeredReason = getBundleReason(offer.offered, "Offered");
  const requestedReason = getBundleReason(offer.requested, "Requested");
  if (offeredReason || requestedReason) {
    throw new RuleViolationError(offeredReason ?? requestedReason!);
  }
  const reason = getPlayerTradeAcceptanceReason(game, offer, acceptingPlayerId);
  if (reason) {
    throw new RuleViolationError(reason);
  }

  return {
    ...game,
    players: game.players.map((player) => {
      if (player.id === offer.proposerId) {
        return {
          ...player,
          resources: addResourceMaps(
            subtractResourceMaps(player.resources, offer.offered),
            offer.requested
          )
        };
      }
      if (player.id === acceptingPlayerId) {
        return {
          ...player,
          resources: addResourceMaps(
            subtractResourceMaps(player.resources, offer.requested),
            offer.offered
          )
        };
      }
      return player;
    })
  };
}
