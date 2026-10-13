import type { GameState } from "./types";

export const MAX_GAME_LOG_ENTRIES = 200;

export function limitGameLog(game: GameState): GameState {
  return game.log.length <= MAX_GAME_LOG_ENTRIES
    ? game
    : { ...game, log: game.log.slice(0, MAX_GAME_LOG_ENTRIES) };
}
