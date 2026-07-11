import { createCommerceGuild } from "../domain/expansion/commerceGuild";
import type { MatchCommand, MatchExecutionContext, MatchState } from "../domain/match/types";
import type { RandomSource } from "../domain/match/random";
import { createDemoGame, defaultMatchSeats } from "../domain/setup";
import type { PlayerId } from "../domain/types";

export interface UiState {
  selectedDiceTotal: number;
  selectedPlayerId: PlayerId;
  notice: string | null;
}

export interface AppState extends MatchState, UiState {}

export type UiCommand =
  | { type: "SELECT_DICE_TOTAL"; diceTotal: number }
  | { type: "SELECT_PLAYER"; playerId: PlayerId };

export type GameCommand = MatchCommand | UiCommand;

class LocalRandomSource implements RandomSource {
  nextInt(maxExclusive: number): number {
    if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError("maxExclusive must be a positive safe integer.");
    }
    return Math.floor(Math.random() * maxExclusive);
  }
}

let logCounter = 0;

export const localMatchSeats = defaultMatchSeats;

export const localMatchExecutionContext: MatchExecutionContext = {
  random: new LocalRandomSource(),
  nextLogId: () => `log-${++logCounter}`,
  now: () => Date.now()
};

export function createUiState(selectedPlayerId: PlayerId): UiState {
  return {
    selectedDiceTotal: 8,
    selectedPlayerId,
    notice: null
  };
}

export function createInitialAppState(): AppState {
  const game = createDemoGame();
  return {
    game,
    guild: createCommerceGuild(),
    lastDice: null,
    ...createUiState(game.activePlayerId)
  };
}
