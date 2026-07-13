import type {
  CommerceGuildState,
  ResourceCost
} from "../expansion/commerceGuild";
import type { PlayerTradeOffer } from "../rules/playerTrade";
import type {
  GameState,
  HexId,
  PlayerId,
  Resource,
  ResourceMap
} from "../types";
import type { MapSeed } from "../mapSeed";
import type { RandomSource } from "./random";

export interface DiceRoll {
  first: number;
  second: number;
  total: number;
}

export interface MatchState {
  game: GameState;
  guild: CommerceGuildState;
  lastDice: DiceRoll | null;
  pendingPlayerTrade?: PlayerTradeOffer;
}

export interface MatchExecutionContext {
  random: RandomSource;
  nextMapSeed(): MapSeed;
  nextLogId(): string;
  now(): number;
}

export type MapRestartMode = "fresh" | "sameMap";

export type MatchMapSelection =
  | { readonly kind: "fresh" }
  | { readonly kind: "seed"; readonly seed: MapSeed };

export type MatchCommand =
  | { type: "START_NEW_GAME"; mode: MapRestartMode }
  | { type: "PLACE_SETUP_SETTLEMENT"; playerId: PlayerId; vertexId: string }
  | { type: "PLACE_SETUP_ROAD"; playerId: PlayerId; edgeId: string }
  | { type: "ROLL_DICE"; playerId: PlayerId }
  | { type: "END_TURN"; playerId: PlayerId }
  | { type: "BUILD_ROAD"; playerId: PlayerId; edgeId: string }
  | { type: "BUILD_SETTLEMENT"; playerId: PlayerId; vertexId: string }
  | { type: "BUILD_CITY"; playerId: PlayerId; buildingId: string }
  | { type: "BUY_DEVELOPMENT_CARD"; playerId: PlayerId }
  | { type: "PLAY_DEVELOPMENT_CARD"; playerId: PlayerId; cardId: string }
  | { type: "PLAY_KNIGHT_CARD"; playerId: PlayerId; cardId: string }
  | { type: "PLACE_FREE_ROAD"; playerId: PlayerId; edgeId: string }
  | { type: "CHOOSE_YEAR_OF_PLENTY_RESOURCE"; playerId: PlayerId; resource: Resource }
  | { type: "CHOOSE_MONOPOLY_RESOURCE"; playerId: PlayerId; resource: Resource }
  | { type: "MARITIME_TRADE"; playerId: PlayerId; give: Resource; receive: Resource }
  | {
      type: "PUBLISH_PLAYER_TRADE";
      playerId: PlayerId;
      offered: ResourceMap;
      requested: ResourceMap;
    }
  | { type: "CANCEL_PLAYER_TRADE"; playerId: PlayerId }
  | { type: "ACCEPT_PLAYER_TRADE"; playerId: PlayerId }
  | { type: "DISCARD_FOR_SEVEN"; playerId: PlayerId; resources: ResourceMap }
  | { type: "PLACE_ROBBER"; playerId: PlayerId; hexId: HexId }
  | { type: "STEAL_ROBBER_RESOURCE"; playerId: PlayerId; victimId: PlayerId }
  | { type: "COMPLETE_TRADE_SLOT"; playerId: PlayerId; slotId: string }
  | { type: "TRANSFER_TOKENS"; fromPlayerId: PlayerId; toPlayerId: PlayerId; amount: number }
  | { type: "START_GATHERING" }
  | { type: "OPEN_AUCTION" }
  | { type: "REDEEM_GATHERING"; playerId: PlayerId; resources: ResourceCost }
  | { type: "RESOLVE_AUCTION"; bids: Record<PlayerId, number> }
  | { type: "REDEEM_PRIZE"; playerId: PlayerId };
