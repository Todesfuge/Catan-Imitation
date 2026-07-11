import type {
  AuctionSummaryData,
  BlindBoxOutcome,
  CommerceGuildState
} from "../domain/expansion/commerceGuild";
import { createStandardBoardData } from "../domain/board";
import type { MatchState } from "../domain/match/types";
import { calculatePlayerScore } from "../domain/rules/scoring";
import {
  resources,
  type DevelopmentCardKind,
  type GameLogEntry,
  type GameMessageKey,
  type GameState,
  type Player
} from "../domain/types";
import type {
  PrivateSeatState,
  ProjectedRoomView,
  PublicBlindBoxOutcomeView,
  PublicGameView,
  PublicGuildView,
  PublicLogEntry,
  PublicPlayerView,
  PublicRoomState,
  RequiredDecision,
  RoomLifecycle
} from "./view";
import {
  projectAllowedActions,
  type OnlineAvailabilityContext
} from "./allowedActions";

export interface ProjectableSeatSource {
  seatId: string;
  playerId?: string;
  nickname: string;
  ready: boolean;
}

export interface ProjectableRoomState {
  roomCode: string;
  lifecycle: RoomLifecycle;
  roomVersion: number;
  hostSeatId?: string;
  seats: ProjectableSeatSource[];
  matchState?: MatchState;
  pendingAuction?: {
    round: number;
    bidsBySeatId: Record<string, number>;
  };
}

type LogParamKind =
  | "playerName"
  | "resource"
  | "cardKind"
  | "hexId"
  | "diceTotal"
  | "productionEventCount"
  | "auctionRound"
  | "tokenTransferAmount";

const developmentCardKinds: readonly DevelopmentCardKind[] = [
  "knight",
  "roadBuilding",
  "yearOfPlenty",
  "monopoly"
];

const MAX_PUBLIC_LOG_ENTRIES = 6;
const standardBoardData = createStandardBoardData();
const standardBoardWire = JSON.stringify(standardBoardData);

function requireStandardBoardLayout(game: GameState): void {
  if (JSON.stringify({ board: game.board, edges: game.edges, ports: game.ports }) !== standardBoardWire) {
    throw new Error("Online projection requires the standard-v1 board layout.");
  }
}

const noParamLogKeys = new Set<GameMessageKey>([
  "game.welcome",
  "setup.started",
  "setup.newGameStarted",
  "robber.sevenRolled",
  "guild.gatheringAutoStarted",
  "guild.slotCompleted",
  "guild.gatheringStarted",
  "guild.auctionOpened",
  "guild.auctionNoEligibleBidders"
]);

const safeLogParamSchemas: Partial<
  Record<GameMessageKey, Readonly<Record<string, LogParamKind>>>
> = {
  "dice.rolled": {
    playerName: "playerName",
    total: "diceTotal",
    eventCount: "productionEventCount"
  },
  "robber.discardCompleted": { playerName: "playerName" },
  "robber.moved": { hexId: "hexId" },
  "robber.stolen": { playerName: "playerName", victimName: "playerName" },
  "development.played": { playerName: "playerName", cardKind: "cardKind" },
  "development.bought": { playerName: "playerName" },
  "development.knightPlayed": { playerName: "playerName" },
  "development.freeRoadPlaced": { playerName: "playerName" },
  "development.yearOfPlentyLog": { resource: "resource" },
  "development.monopolyLog": { resource: "resource" },
  "trade.maritime": { playerName: "playerName", give: "resource", receive: "resource" },
  "trade.player.published": { proposerName: "playerName" },
  "trade.player.cancelled": { proposerName: "playerName" },
  "trade.player.accepted": {
    acceptingPlayerName: "playerName",
    proposerName: "playerName"
  },
  "guild.tokensTransferred": {
    fromName: "playerName",
    amount: "tokenTransferAmount",
    toName: "playerName"
  },
  "guild.redeemedResources": { playerName: "playerName" },
  "guild.auctionRoundNoBids": { round: "auctionRound" },
  "guild.prizeRedeemed": { playerName: "playerName" }
};

interface LogProjectionContext {
  playerNames: ReadonlySet<string>;
  playerNameById: ReadonlyMap<string, string>;
  hexIds: ReadonlySet<string>;
  buildingCount: number;
  totalGuildTokens: number;
  lastAuctionResult?: AuctionSummaryData;
}

function copyResourceMap(map: Record<(typeof resources)[number], number>) {
  return {
    wood: map.wood,
    brick: map.brick,
    wool: map.wool,
    grain: map.grain,
    ore: map.ore
  };
}

function resourceCount(player: Player): number {
  return resources.reduce((total, resource) => total + player.resources[resource], 0);
}

function hiddenVictoryPointCount(player: Player): number {
  return player.developmentCards.filter((card) => card.kind === "victoryPoint").length;
}

function projectPlayer(
  game: GameState,
  player: Player,
  viewerPlayerId: string | undefined,
  nickname: string,
  revealFinalScores: boolean
): PublicPlayerView {
  const completeScore = calculatePlayerScore(game, player.id);
  const visibleScore =
    revealFinalScores || player.id === viewerPlayerId
      ? completeScore
      : completeScore - hiddenVictoryPointCount(player);
  return {
    playerId: player.id,
    nickname,
    color: player.color,
    resourceCardCount: resourceCount(player),
    developmentCardCount: player.developmentCards.length,
    visibleScore,
    guildTokens: player.guildTokens,
    vouchers: player.vouchers,
    prizeCards: player.prizeCards,
    knightsPlayed: player.knightsPlayed
  };
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isIntegerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function isAuctionRound(value: unknown): value is number {
  return isIntegerInRange(value, 1, 3);
}

function isResourceQuantity(value: unknown): value is number {
  return isIntegerInRange(value, 0, 19);
}

function isSafeLogParam(
  value: unknown,
  kind: LogParamKind,
  context: LogProjectionContext
): value is string | number {
  if (kind === "diceTotal") return isIntegerInRange(value, 2, 12);
  if (kind === "productionEventCount") {
    return isIntegerInRange(value, 0, context.buildingCount);
  }
  if (kind === "auctionRound") return isAuctionRound(value);
  if (kind === "tokenTransferAmount") {
    return (
      Number.isSafeInteger(context.totalGuildTokens) &&
      isIntegerInRange(value, 1, context.totalGuildTokens)
    );
  }
  if (typeof value !== "string") return false;
  if (kind === "playerName") return context.playerNames.has(value);
  if (kind === "resource") return resources.includes(value as (typeof resources)[number]);
  if (kind === "cardKind") return developmentCardKinds.includes(value as DevelopmentCardKind);
  return context.hexIds.has(value);
}

function matchingAuctionResult(
  entry: GameLogEntry,
  context: LogProjectionContext
): { result: AuctionSummaryData; winnerName: string } | undefined {
  const result = context.lastAuctionResult;
  const params = entry.params;
  const winnerName = result && context.playerNameById.get(result.winnerId);
  if (
    !result ||
    !params ||
    !winnerName ||
    !isAuctionRound(result.round) ||
    !isNonNegativeSafeInteger(result.winningBid) ||
    params.winnerName !== winnerName ||
    params.round !== result.round ||
    params.bid !== result.winningBid ||
    params.outcomeKind !== result.outcome.kind
  ) {
    return undefined;
  }
  return { result, winnerName };
}

function projectAuctionLog(
  entry: GameLogEntry,
  context: LogProjectionContext
): PublicLogEntry | undefined {
  const matched = matchingAuctionResult(entry, context);
  if (!matched || matched.result.outcome.kind === "developmentCard") return undefined;

  const params: Record<string, string | number> = {
    winnerName: matched.winnerName,
    bid: matched.result.winningBid,
    round: matched.result.round,
    outcomeKind: matched.result.outcome.kind
  };
  if (matched.result.outcome.kind === "resources") {
    for (const resource of resources) {
      const amount = matched.result.outcome.resources[resource];
      if (!isResourceQuantity(amount) || entry.params?.[resource] !== amount) {
        return undefined;
      }
      params[resource] = amount;
    }
  }
  return { id: entry.id, messageKey: entry.messageKey, params };
}

function projectLogEntry(
  entry: GameLogEntry,
  context: LogProjectionContext
): PublicLogEntry | undefined {
  if (!entry.messageKey) return undefined;
  if (entry.messageKey === "guild.auctionResolved") {
    return projectAuctionLog(entry, context);
  }
  if (noParamLogKeys.has(entry.messageKey)) {
    return { id: entry.id, messageKey: entry.messageKey };
  }
  const schema = safeLogParamSchemas[entry.messageKey];
  if (!schema || !entry.params) return undefined;
  const params: Record<string, string | number> = {};
  for (const [key, kind] of Object.entries(schema)) {
    const value = entry.params[key];
    if (!isSafeLogParam(value, kind, context)) return undefined;
    params[key] = value;
  }
  return { id: entry.id, messageKey: entry.messageKey, params };
}

function projectOutcome(outcome: BlindBoxOutcome): PublicBlindBoxOutcomeView | undefined {
  if (outcome.kind === "resources") {
    let resourceCardCount = 0;
    for (const resource of resources) {
      const amount = outcome.resources[resource];
      if (!isResourceQuantity(amount)) return undefined;
      resourceCardCount += amount;
    }
    if (!Number.isSafeInteger(resourceCardCount)) return undefined;
    return {
      kind: "resources",
      resourceCardCount
    };
  }
  if (outcome.kind === "voucher" || outcome.kind === "developmentCard") {
    return { kind: outcome.kind };
  }
  return undefined;
}

function projectGuild(
  guild: CommerceGuildState,
  playerNameById: ReadonlyMap<string, string>
): PublicGuildView {
  const last = guild.gathering.lastAuctionResult;
  const lastOutcome = last ? projectOutcome(last.outcome) : undefined;
  const winnerName = last ? playerNameById.get(last.winnerId) : undefined;
  const safeLast =
    last &&
    lastOutcome &&
    winnerName &&
    isAuctionRound(last.round) &&
    isNonNegativeSafeInteger(last.winningBid)
      ? {
          winnerId: last.winnerId,
          winnerName,
          round: last.round,
          winningBid: last.winningBid,
          outcome: lastOutcome
        }
      : undefined;
  return {
    tradeSlots: guild.tradeSlots.map((slot) => ({
      id: slot.id,
      requires: { ...slot.requires },
      tokenReward: slot.tokenReward
    })),
    usedTradePlayerIds: [...guild.usedTradePlayerIds],
    gathering: {
      phase: guild.gathering.phase,
      auctionRound: guild.gathering.auctionRound,
      auctionResults: guild.gathering.auctionResults
        .map(projectOutcome)
        .filter((outcome): outcome is PublicBlindBoxOutcomeView => outcome !== undefined),
      ...(safeLast ? { lastAuctionResult: safeLast } : {})
    }
  };
}

function awaitedPlayerIds(game: GameState): string[] {
  if (game.turnState.phase === "awaitingDiscards") {
    return Object.keys(game.turnState.pendingDiscards);
  }
  if (game.turnState.phase === "awaitingRoll" || game.turnState.phase === "action") return [];
  return [game.activePlayerId];
}

function publicPlayerNames(
  match: MatchState,
  seatNicknames: ReadonlyMap<string, string>
): Map<string, string> {
  return new Map(
    match.game.players.map((player) => [
      player.id,
      seatNicknames.get(player.id) ?? player.name
    ])
  );
}

function projectGame(
  match: MatchState,
  viewerPlayerId: string | undefined,
  playerNameById: ReadonlyMap<string, string>,
  revealFinalScores: boolean
): PublicGameView {
  const game = match.game;
  requireStandardBoardLayout(game);
  const logContext: LogProjectionContext = {
    playerNames: new Set(playerNameById.values()),
    playerNameById,
    hexIds: new Set(game.board.map((hex) => hex.id)),
    buildingCount: game.buildings.length,
    totalGuildTokens: game.players.reduce((total, player) => total + player.guildTokens, 0),
    lastAuctionResult: match.guild.gathering.lastAuctionResult
  };
  return {
    phase: game.phase,
    players: game.players.map((player) =>
      projectPlayer(
        game,
        player,
        viewerPlayerId,
        playerNameById.get(player.id) ?? player.name,
        revealFinalScores
      )
    ),
    activePlayerId: game.activePlayerId,
    turn: game.turn,
    round: game.round,
    turnState: { phase: game.turnState.phase, awaitedPlayerIds: awaitedPlayerIds(game) },
    targetScore: game.targetScore,
    boardLayout: "standard-v1",
    buildings: game.buildings.map((building) => ({ ...building })),
    roads: game.roads.map((road) => ({ ...road })),
    robberHexId: game.robberHexId,
    bank: { resources: copyResourceMap(game.bank.resources) },
    log: game.log.flatMap((entry) => {
      const projected = projectLogEntry(entry, logContext);
      return projected ? [projected] : [];
    }).slice(-MAX_PUBLIC_LOG_ENTRIES),
    developmentDeckCount: game.developmentDeck.length,
    lastDice: match.lastDice ? { ...match.lastDice } : null,
    ...(match.pendingPlayerTrade
      ? {
          pendingPlayerTrade: {
            proposerId: match.pendingPlayerTrade.proposerId,
            offered: copyResourceMap(match.pendingPlayerTrade.offered),
            requested: copyResourceMap(match.pendingPlayerTrade.requested)
          }
        }
      : {}),
    ...(game.setup
      ? {
          setup: {
            order: [...game.setup.order],
            placementIndex: game.setup.placementIndex,
            stage: game.setup.stage,
            ...(game.setup.pendingSettlement
              ? { pendingSettlement: { ...game.setup.pendingSettlement } }
              : {})
          }
        }
      : {}),
    ...(game.winnerId ? { winnerId: game.winnerId } : {}),
    ...(game.largestArmyOwnerId ? { largestArmyOwnerId: game.largestArmyOwnerId } : {}),
    ...(game.longestRoadOwnerId ? { longestRoadOwnerId: game.longestRoadOwnerId } : {})
  };
}

function requiredDecision(game: GameState, playerId: string): RequiredDecision | undefined {
  const discardCount = game.turnState.pendingDiscards[playerId];
  if (game.turnState.phase === "awaitingDiscards" && discardCount !== undefined) {
    return { kind: "discardResources", count: discardCount };
  }
  if (game.activePlayerId !== playerId) return undefined;
  if (game.turnState.phase === "awaitingRobberPlacement") return { kind: "placeRobber" };
  if (game.turnState.phase === "awaitingRobberVictim") {
    return {
      kind: "chooseRobberVictim",
      eligiblePlayerIds: [...(game.turnState.pendingRobber?.eligibleVictimIds ?? [])]
    };
  }
  const effect = game.turnState.pendingDevelopmentEffect;
  if (!effect || effect.playerId !== playerId) return undefined;
  if (effect.kind === "roadBuilding") {
    return { kind: "placeFreeRoad", remainingRoads: effect.remainingRoads };
  }
  if (effect.kind === "yearOfPlenty") {
    return { kind: "chooseYearOfPlentyResource", remainingPicks: effect.remainingPicks };
  }
  return { kind: "chooseMonopolyResource" };
}

function projectPrivateState(
  room: ProjectableRoomState,
  seat: ProjectableSeatSource
): PrivateSeatState {
  const match = room.matchState;
  const player = seat.playerId
    ? match?.game.players.find((candidate) => candidate.id === seat.playerId)
    : undefined;
  const decision = player && match ? requiredDecision(match.game, player.id) : undefined;
  const ownPendingBid = room.pendingAuction?.bidsBySeatId[seat.seatId];
  return {
    seatId: seat.seatId,
    ...(seat.playerId ? { playerId: seat.playerId } : {}),
    seatTokenPresent: true,
    ...(player
      ? {
          resources: copyResourceMap(player.resources),
          developmentCards: player.developmentCards.map((card) => ({ ...card }))
        }
      : {}),
    ...(ownPendingBid !== undefined ? { ownPendingBid } : {}),
    ...(decision ? { requiredDecision: decision } : {})
  };
}

export function projectRoomView(
  room: ProjectableRoomState,
  viewerSeatId: string,
  availabilityContext: OnlineAvailabilityContext = {}
): ProjectedRoomView {
  const viewerSeat = room.seats.find((seat) => seat.seatId === viewerSeatId);
  if (!viewerSeat) throw new Error(`Unknown viewer seat: ${viewerSeatId}`);

  const seats = room.seats.map((seat) => ({
    seatId: seat.seatId,
    ...(seat.playerId ? { playerId: seat.playerId } : {}),
    nickname: seat.nickname,
    ready: seat.ready
  }));
  const nicknames = new Map(
    room.seats.flatMap((seat) => (seat.playerId ? [[seat.playerId, seat.nickname] as const] : []))
  );
  const playerNameById = room.matchState
    ? publicPlayerNames(room.matchState, nicknames)
    : new Map<string, string>();
  const game = room.matchState
    ? projectGame(
        room.matchState,
        viewerSeat.playerId,
        playerNameById,
        room.lifecycle === "finished" || room.matchState.game.phase === "gameOver"
      )
    : undefined;
  const allowedActions = room.matchState
    ? projectAllowedActions(
        room.matchState,
        viewerSeat,
        room.seats,
        room.pendingAuction,
        availabilityContext
      )
    : undefined;
  const publicState: PublicRoomState = {
    roomCode: room.roomCode,
    lifecycle: room.lifecycle,
    roomVersion: room.roomVersion,
    ...(room.lifecycle === "lobby" && room.hostSeatId ? { hostSeatId: room.hostSeatId } : {}),
    seats,
    ...(game ? { game, guild: projectGuild(room.matchState!.guild, playerNameById) } : {}),
    submittedBidSeatIds: room.pendingAuction
      ? room.seats
          .filter((seat) => Object.hasOwn(room.pendingAuction!.bidsBySeatId, seat.seatId))
          .map((seat) => seat.seatId)
      : []
  };

  return {
    publicState,
    privateState: projectPrivateState(room, viewerSeat),
    ...(allowedActions ? { allowedActions } : {})
  };
}
