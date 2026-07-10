import {
  resources,
  type GameState,
  type HexId,
  type PendingDevelopmentEffect,
  type PlayerId,
  type ResourceMap,
  type TurnState
} from "../types";
import { RuleViolationError } from "../errors";
import { discardResourcesToBank, stealRandomResource, totalResources } from "./production";

export function createAwaitingRollTurnState(): TurnState {
  return { phase: "awaitingRoll", pendingDiscards: {}, developmentCardPlayed: false };
}

export function assertGameInProgress(game: GameState): void {
  if (game.phase === "setup") {
    throw new RuleViolationError("This action is unavailable during setup.");
  }

  if (game.phase === "gameOver") {
    throw new RuleViolationError("The game is already over.");
  }
}

export function assertActivePlayer(game: GameState, playerId: PlayerId): void {
  assertGameInProgress(game);
  if (game.activePlayerId !== playerId) {
    throw new RuleViolationError("Only the active player may perform this action.");
  }
}

export function assertCanRoll(game: GameState, playerId: PlayerId): void {
  assertActivePlayer(game, playerId);
  if (game.turnState.phase !== "awaitingRoll") {
    throw new RuleViolationError("The active player has already rolled this turn.");
  }
}

export function assertCanUseTurnAction(game: GameState, playerId: PlayerId): void {
  assertActivePlayer(game, playerId);
  if (game.turnState.phase !== "action") {
    throw new RuleViolationError("Roll the dice before using normal turn actions.");
  }
}

export function assertCanPlayKnight(game: GameState, playerId: PlayerId): void {
  assertCanPlayDevelopmentCard(game, playerId);
}

export function assertCanPlayDevelopmentCard(game: GameState, playerId: PlayerId): void {
  assertActivePlayer(game, playerId);
  if (game.turnState.phase !== "awaitingRoll" && game.turnState.phase !== "action") {
    throw new RuleViolationError("A development card cannot be played during the current turn phase.");
  }
  if (game.turnState.developmentCardPlayed) {
    throw new RuleViolationError("Only one non-victory development card may be played per turn.");
  }
}

export function getKnightResumePhase(
  game: GameState,
  playerId: PlayerId
): "awaitingRoll" | "action" {
  assertCanPlayKnight(game, playerId);
  return game.turnState.phase as "awaitingRoll" | "action";
}

export function getDevelopmentCardResumePhase(
  game: GameState,
  playerId: PlayerId
): "awaitingRoll" | "action" {
  assertCanPlayDevelopmentCard(game, playerId);
  return game.turnState.phase as "awaitingRoll" | "action";
}

function resumeTurnPhase(
  game: GameState,
  phase: "awaitingRoll" | "action"
): GameState {
  return {
    ...game,
    turnState: {
      phase,
      pendingDiscards: {},
      developmentCardPlayed: game.turnState.developmentCardPlayed ?? false
    }
  };
}

export function enterActionPhase(game: GameState): GameState {
  return resumeTurnPhase(game, "action");
}

function beginRobberPlacement(
  game: GameState,
  source: "seven" | "knight",
  resumePhase: "awaitingRoll" | "action"
): GameState {
  return {
    ...game,
    turnState: {
      phase: "awaitingRobberPlacement",
      pendingDiscards: {},
      pendingRobber: {
        source,
        resumePhase,
        eligibleVictimIds: []
      },
      developmentCardPlayed: game.turnState.developmentCardPlayed ?? false
    }
  };
}

export function beginSevenRoll(game: GameState): GameState {
  const pendingDiscards = Object.fromEntries(
    game.players
      .map((player) => [player.id, Math.floor(totalResources(player.resources) / 2)] as const)
      .filter(([, count]) => count > 3)
  ) as Partial<Record<PlayerId, number>>;

  if (Object.keys(pendingDiscards).length === 0) {
    return beginRobberPlacement(game, "seven", "action");
  }

  return {
    ...game,
    turnState: {
      phase: "awaitingDiscards",
      pendingDiscards,
      developmentCardPlayed: game.turnState.developmentCardPlayed ?? false
    }
  };
}

export function submitSevenDiscard(
  game: GameState,
  playerId: PlayerId,
  discarded: ResourceMap
): GameState {
  assertGameInProgress(game);
  if (game.turnState.phase !== "awaitingDiscards") {
    throw new RuleViolationError("No seven-roll discards are currently pending.");
  }

  const required = game.turnState.pendingDiscards[playerId];
  if (!required) {
    throw new RuleViolationError("This player does not owe a seven-roll discard.");
  }

  const player = game.players.find((candidate) => candidate.id === playerId);
  if (!player) {
    throw new RuleViolationError(`Unknown player: ${playerId}`);
  }

  if (resources.some((resource) => !Number.isInteger(discarded[resource]) || discarded[resource] < 0)) {
    throw new RuleViolationError("Discard quantities must be non-negative whole numbers.");
  }

  if (resources.some((resource) => discarded[resource] > player.resources[resource])) {
    throw new RuleViolationError("A player cannot discard more resources than they hold.");
  }

  if (totalResources(discarded) !== required) {
    throw new RuleViolationError(`This player must discard exactly ${required} resource cards.`);
  }

  const discardedGame = discardResourcesToBank(game, playerId, discarded);
  const { [playerId]: _completed, ...pendingDiscards } = game.turnState.pendingDiscards;
  if (Object.keys(pendingDiscards).length === 0) {
    return beginRobberPlacement(discardedGame, "seven", "action");
  }

  return {
    ...discardedGame,
    turnState: {
      phase: "awaitingDiscards",
      pendingDiscards,
      developmentCardPlayed: game.turnState.developmentCardPlayed ?? false
    }
  };
}

export function beginKnightRobber(
  game: GameState,
  resumePhase: "awaitingRoll" | "action"
): GameState {
  return beginRobberPlacement(game, "knight", resumePhase);
}

function resumeAfterRobber(game: GameState): GameState {
  const resumePhase = game.turnState.pendingRobber?.resumePhase;
  if (!resumePhase) {
    throw new RuleViolationError("No robber interaction is pending.");
  }
  return resumeTurnPhase(game, resumePhase);
}

export function markDevelopmentCardPlayed(game: GameState): GameState {
  return {
    ...game,
    turnState: {
      ...game.turnState,
      developmentCardPlayed: true
    }
  };
}

export function beginPendingDevelopmentEffect(
  game: GameState,
  playerId: PlayerId,
  kind: "roadBuilding" | "yearOfPlenty" | "monopoly",
  resumePhase: "awaitingRoll" | "action"
): GameState {
  const pendingDevelopmentEffect: PendingDevelopmentEffect =
    kind === "roadBuilding"
      ? { kind, playerId, remainingRoads: 2, resumePhase }
      : kind === "yearOfPlenty"
        ? { kind, playerId, remainingPicks: 2, resumePhase }
        : { kind, playerId, resumePhase };

  return {
    ...game,
    turnState: {
      phase: "awaitingDevelopmentEffect",
      pendingDiscards: {},
      pendingDevelopmentEffect,
      developmentCardPlayed: true
    }
  };
}

export function getPendingDevelopmentEffect(
  game: GameState,
  playerId: PlayerId,
  kind: PendingDevelopmentEffect["kind"]
): PendingDevelopmentEffect {
  assertActivePlayer(game, playerId);
  const effect = game.turnState.pendingDevelopmentEffect;
  if (
    game.turnState.phase !== "awaitingDevelopmentEffect" ||
    !effect ||
    effect.playerId !== playerId ||
    effect.kind !== kind
  ) {
    throw new RuleViolationError(`No ${kind} development-card effect is pending.`);
  }
  return effect;
}

export function completePendingDevelopmentEffect(game: GameState): GameState {
  const effect = game.turnState.pendingDevelopmentEffect;
  if (game.turnState.phase !== "awaitingDevelopmentEffect" || !effect) {
    throw new RuleViolationError("No development-card effect is pending.");
  }
  return resumeTurnPhase(game, effect.resumePhase);
}

export function advanceRoadBuildingEffect(
  game: GameState,
  playerId: PlayerId,
  hasAnotherLegalRoad: boolean
): GameState {
  const effect = getPendingDevelopmentEffect(game, playerId, "roadBuilding");
  if (effect.kind !== "roadBuilding") {
    throw new RuleViolationError("No Road Building effect is pending.");
  }
  if (effect.remainingRoads <= 1 || !hasAnotherLegalRoad) {
    return completePendingDevelopmentEffect(game);
  }
  return {
    ...game,
    turnState: {
      ...game.turnState,
      pendingDevelopmentEffect: {
        ...effect,
        remainingRoads: effect.remainingRoads - 1
      }
    }
  };
}

export function advanceYearOfPlentyEffect(
  game: GameState,
  playerId: PlayerId,
  hasBankStock: boolean
): GameState {
  const effect = getPendingDevelopmentEffect(game, playerId, "yearOfPlenty");
  if (effect.kind !== "yearOfPlenty") {
    throw new RuleViolationError("No Year of Plenty effect is pending.");
  }
  if (effect.remainingPicks <= 1 || !hasBankStock) {
    return completePendingDevelopmentEffect(game);
  }
  return {
    ...game,
    turnState: {
      ...game.turnState,
      pendingDevelopmentEffect: {
        ...effect,
        remainingPicks: effect.remainingPicks - 1
      }
    }
  };
}

export function placePendingRobber(game: GameState, playerId: PlayerId, hexId: HexId): GameState {
  assertActivePlayer(game, playerId);
  if (game.turnState.phase !== "awaitingRobberPlacement" || !game.turnState.pendingRobber) {
    throw new RuleViolationError("The robber cannot be moved during the current turn phase.");
  }

  const targetHex = game.board.find((hex) => hex.id === hexId);
  if (!targetHex) {
    throw new RuleViolationError(`Unknown robber target hex: ${hexId}`);
  }
  if (hexId === game.robberHexId) {
    throw new RuleViolationError("The robber must move to a different hex.");
  }

  const eligibleVictimIds = game.players
    .filter(
      (player) =>
        player.id !== playerId &&
        totalResources(player.resources) > 0 &&
        game.buildings.some(
          (building) =>
            building.ownerId === player.id && targetHex.vertexIds.includes(building.vertexId)
        )
    )
    .map((player) => player.id);
  const movedGame = { ...game, robberHexId: hexId };

  if (eligibleVictimIds.length === 0) {
    return resumeAfterRobber(movedGame);
  }

  return {
    ...movedGame,
    turnState: {
      ...game.turnState,
      phase: "awaitingRobberVictim",
      pendingRobber: {
        ...game.turnState.pendingRobber,
        targetHexId: hexId,
        eligibleVictimIds
      }
    }
  };
}

export function stealPendingRobberResource(
  game: GameState,
  playerId: PlayerId,
  victimId: PlayerId,
  random: () => number = Math.random
): GameState {
  assertActivePlayer(game, playerId);
  if (game.turnState.phase !== "awaitingRobberVictim" || !game.turnState.pendingRobber) {
    throw new RuleViolationError("No robber victim selection is pending.");
  }
  if (!game.turnState.pendingRobber.eligibleVictimIds.includes(victimId)) {
    throw new RuleViolationError("The selected player is not an eligible robber victim.");
  }

  return resumeAfterRobber(stealRandomResource(game, victimId, playerId, random));
}

export function resetTurnFlow(game: GameState): GameState {
  return {
    ...game,
    turnState: createAwaitingRollTurnState()
  };
}
