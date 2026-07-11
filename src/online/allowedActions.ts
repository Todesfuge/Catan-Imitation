import {
  getOnlineActionAvailabilityFacts,
  type MatchActionAvailabilityFacts,
  type SealedBidAvailabilityFact
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
  sealedBid: SealedBidAvailabilityFact;
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

  const connectedPlayerIds = context.connectedSeatIds?.flatMap((seatId) => {
    const connectedSeat = seats.find((candidate) => candidate.seatId === seatId);
    return connectedSeat?.playerId ? [connectedSeat.playerId] : [];
  });
  const facts = getOnlineActionAvailabilityFacts(match, player.id, {
    ...(connectedPlayerIds ? { connectedPlayerIds } : {}),
    ...(pendingAuction
      ? {
          sealedBid: {
            round: pendingAuction.round,
            submitted: Object.hasOwn(pendingAuction.bidsBySeatId, viewerSeat.seatId)
          }
        }
      : {})
  });

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
    sealedBid: facts.sealedBid
  };
}
