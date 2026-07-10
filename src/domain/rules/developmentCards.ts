import { buildCosts, canAfford } from "./building";
import { RuleViolationError } from "../errors";
import {
  addResourceMaps,
  emptyResources,
  resources,
  type DevelopmentCard,
  type DevelopmentCardKind,
  type GameState,
  type Player,
  type PlayerId,
  type Resource,
  type ResourceMap
} from "../types";
import {
  advanceYearOfPlentyEffect,
  completePendingDevelopmentEffect,
  getDevelopmentCardResumePhase,
  getPendingDevelopmentEffect,
  markDevelopmentCardPlayed
} from "./turnFlow";

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
    throw new RuleViolationError(`Unknown player: ${playerId}`);
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
    throw new RuleViolationError("Development card deck is empty.");
  }

  const player = getPlayer(game, playerId);
  if (!canAfford(player, buildCosts.developmentCard)) {
    throw new RuleViolationError(`${player.name} cannot afford a development card.`);
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
    throw new RuleViolationError("Development card deck is empty.");
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

export function playDevelopmentCard(
  game: GameState,
  playerId: PlayerId,
  cardId: string
): {
  game: GameState;
  card: DevelopmentCard & {
    kind: Exclude<DevelopmentCardKind, "victoryPoint">;
  };
  resumePhase: "awaitingRoll" | "action";
} {
  const resumePhase = getDevelopmentCardResumePhase(game, playerId);
  const player = getPlayer(game, playerId);
  const card = player.developmentCards.find((candidate) => candidate.id === cardId);
  if (!card) {
    throw new RuleViolationError("The selected development card is not owned by this player.");
  }
  if (card.kind === "victoryPoint") {
    throw new RuleViolationError("Victory-point development cards remain hidden and are not played.");
  }
  if (card.purchasedTurn === game.turn) {
    throw new RuleViolationError("Non-victory development cards cannot be played on the same turn they were purchased.");
  }
  const playableCard = { ...card, kind: card.kind };

  const consumedGame = markDevelopmentCardPlayed(
    updatePlayer(game, playerId, (candidate) => ({
      ...candidate,
      developmentCards: candidate.developmentCards.filter(
        (candidateCard) => candidateCard.id !== cardId
      )
    }))
  );
  const resolvedGame =
    card.kind === "knight"
      ? updateLargestArmyAward(
          updatePlayer(consumedGame, playerId, (candidate) => ({
            ...candidate,
            knightsPlayed: candidate.knightsPlayed + 1
          })),
          playerId
        )
      : consumedGame;

  return {
    card: playableCard,
    resumePhase,
    game: resolvedGame
  };
}

export function playKnightCard(
  game: GameState,
  playerId: PlayerId,
  cardId: string
): GameState {
  const player = getPlayer(game, playerId);
  const card = player.developmentCards.find((candidate) => candidate.id === cardId);
  if (!card || card.kind !== "knight") {
    throw new RuleViolationError("A knight card is required.");
  }
  return playDevelopmentCard(game, playerId, cardId).game;
}

export function chooseYearOfPlentyResource(
  game: GameState,
  playerId: PlayerId,
  resource: Resource
): GameState {
  getPendingDevelopmentEffect(game, playerId, "yearOfPlenty");
  if (!resources.includes(resource)) {
    throw new RuleViolationError(`Unknown Year of Plenty resource: ${resource}`);
  }
  if (game.bank.resources[resource] < 1) {
    throw new RuleViolationError(`The bank has no ${resource} available for Year of Plenty.`);
  }

  const gained = { ...emptyResources(), [resource]: 1 };
  const transferredGame = {
    ...updatePlayer(game, playerId, (player) => ({
      ...player,
      resources: addResourceMaps(player.resources, gained)
    })),
    bank: {
      resources: subtractResources(game.bank.resources, gained)
    }
  };
  const hasBankStock = resources.some(
    (candidateResource) => transferredGame.bank.resources[candidateResource] > 0
  );
  return advanceYearOfPlentyEffect(transferredGame, playerId, hasBankStock);
}

export function chooseMonopolyResource(
  game: GameState,
  playerId: PlayerId,
  resource: Resource
): GameState {
  getPendingDevelopmentEffect(game, playerId, "monopoly");
  if (!resources.includes(resource)) {
    throw new RuleViolationError(`Unknown Monopoly resource: ${resource}`);
  }

  const collected = game.players.reduce(
    (total, player) =>
      player.id === playerId ? total : total + player.resources[resource],
    0
  );
  const transferredGame = {
    ...game,
    players: game.players.map((player) => ({
      ...player,
      resources: {
        ...player.resources,
        [resource]: player.id === playerId ? player.resources[resource] + collected : 0
      }
    }))
  };
  return completePendingDevelopmentEffect(transferredGame);
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
