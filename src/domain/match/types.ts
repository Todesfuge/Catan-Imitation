import type { CommerceGuildState } from "../expansion/commerceGuild";
import type { PlayerTradeOffer } from "../rules/playerTrade";
import type { GameState } from "../types";
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
  nextLogId(): string;
  now(): number;
}
