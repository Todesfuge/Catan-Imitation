import {
  getActionAvailabilityFacts,
  type AvailabilityFact,
  type AvailabilityReason,
  type MatchActionAvailabilityFacts
} from "../app/actionAvailability";
import type { MatchState } from "../domain/match/types";
import type { PlayerId } from "../domain/types";

export interface OnlineAvailabilityContext {
  connectedSeatIds?: readonly string[];
}

export interface AllowedActionsSeatSource {
  seatId: string;
  playerId?: PlayerId;
}

export interface PendingSealedAuctionSource {
  round: number;
  bidsBySeatId: Readonly<Record<string, number>>;
}

export interface SealedBidAvailability {
  enabled: boolean;
  disabledReason?: AvailabilityReason;
  round: number;
  maxAmount: number;
  submitted: boolean;
}

export interface OnlineAllowedActions {
  turn: Pick<
    MatchActionAvailabilityFacts,
    | "roll"
    | "endTurn"
    | "road"
    | "settlement"
    | "city"
    | "buyDevelopmentCard"
    | "developmentCards"
  >;
  maritime: MatchActionAvailabilityFacts["maritime"];
  commerce: Omit<MatchActionAvailabilityFacts["commerce"], "gatheringPlayers">;
  setup: MatchActionAvailabilityFacts["setup"];
  decisions: MatchActionAvailabilityFacts["decisions"];
  publicTrade: MatchActionAvailabilityFacts["publicTrade"];
  sealedBid: SealedBidAvailability;
}

function awaitedPlayerIds(match: MatchState): PlayerId[] {
  const { game } = match;
  if (game.turnState.phase === "awaitingDiscards") {
    return Object.keys(game.turnState.pendingDiscards);
  }
  if (
    game.turnState.phase === "awaitingRobberPlacement" ||
    game.turnState.phase === "awaitingRobberVictim" ||
    game.turnState.phase === "awaitingDevelopmentEffect"
  ) {
    return [game.activePlayerId];
  }
  return [];
}

function waitingReason(
  match: MatchState,
  viewerPlayerId: PlayerId,
  seats: readonly AllowedActionsSeatSource[],
  context: OnlineAvailabilityContext
): AvailabilityReason | undefined {
  const awaited = awaitedPlayerIds(match);
  if (awaited.length === 0 || awaited.includes(viewerPlayerId)) return undefined;

  const connected = context.connectedSeatIds;
  if (connected) {
    const connectedSet = new Set(connected);
    const offlinePlayerIds = awaited.filter((playerId) => {
      const seat = seats.find((candidate) => candidate.playerId === playerId);
      return !seat || !connectedSet.has(seat.seatId);
    });
    if (offlinePlayerIds.length > 0) {
      return { code: "REQUIRED_PLAYER_OFFLINE", params: { playerIds: offlinePlayerIds } };
    }
  }

  return awaited.length === 1
    ? { code: "WAITING_FOR_ACTIVE_PLAYER", params: { playerId: awaited[0] } }
    : { code: "WAITING_FOR_REQUIRED_PLAYERS", params: { playerIds: awaited } };
}

function withWaitingReason<T extends AvailabilityFact<unknown>>(
  fact: T,
  reason: AvailabilityReason | undefined
): T {
  return fact.enabled || !reason ? fact : { ...fact, disabledReason: reason };
}

function applyWaitingReason(
  facts: MatchActionAvailabilityFacts,
  reason: AvailabilityReason | undefined
): MatchActionAvailabilityFacts {
  if (!reason) return facts;
  return {
    ...facts,
    roll: withWaitingReason(facts.roll, reason),
    endTurn: withWaitingReason(facts.endTurn, reason),
    road: withWaitingReason(facts.road, reason),
    settlement: withWaitingReason(facts.settlement, reason),
    city: withWaitingReason(facts.city, reason),
    buyDevelopmentCard: withWaitingReason(facts.buyDevelopmentCard, reason),
    developmentCards: facts.developmentCards.map((card) =>
      card.enabled ? card : { ...card, disabledReason: reason }
    ),
    maritime:
      facts.maritime.enabled || !reason
        ? facts.maritime
        : { ...facts.maritime, disabledReason: reason },
    commerce: {
      ...facts.commerce,
      tradeSlots: facts.commerce.tradeSlots.map((slot) => withWaitingReason(slot, reason)),
      transfer: withWaitingReason(facts.commerce.transfer, reason),
      redeemPrize: withWaitingReason(facts.commerce.redeemPrize, reason)
    },
    decisions: {
      discard: withWaitingReason(facts.decisions.discard, reason),
      robberHex: withWaitingReason(facts.decisions.robberHex, reason),
      robberVictim: withWaitingReason(facts.decisions.robberVictim, reason),
      freeRoad: withWaitingReason(facts.decisions.freeRoad, reason),
      yearOfPlenty: withWaitingReason(facts.decisions.yearOfPlenty, reason),
      monopoly: withWaitingReason(facts.decisions.monopoly, reason)
    }
  };
}

export function projectAllowedActions(
  match: MatchState,
  viewerSeat: AllowedActionsSeatSource,
  seats: readonly AllowedActionsSeatSource[],
  pendingAuction?: PendingSealedAuctionSource,
  context: OnlineAvailabilityContext = {}
): OnlineAllowedActions | undefined {
  if (!viewerSeat.playerId) return undefined;
  const player = match.game.players.find((candidate) => candidate.id === viewerSeat.playerId);
  if (!player) return undefined;

  const facts = applyWaitingReason(
    getActionAvailabilityFacts(match, player.id),
    waitingReason(match, player.id, seats, context)
  );
  const submitted = Boolean(
    pendingAuction && Object.hasOwn(pendingAuction.bidsBySeatId, viewerSeat.seatId)
  );
  const round = pendingAuction?.round ?? match.guild.gathering.auctionRound;
  const sealedBid: SealedBidAvailability = {
    enabled:
      match.game.phase === "playing" &&
      match.guild.gathering.phase === "auction" &&
      Boolean(pendingAuction) &&
      !submitted &&
      player.guildTokens > 0,
    round,
    maxAmount: player.guildTokens,
    submitted,
    ...(match.game.phase !== "playing" ||
    match.guild.gathering.phase !== "auction" ||
    !pendingAuction
      ? { disabledReason: { code: "AUCTION_NOT_OPEN" as const } }
      : submitted
        ? { disabledReason: { code: "BID_ALREADY_SUBMITTED" as const } }
        : player.guildTokens === 0
          ? { disabledReason: { code: "NO_GUILD_TOKENS" as const } }
          : {})
  };

  return {
    turn: {
      roll: facts.roll,
      endTurn: facts.endTurn,
      road: facts.road,
      settlement: facts.settlement,
      city: facts.city,
      buyDevelopmentCard: facts.buyDevelopmentCard,
      developmentCards: facts.developmentCards.filter((card) => card.count > 0)
    },
    maritime: facts.maritime,
    commerce: {
      tradeSlots: facts.commerce.tradeSlots,
      transfer: facts.commerce.transfer,
      startGathering: facts.commerce.startGathering,
      openAuction: facts.commerce.openAuction,
      redeemGathering: facts.commerce.redeemGathering,
      redeemPrize: facts.commerce.redeemPrize
    },
    setup: facts.setup,
    decisions: facts.decisions,
    publicTrade: facts.publicTrade,
    sealedBid
  };
}
