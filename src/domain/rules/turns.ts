import type { GameState, PlayerId } from "../types";

export function getNextPlayerId(game: GameState): PlayerId {
  const activeIndex = game.players.findIndex((player) => player.id === game.activePlayerId);
  const nextIndex = activeIndex === -1 ? 0 : (activeIndex + 1) % game.players.length;
  return game.players[nextIndex].id;
}

export function advanceTurn(game: GameState): GameState {
  const activeIndex = game.players.findIndex((player) => player.id === game.activePlayerId);
  const nextIndex = activeIndex === -1 ? 0 : (activeIndex + 1) % game.players.length;
  const wrapped = nextIndex === 0;

  return {
    ...game,
    activePlayerId: game.players[nextIndex].id,
    turn: game.turn + 1,
    round: wrapped ? game.round + 1 : game.round
  };
}

