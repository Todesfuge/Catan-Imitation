import {
  createInitialGatheringCooldown,
  createPostGatheringCooldown
} from "../../src/domain/expansion/commerceGuild";
import { LEGACY_STANDARD_MAP_SEED, parseMapSeed } from "../../src/domain/mapSeed";
import type { MatchState } from "../../src/domain/match/types";
import { matchesBoardDataForSeed } from "../../src/domain/randomBoard";
import { resources } from "../../src/domain/types";

type UnknownRecord = Record<string, unknown>;

const gamePhases = new Set(["setup", "playing", "gameOver"]);
const turnPhases = new Set([
  "awaitingRoll",
  "awaitingDiscards",
  "awaitingRobberPlacement",
  "awaitingRobberVictim",
  "awaitingDevelopmentEffect",
  "action"
]);
const developmentCardKinds = new Set([
  "knight",
  "victoryPoint",
  "roadBuilding",
  "yearOfPlenty",
  "monopoly"
]);
const gatheringPhases = new Set(["idle", "redemption", "auction", "complete"]);
const gameMessageKeys = new Set([
  "game.welcome",
  "setup.started",
  "setup.newGameStarted",
  "dice.rolled",
  "robber.sevenRolled",
  "robber.discardCompleted",
  "robber.moved",
  "robber.stolen",
  "development.played",
  "development.bought",
  "development.knightPlayed",
  "development.freeRoadPlaced",
  "development.yearOfPlentyLog",
  "development.monopolyLog",
  "trade.maritime",
  "trade.player.published",
  "trade.player.cancelled",
  "trade.player.accepted",
  "guild.gatheringAutoStarted",
  "guild.slotCompleted",
  "guild.tokensTransferred",
  "guild.gatheringStarted",
  "guild.auctionOpened",
  "guild.auctionNoEligibleBidders",
  "guild.auctionRoundNoBids",
  "guild.redeemedResources",
  "guild.auctionResolved",
  "guild.prizeRedeemed"
]);

function record(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(
  value: UnknownRecord,
  required: readonly string[],
  optional: readonly string[] = []
): boolean {
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key));
}

function optional(
  value: UnknownRecord,
  key: string,
  validate: (candidate: unknown) => boolean
): boolean {
  return !Object.hasOwn(value, key) || validate(value[key]);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function safeInteger(value: unknown, minimum = 0): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum;
}

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function resourceMap(value: unknown): value is Record<(typeof resources)[number], number> {
  return record(value) && exactKeys(value, resources) &&
    resources.every((resource) => safeInteger(value[resource]));
}

function resourceCost(value: unknown): boolean {
  if (!record(value)) return false;
  const entries = Object.entries(value);
  return entries.length > 0 && entries.every(([resource, count]) =>
    resources.includes(resource as (typeof resources)[number]) && safeInteger(count) && count > 0
  );
}

function developmentCard(value: unknown, maximumTurn: number): value is UnknownRecord {
  return record(value) && exactKeys(value, ["id", "kind", "purchasedTurn", "revealed"]) &&
    nonEmptyString(value.id) && developmentCardKinds.has(String(value.kind)) &&
    safeInteger(value.purchasedTurn) && value.purchasedTurn <= maximumTurn &&
    typeof value.revealed === "boolean";
}

function player(value: unknown, maximumTurn: number): value is UnknownRecord {
  return record(value) && exactKeys(value, [
    "id", "name", "color", "resources", "guildTokens", "vouchers", "prizeCards",
    "developmentCards", "knightsPlayed"
  ]) && nonEmptyString(value.id) && nonEmptyString(value.name) && nonEmptyString(value.color) &&
    resourceMap(value.resources) && safeInteger(value.guildTokens) && safeInteger(value.vouchers) &&
    safeInteger(value.prizeCards) && safeInteger(value.knightsPlayed) &&
    Array.isArray(value.developmentCards) &&
    value.developmentCards.every((card) => developmentCard(card, maximumTurn));
}

interface GameReferences {
  readonly playerIds: ReadonlySet<string>;
  readonly playerById: ReadonlyMap<string, UnknownRecord>;
  readonly hexIds: ReadonlySet<string>;
  readonly vertexIds: ReadonlySet<string>;
  readonly edgeIds: ReadonlySet<string>;
}

function building(value: unknown, references: GameReferences): value is UnknownRecord {
  return record(value) && exactKeys(value, ["id", "ownerId", "vertexId", "kind"]) &&
    nonEmptyString(value.id) && references.playerIds.has(String(value.ownerId)) &&
    references.vertexIds.has(String(value.vertexId)) &&
    (value.kind === "settlement" || value.kind === "city");
}

function road(value: unknown, references: GameReferences): value is UnknownRecord {
  return record(value) && exactKeys(value, ["id", "ownerId", "edgeId"]) &&
    nonEmptyString(value.id) && references.playerIds.has(String(value.ownerId)) &&
    references.edgeIds.has(String(value.edgeId));
}

function gameLogEntry(value: unknown, allowLegacyOwnUndefined: boolean): value is UnknownRecord {
  if (!record(value) || !exactKeys(value, ["id", "message"], ["messageKey", "params"]) ||
    !nonEmptyString(value.id) || typeof value.message !== "string" ||
    (Object.hasOwn(value, "messageKey") &&
      (value.messageKey === undefined
        ? !allowLegacyOwnUndefined
        : !gameMessageKeys.has(String(value.messageKey))))) {
    return false;
  }
  return !Object.hasOwn(value, "params") ||
    (value.params === undefined && allowLegacyOwnUndefined) ||
    (record(value.params) && Object.entries(value.params).every(([key, parameter]) =>
      key.length > 0 && (typeof parameter === "string" ||
        (typeof parameter === "number" && Number.isFinite(parameter) && Number.isSafeInteger(parameter)))
    ));
}

function setupState(
  value: unknown,
  game: UnknownRecord,
  references: GameReferences,
  buildings: readonly UnknownRecord[]
): boolean {
  if (!record(value) || !exactKeys(value, ["order", "placementIndex", "stage"], ["pendingSettlement"]) ||
    !Array.isArray(value.order) || !value.order.every(nonEmptyString) ||
    value.order.length !== references.playerIds.size * 2 || !safeInteger(value.placementIndex) ||
    value.placementIndex >= value.order.length ||
    (value.stage !== "settlement" && value.stage !== "road")) {
    return false;
  }
  const playerOrder = (game.players as UnknownRecord[]).map((candidate) => candidate.id as string);
  const expectedOrder = [...playerOrder, ...playerOrder.slice().reverse()];
  if (!value.order.every((id, index) => id === expectedOrder[index]) ||
    game.activePlayerId !== value.order[value.placementIndex]) {
    return false;
  }
  if (value.stage === "settlement") return !Object.hasOwn(value, "pendingSettlement");
  const pending = value.pendingSettlement;
  return record(pending) && exactKeys(pending, ["playerId", "vertexId"]) &&
    pending.playerId === game.activePlayerId && references.playerIds.has(String(pending.playerId)) &&
    references.vertexIds.has(String(pending.vertexId)) && buildings.some((candidate) =>
      candidate.ownerId === pending.playerId && candidate.vertexId === pending.vertexId &&
      candidate.kind === "settlement"
    );
}

function pendingRobber(
  value: unknown,
  phase: unknown,
  activePlayerId: unknown,
  references: GameReferences,
  robberHexId: unknown
): boolean {
  if (!record(value) || !exactKeys(value, ["source", "resumePhase", "eligibleVictimIds"], ["targetHexId"]) ||
    (value.source !== "seven" && value.source !== "knight") ||
    (value.resumePhase !== "awaitingRoll" && value.resumePhase !== "action") ||
    !Array.isArray(value.eligibleVictimIds) || !value.eligibleVictimIds.every(nonEmptyString) ||
    !unique(value.eligibleVictimIds) || value.eligibleVictimIds.some((id) =>
      !references.playerIds.has(id) || id === activePlayerId
    ) || !optional(value, "targetHexId", (candidate) => references.hexIds.has(String(candidate)))) {
    return false;
  }
  if (phase === "awaitingRobberPlacement") {
    return !Object.hasOwn(value, "targetHexId") && value.eligibleVictimIds.length === 0;
  }
  return phase === "awaitingRobberVictim" && Object.hasOwn(value, "targetHexId") &&
    value.targetHexId === robberHexId && value.eligibleVictimIds.length > 0;
}

function pendingDevelopmentEffect(
  value: unknown,
  activePlayerId: unknown,
  references: GameReferences
): boolean {
  if (!record(value) || !nonEmptyString(value.kind) ||
    !references.playerIds.has(String(value.playerId)) || value.playerId !== activePlayerId ||
    (value.resumePhase !== "awaitingRoll" && value.resumePhase !== "action")) {
    return false;
  }
  if (value.kind === "roadBuilding") {
    return exactKeys(value, ["kind", "playerId", "remainingRoads", "resumePhase"]) &&
      safeInteger(value.remainingRoads, 1) && value.remainingRoads <= 2;
  }
  if (value.kind === "yearOfPlenty") {
    return exactKeys(value, ["kind", "playerId", "remainingPicks", "resumePhase"]) &&
      safeInteger(value.remainingPicks, 1) && value.remainingPicks <= 2;
  }
  return value.kind === "monopoly" && exactKeys(value, ["kind", "playerId", "resumePhase"]);
}

function turnState(value: unknown, game: UnknownRecord, references: GameReferences): boolean {
  if (!record(value) || !exactKeys(value, ["phase", "pendingDiscards"], [
    "pendingRobber", "pendingDevelopmentEffect", "developmentCardPlayed"
  ]) || !turnPhases.has(String(value.phase)) || !record(value.pendingDiscards) ||
    !Object.entries(value.pendingDiscards).every(([playerId, count]) =>
      references.playerIds.has(playerId) && safeInteger(count, 1)
    ) || !optional(value, "developmentCardPlayed", (candidate) => typeof candidate === "boolean")) {
    return false;
  }
  const discardCount = Object.keys(value.pendingDiscards).length;
  if ((value.phase === "awaitingDiscards") !== (discardCount > 0)) return false;

  const robberPhase = value.phase === "awaitingRobberPlacement" || value.phase === "awaitingRobberVictim";
  if (robberPhase !== Object.hasOwn(value, "pendingRobber") ||
    (robberPhase && !pendingRobber(
      value.pendingRobber,
      value.phase,
      game.activePlayerId,
      references,
      game.robberHexId
    ))) {
    return false;
  }

  const developmentPhase = value.phase === "awaitingDevelopmentEffect";
  return developmentPhase === Object.hasOwn(value, "pendingDevelopmentEffect") &&
    (!developmentPhase || pendingDevelopmentEffect(
      value.pendingDevelopmentEffect,
      game.activePlayerId,
      references
    ));
}

function blindBoxOutcome(value: unknown): boolean {
  if (!record(value) || !nonEmptyString(value.kind)) return false;
  if (value.kind === "resources") {
    return exactKeys(value, ["kind", "resources"]) && resourceMap(value.resources);
  }
  if (value.kind === "developmentCard") {
    return exactKeys(value, ["kind", "card"]) && developmentCardKinds.has(String(value.card));
  }
  return value.kind === "voucher" && exactKeys(value, ["kind"]);
}

function gatheringState(value: unknown, references: GameReferences): boolean {
  if (!record(value) || !exactKeys(value, [
    "phase", "redemptions", "auctionRound", "auctionResults"
  ], ["lastAuctionSummary", "lastAuctionResult"]) ||
    !gatheringPhases.has(String(value.phase)) || !record(value.redemptions) ||
    !Object.entries(value.redemptions).every(([playerId, count]) =>
      references.playerIds.has(playerId) && safeInteger(count, 1) && count <= 4
    ) || !safeInteger(value.auctionRound, 1) || value.auctionRound > 4 ||
    (value.phase === "auction" && value.auctionRound > 3) ||
    !Array.isArray(value.auctionResults) || value.auctionResults.length > 3 ||
    !value.auctionResults.every(blindBoxOutcome) ||
    !optional(value, "lastAuctionSummary", nonEmptyString)) {
    return false;
  }
  return optional(value, "lastAuctionResult", (candidate) => {
    if (!record(candidate) || !exactKeys(candidate, [
      "winnerId", "winnerName", "round", "winningBid", "outcome"
    ]) || !references.playerIds.has(String(candidate.winnerId)) ||
      !nonEmptyString(candidate.winnerName) || !safeInteger(candidate.round, 1) ||
      candidate.round > 3 || !safeInteger(candidate.winningBid, 1) ||
      !blindBoxOutcome(candidate.outcome)) {
      return false;
    }
    return references.playerById.get(candidate.winnerId as string)?.name === candidate.winnerName;
  });
}

function gatheringCooldown(value: unknown, playerCount: number): boolean {
  if (!record(value) || !exactKeys(value, ["availableAtTurn", "displayDuration"]) ||
    !safeInteger(value.availableAtTurn, 1) || !safeInteger(value.displayDuration, 1)) {
    return false;
  }
  const allowedDurations = [
    createInitialGatheringCooldown(1, playerCount).displayDuration,
    createPostGatheringCooldown(1, playerCount).displayDuration
  ];
  return allowedDurations.includes(value.displayDuration);
}

function commerceGuild(value: unknown, references: GameReferences): boolean {
  if (!record(value) || !exactKeys(value, [
    "tradeSlots", "usedTradePlayerIds", "gathering", "gatheringCooldown"
  ]) || !Array.isArray(value.tradeSlots) || value.tradeSlots.length !== 3 ||
    !value.tradeSlots.every((slot) => record(slot) && exactKeys(slot, ["id", "requires", "tokenReward"]) &&
      nonEmptyString(slot.id) && resourceCost(slot.requires) && safeInteger(slot.tokenReward, 1)) ||
    !unique(value.tradeSlots.map((slot) => (slot as UnknownRecord).id as string)) ||
    !Array.isArray(value.usedTradePlayerIds) || !value.usedTradePlayerIds.every(nonEmptyString) ||
    !unique(value.usedTradePlayerIds) ||
    value.usedTradePlayerIds.some((id) => !references.playerIds.has(id)) ||
    !gatheringState(value.gathering, references) ||
    !gatheringCooldown(value.gatheringCooldown, references.playerIds.size)) {
    return false;
  }
  return true;
}

function playerTrade(value: unknown, game: UnknownRecord, references: GameReferences): boolean {
  if (!record(value) || !exactKeys(value, ["proposerId", "offered", "requested"]) ||
    !references.playerIds.has(String(value.proposerId)) || value.proposerId !== game.activePlayerId ||
    !resourceMap(value.offered) || !resourceMap(value.requested) ||
    (game.phase !== "playing" && game.phase !== "gameOver") ||
    (game.turnState as UnknownRecord).phase !== "action") {
    return false;
  }
  const offered = value.offered as Record<(typeof resources)[number], number>;
  const requested = value.requested as Record<(typeof resources)[number], number>;
  if (resources.every((resource) => offered[resource] === 0) ||
    resources.every((resource) => requested[resource] === 0)) {
    return false;
  }
  const proposer = references.playerById.get(value.proposerId as string);
  const inventory = proposer?.resources as UnknownRecord | undefined;
  return inventory !== undefined && resources.every((resource) =>
    offered[resource] <= (inventory[resource] as number)
  );
}

function gameState(value: unknown): value is UnknownRecord {
  if (!record(value) || !exactKeys(value, [
    "mapSeed", "phase", "players", "activePlayerId", "turn", "round", "turnState",
    "targetScore", "board", "edges", "ports", "buildings", "roads", "robberHexId",
    "bank", "log", "developmentDeck"
  ], ["setup", "winnerId", "largestArmyOwnerId", "longestRoadOwnerId"]) ||
    !gamePhases.has(String(value.phase)) || !safeInteger(value.turn, 1) ||
    !safeInteger(value.round, 1) || !safeInteger(value.targetScore, 1) ||
    !Array.isArray(value.players) || value.players.length < 3 || value.players.length > 4 ||
    !value.players.every((candidate) => player(candidate, value.turn as number))) {
    return false;
  }

  let mapSeed;
  try {
    mapSeed = parseMapSeed(value.mapSeed);
  } catch {
    return false;
  }
  if (!matchesBoardDataForSeed({ board: value.board, edges: value.edges, ports: value.ports }, mapSeed)) {
    return false;
  }
  const allowLegacyOwnUndefined = mapSeed === LEGACY_STANDARD_MAP_SEED;

  const players = value.players as UnknownRecord[];
  const playerIds = players.map((candidate) => candidate.id as string);
  const board = value.board as UnknownRecord[];
  const references: GameReferences = {
    playerIds: new Set(playerIds),
    playerById: new Map(players.map((candidate) => [candidate.id as string, candidate])),
    hexIds: new Set(board.map((candidate) => candidate.id as string)),
    vertexIds: new Set(board.flatMap((candidate) => candidate.vertexIds as string[])),
    edgeIds: new Set((value.edges as UnknownRecord[]).map((candidate) => candidate.id as string))
  };
  if (!unique(playerIds) || !references.playerIds.has(String(value.activePlayerId)) ||
    !Array.isArray(value.buildings) || !value.buildings.every((candidate) => building(candidate, references)) ||
    !unique((value.buildings as UnknownRecord[]).map((candidate) => candidate.id as string)) ||
    !unique((value.buildings as UnknownRecord[]).map((candidate) => candidate.vertexId as string)) ||
    !Array.isArray(value.roads) || !value.roads.every((candidate) => road(candidate, references)) ||
    !unique((value.roads as UnknownRecord[]).map((candidate) => candidate.id as string)) ||
    !unique((value.roads as UnknownRecord[]).map((candidate) => candidate.edgeId as string)) ||
    !references.hexIds.has(String(value.robberHexId)) ||
    !record(value.bank) || !exactKeys(value.bank, ["resources"]) || !resourceMap(value.bank.resources) ||
    !Array.isArray(value.log) || !value.log.every((entry) => gameLogEntry(entry, allowLegacyOwnUndefined)) ||
    !unique((value.log as UnknownRecord[]).map((candidate) => candidate.id as string)) ||
    !Array.isArray(value.developmentDeck) ||
    !value.developmentDeck.every((card) => developmentCard(card, value.turn as number)) ||
    !turnState(value.turnState, value, references)) {
    return false;
  }

  const cards = [
    ...value.developmentDeck as UnknownRecord[],
    ...players.flatMap((candidate) => candidate.developmentCards as UnknownRecord[])
  ];
  if (!unique(cards.map((candidate) => candidate.id as string))) {
    return false;
  }

  const buildings = value.buildings as UnknownRecord[];
  if (value.phase === "setup") {
    if (!Object.hasOwn(value, "setup") || !setupState(value.setup, value, references, buildings) ||
      Object.hasOwn(value, "winnerId")) {
      return false;
    }
  } else if (Object.hasOwn(value, "setup") &&
    (value.setup !== undefined || !allowLegacyOwnUndefined)) {
    return false;
  }
  if (value.phase === "gameOver") {
    if (!Object.hasOwn(value, "winnerId") || !references.playerIds.has(String(value.winnerId))) {
      return false;
    }
  } else if (Object.hasOwn(value, "winnerId")) {
    return false;
  }
  return optional(value, "largestArmyOwnerId", (candidate) => references.playerIds.has(String(candidate))) &&
    (!Object.hasOwn(value, "longestRoadOwnerId") ||
      (value.longestRoadOwnerId === undefined && value.phase !== "setup" && allowLegacyOwnUndefined) ||
      references.playerIds.has(String(value.longestRoadOwnerId)));
}

function diceRoll(value: unknown): boolean {
  return record(value) && exactKeys(value, ["first", "second", "total"]) &&
    safeInteger(value.first, 1) && value.first <= 6 && safeInteger(value.second, 1) &&
    value.second <= 6 && safeInteger(value.total, 2) && value.total <= 12 &&
    value.total === value.first + value.second;
}

export function isPersistedMatchState(value: unknown): value is MatchState {
  if (!record(value) || !exactKeys(value, ["game", "guild", "lastDice"], ["pendingPlayerTrade"]) ||
    !gameState(value.game)) {
    return false;
  }
  const game = value.game;
  const players = game.players as UnknownRecord[];
  const board = game.board as UnknownRecord[];
  const references: GameReferences = {
    playerIds: new Set(players.map((candidate) => candidate.id as string)),
    playerById: new Map(players.map((candidate) => [candidate.id as string, candidate])),
    hexIds: new Set(board.map((candidate) => candidate.id as string)),
    vertexIds: new Set(board.flatMap((candidate) => candidate.vertexIds as string[])),
    edgeIds: new Set((game.edges as UnknownRecord[]).map((candidate) => candidate.id as string))
  };
  const guildValid = commerceGuild(value.guild, references);
  const diceValid = value.lastDice === null || diceRoll(value.lastDice);
  const allowLegacyOwnUndefined = game.mapSeed === LEGACY_STANDARD_MAP_SEED;
  const tradeValid = !Object.hasOwn(value, "pendingPlayerTrade") ||
    (value.pendingPlayerTrade === undefined && game.phase !== "setup" && allowLegacyOwnUndefined) ||
    playerTrade(value.pendingPlayerTrade, game, references);
  return guildValid && diceValid && tradeValid;
}
