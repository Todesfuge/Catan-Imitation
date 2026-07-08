import { buildCosts, canAfford } from "./building";
import {
  addResourceMaps,
  type DevelopmentCard,
  type DevelopmentCardKind,
  type GameState,
  type HexId,
  type Player,
  type PlayerId,
  type ResourceMap
} from "../types";

const standardDevelopmentCardKinds: DevelopmentCardKind[] = [
  ...Array.from({ length: 14 }, () => "knight" as const),
  ...Array.from({ length: 5 }, () => "victoryPoint" as const),
  "roadBuilding",
  "roadBuilding",
  "yearOfPlenty",
  "yearOfPlenty",
  "monopoly",
  "monopoly"
];

function subtractResources(left: ResourceMap, right: ResourceMap): ResourceMap {
  return {
    wood: left.wood - right.wood,
    brick: left.brick - right.brick,
    wool: left.wool - right.wool,
    grain: left.grain - right.grain,
    ore: left.ore - right.ore
  };
}

function getPlayer(game: GameState, playerId: PlayerId): Player {
  const player = game.players.find((candidate) => candidate.id === playerId);
  if (!player) {
    throw new Error(`Unknown player: ${playerId}`);
  }
  return player;
}

function updatePlayer(game: GameState, playerId: PlayerId, update: (player: Player) => Player): GameState {
  return {
    ...game,
    players: game.players.map((player) => (player.id === playerId ? update(player) : player))
  };
}

export function createDevelopmentDeck(kinds: DevelopmentCardKind[] = standardDevelopmentCardKinds): DevelopmentCard[] {
  return kinds.map((kind, index) => ({
    id: `dev-${index + 1}-${kind}`,
    kind,
    purchasedTurn: 0,
    revealed: false
  }));
}

export function buyDevelopmentCard(
  game: GameState,
  playerId: PlayerId
): { game: GameState; card: DevelopmentCard } {
  if (game.developmentDeck.length === 0) {
    throw new Error("Development card deck is empty.");
  }

  const player = getPlayer(game, playerId);
  if (!canAfford(player, buildCosts.developmentCard)) {
    throw new Error(`${player.name} cannot afford a development card.`);
  }

  const [drawn, ...remainingDeck] = game.developmentDeck;
  const card = {
    ...drawn,
    purchasedTurn: game.turn,
    revealed: false
  };

  return {
    card,
    game: {
      ...updatePlayer(game, playerId, (candidate) => ({
        ...candidate,
        resources: subtractResources(candidate.resources, buildCosts.developmentCard),
        developmentCards: [...candidate.developmentCards, card]
      })),
      developmentDeck: remainingDeck,
      bank: {
        resources: addResourceMaps(game.bank.resources, buildCosts.developmentCard)
      }
    }
  };
}

export function awardDevelopmentCardFromDeck(
  game: GameState,
  playerId: PlayerId
): { game: GameState; card: DevelopmentCard } {
  if (game.developmentDeck.length === 0) {
    throw new Error("Development card deck is empty.");
  }

  const [drawn, ...remainingDeck] = game.developmentDeck;
  const card = {
    ...drawn,
    purchasedTurn: game.turn,
    revealed: false
  };

  return {
    card,
    game: {
      ...updatePlayer(game, playerId, (candidate) => ({
        ...candidate,
        developmentCards: [...candidate.developmentCards, card]
      })),
      developmentDeck: remainingDeck
    }
  };
}

export function updateLargestArmyAward(game: GameState, candidatePlayerId: PlayerId): GameState {
  const candidate = getPlayer(game, candidatePlayerId);
  if (candidate.knightsPlayed < 3) {
    return game;
  }

  const currentOwner = game.largestArmyOwnerId
    ? game.players.find((player) => player.id === game.largestArmyOwnerId)
    : undefined;
  if (currentOwner && currentOwner.knightsPlayed >= candidate.knightsPlayed) {
    return game;
  }

  return {
    ...game,
    largestArmyOwnerId: candidatePlayerId
  };
}

export function playKnightCard(
  game: GameState,
  playerId: PlayerId,
  cardId: string,
  targetHexId: HexId
): GameState {
  const player = getPlayer(game, playerId);
  const card = player.developmentCards.find((candidate) => candidate.id === cardId);
  if (!card || card.kind !== "knight") {
    throw new Error("A knight card is required.");
  }

  if (card.purchasedTurn === game.turn) {
    throw new Error("Non-victory development cards cannot be played on the same turn they were purchased.");
  }

  const playedGame = updatePlayer(game, playerId, (candidate) => ({
    ...candidate,
    knightsPlayed: candidate.knightsPlayed + 1,
    developmentCards: candidate.developmentCards.filter((candidateCard) => candidateCard.id !== cardId)
  }));

  return updateLargestArmyAward(
    {
      ...playedGame,
      robberHexId: targetHexId
    },
    playerId
  );
}

export function createGuildDevelopmentCard(
  kind: DevelopmentCardKind,
  game: GameState,
  player: Player
): DevelopmentCard {
  return {
    id: `guild-dev-${game.turn}-${player.id}-${player.developmentCards.length + 1}`,
    kind,
    purchasedTurn: game.turn,
    revealed: false
  };
}
