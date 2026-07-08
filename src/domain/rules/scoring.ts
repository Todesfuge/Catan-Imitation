import type { GameState, PlayerId } from "../types";

export function calculatePlayerScore(game: GameState, playerId: PlayerId): number {
  const buildingScore = game.buildings
    .filter((building) => building.ownerId === playerId)
    .reduce((total, building) => total + (building.kind === "city" ? 2 : 1), 0);
  const player = game.players.find((candidate) => candidate.id === playerId);
  const developmentVictoryPoints =
    player?.developmentCards.filter((card) => card.kind === "victoryPoint").length ?? 0;
  const largestArmyScore = game.largestArmyOwnerId === playerId ? 2 : 0;
  const longestRoadScore = game.longestRoadOwnerId === playerId ? 2 : 0;

  return (
    buildingScore +
    (player?.prizeCards ?? 0) * 2 +
    developmentVictoryPoints +
    largestArmyScore +
    longestRoadScore
  );
}

export function getScores(game: GameState): Record<PlayerId, number> {
  return Object.fromEntries(
    game.players.map((player) => [player.id, calculatePlayerScore(game, player.id)])
  );
}
