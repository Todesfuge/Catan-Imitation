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
  offeredTokens?: number;
  requestedTokens?: number;
}

function getPlayer(game: GameState, playerId: PlayerId): Player {
  const player = game.players.find((candidate) => candidate.id === playerId);
  if (!player) {
    throw new RuleViolationError(`Unknown player: ${playerId}`);
  }
  return player;
}

export function getPlayerTradeBundleReason(bundle: ResourceMap, label: "Offered" | "Requested", tokens = 0): string | null {
  if (!Number.isSafeInteger(tokens) || tokens < 0 ||
      resources.some((resource) => !Number.isSafeInteger(bundle[resource]) || bundle[resource] < 0)) {
    return "Player trade quantities must be non-negative whole numbers.";
  }
  if (tokens === 0 && resources.every((resource) => bundle[resource] === 0)) {
    return `${label} bundle must contain at least one resource or token.`;
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
  requested: ResourceMap,
  offeredTokens = 0,
  requestedTokens = 0
): PlayerTradeOffer {
  const reason = getPlayerTradePublishReason(game, proposerId, offered, requested, offeredTokens, requestedTokens);
  if (reason) {
    throw new RuleViolationError(reason);
  }
  return {
    proposerId,
    offered: { ...offered },
    requested: { ...requested },
    ...(offeredTokens > 0 ? { offeredTokens } : {}),
    ...(requestedTokens > 0 ? { requestedTokens } : {})
  };
}

export function getPlayerTradePublishReason(
  game: GameState,
  proposerId: PlayerId,
  offered: ResourceMap,
  requested: ResourceMap,
  offeredTokens = 0,
  requestedTokens = 0
): string | null {
  if (game.phase !== "playing" || game.turnState.phase !== "action") {
    return "Player trades are available only during the action phase.";
  }
  if (game.activePlayerId !== proposerId) {
    return "Only the active player may publish a player trade.";
  }
  const offeredReason = getPlayerTradeBundleReason(offered, "Offered", offeredTokens);
  if (offeredReason) {
    return offeredReason;
  }
  const requestedReason = getPlayerTradeBundleReason(requested, "Requested", requestedTokens);
  if (requestedReason) {
    return requestedReason;
  }
  const proposer = getPlayer(game, proposerId);
  if (!canAfford(proposer.resources, offered)) {
    return "The active player cannot afford the offered resources.";
  }
  if (proposer.guildTokens < offeredTokens) {
    return "The active player cannot afford the offered tokens.";
  }
  return null;
}

export function getPlayerTradeAcceptanceReason(
  game: GameState,
  offer: PlayerTradeOffer,
  acceptingPlayerId: PlayerId
): string | null {
  const offeredTokens = offer.offeredTokens === undefined ? 0 : offer.offeredTokens;
  const requestedTokens = offer.requestedTokens === undefined ? 0 : offer.requestedTokens;
  const bundleReason = getPlayerTradeBundleReason(offer.offered, "Offered", offeredTokens) ??
    getPlayerTradeBundleReason(offer.requested, "Requested", requestedTokens);
  if (bundleReason) return bundleReason;
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
  if (proposer.guildTokens < offeredTokens) {
    return "The proposer can no longer afford the offered tokens.";
  }
  if (!canAfford(acceptingPlayer.resources, offer.requested)) {
    return `${acceptingPlayer.name} cannot afford the requested resources.`;
  }
  if (acceptingPlayer.guildTokens < requestedTokens) {
    return `${acceptingPlayer.name} cannot afford the requested tokens.`;
  }
  if (!Number.isSafeInteger(proposer.guildTokens - offeredTokens + requestedTokens) ||
      !Number.isSafeInteger(acceptingPlayer.guildTokens - requestedTokens + offeredTokens)) {
    return "Player trade token balances must remain safe whole numbers.";
  }
  return null;
}

export function acceptPlayerTrade(
  game: GameState,
  offer: PlayerTradeOffer,
  acceptingPlayerId: PlayerId
): GameState {
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
          guildTokens: player.guildTokens - (offer.offeredTokens ?? 0) + (offer.requestedTokens ?? 0),
          resources: addResourceMaps(
            subtractResourceMaps(player.resources, offer.offered),
            offer.requested
          )
        };
      }
      if (player.id === acceptingPlayerId) {
        return {
          ...player,
          guildTokens: player.guildTokens - (offer.requestedTokens ?? 0) + (offer.offeredTokens ?? 0),
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
