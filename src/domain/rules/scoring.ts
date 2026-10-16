import type { GameState, PlayerId } from "../types";

interface PublicScoreState {
  readonly buildings: readonly { readonly ownerId: PlayerId; readonly kind: "settlement" | "city" }[];
  readonly players: readonly { readonly id: PlayerId; readonly prizeCards: number }[];
  readonly largestArmyOwnerId?: PlayerId;
  readonly longestRoadOwnerId?: PlayerId;
}

export function calculatePublicScoreBreakdown(game: PublicScoreState, playerId: PlayerId) {
  const ownedBuildings = game.buildings.filter((building) => building.ownerId === playerId);
  const player = game.players.find((candidate) => candidate.id === playerId);
  const sources = {
    settlements: ownedBuildings.filter((building) => building.kind === "settlement").length,
    cities: ownedBuildings.filter((building) => building.kind === "city").length * 2,
    longestRoad: game.longestRoadOwnerId === playerId ? 2 : 0,
    largestArmy: game.largestArmyOwnerId === playerId ? 2 : 0,
    prizeCards: (player?.prizeCards ?? 0) * 2
  };
  return { ...sources, total: Object.values(sources).reduce((total, points) => total + points, 0) };
}

export function calculatePlayerScore(game: GameState, playerId: PlayerId): number {
  const player = game.players.find((candidate) => candidate.id === playerId);
  const hiddenVictoryPoints =
    player?.developmentCards.filter((card) => card.kind === "victoryPoint").length ?? 0;
  return calculatePublicPlayerScore(game, playerId) + hiddenVictoryPoints;
}

export function calculatePublicPlayerScore(game: PublicScoreState, playerId: PlayerId): number {
  return calculatePublicScoreBreakdown(game, playerId).total;
}

export function getScores(game: GameState): Record<PlayerId, number> {
  return Object.fromEntries(
    game.players.map((player) => [player.id, calculatePlayerScore(game, player.id)])
  );
}
