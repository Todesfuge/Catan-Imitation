import type { ResourceCost } from "../domain/expansion/commerceGuild";
import type { MapSeed } from "../domain/mapSeed";
import type {
  Building,
  DevelopmentCard,
  GameMessageKey,
  GamePhase,
  PlayerId,
  ResourceMap,
  TurnPhase
} from "../domain/types";
import type { OnlineAllowedActions } from "./allowedActions";

export type RoomLifecycle = "lobby" | "playing" | "finished" | "expired";

export interface PublicSeatView {
  seatId: string;
  playerId?: PlayerId;
  nickname: string;
  ready: boolean;
}

export interface PublicPlayerView {
  playerId: PlayerId;
  color: string;
  resourceCardCount: number;
  developmentCardCount: number;
  visibleScore: number;
  guildTokens: number;
  vouchers: number;
  prizeCards: number;
  knightsPlayed: number;
}

export interface PublicLogEntry {
  id: string;
  messageKey?: GameMessageKey;
  params?: Record<string, string | number>;
}

export interface PublicPlayerTradeView {
  proposerId: PlayerId;
  offered: ResourceMap;
  requested: ResourceMap;
}

export interface PublicTurnView {
  phase: TurnPhase;
  awaitedPlayerIds: PlayerId[];
}

export interface PublicSetupView {
  order: PlayerId[];
  placementIndex: number;
  stage: "settlement" | "road";
  pendingSettlement?: {
    playerId: PlayerId;
    vertexId: string;
  };
}

export interface PublicGameView {
  phase: GamePhase;
  players: PublicPlayerView[];
  activePlayerId: PlayerId;
  turn: number;
  round: number;
  turnState: PublicTurnView;
  targetScore: number;
  mapSeed: MapSeed;
  buildings: Building[];
  roads: Array<{ ownerId: PlayerId; edgeId: string }>;
  robberHexId: string;
  bank: { resources: ResourceMap };
  log: PublicLogEntry[];
  developmentDeckCount: number;
  lastDice: { first: number; second: number; total: number } | null;
  pendingPlayerTrade?: PublicPlayerTradeView;
  setup?: PublicSetupView;
  winnerId?: PlayerId;
  largestArmyOwnerId?: PlayerId;
  longestRoadOwnerId?: PlayerId;
}

export interface PublicBlindBoxOutcomeView {
  kind: "resources" | "voucher" | "developmentCard";
  resourceCardCount?: number;
}

export interface PublicAuctionResultView {
  winnerId: PlayerId;
  winnerName: string;
  round: number;
  winningBid: number;
  outcome: PublicBlindBoxOutcomeView;
}

export interface PublicGuildView {
  tradeSlots: Array<{
    id: string;
    requires: ResourceCost;
    tokenReward: number;
  }>;
  usedTradePlayerIds: PlayerId[];
  gathering: {
    phase: "idle" | "redemption" | "auction" | "complete";
    auctionRound: number;
    auctionResults: PublicBlindBoxOutcomeView[];
    cooldownRemaining: number;
    lastAuctionResult?: PublicAuctionResultView;
  };
}

export interface PublicRoomState {
  roomCode: string;
  lifecycle: RoomLifecycle;
  roomVersion: number;
  hostSeatId?: string;
  seats: PublicSeatView[];
  game?: PublicGameView;
  guild?: PublicGuildView;
  submittedBidSeatIds: string[];
}

export type RequiredDecision =
  | { kind: "discardResources"; count: number }
  | { kind: "placeRobber" }
  | { kind: "chooseRobberVictim"; eligiblePlayerIds: PlayerId[] }
  | { kind: "placeFreeRoad"; remainingRoads: number }
  | { kind: "chooseYearOfPlentyResource"; remainingPicks: number }
  | { kind: "chooseMonopolyResource" };

export interface PrivateSeatState {
  seatId: string;
  playerId?: PlayerId;
  seatTokenPresent: true;
  canRestartMatch: boolean;
  resources?: ResourceMap;
  developmentCards?: DevelopmentCard[];
  ownPendingBid?: number;
  requiredDecision?: RequiredDecision;
}

export interface ProjectedRoomView {
  publicState: PublicRoomState;
  privateState: PrivateSeatState;
  allowedActions?: OnlineAllowedActions;
}
