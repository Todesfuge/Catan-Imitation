import type { BlindBoxOutcome, CommerceGuildState } from "../domain/expansion/commerceGuild";
import type { MatchState } from "../domain/match/types";
import { calculatePlayerScore } from "../domain/rules/scoring";
import { resources, type GameLogEntry, type GameMessageKey, type GameState, type Player } from "../domain/types";
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

const safeLogParams: Partial<Record<GameMessageKey, readonly string[]>> = {
  "dice.rolled": ["playerName", "total", "eventCount"],
  "robber.discardCompleted": ["playerName"],
  "robber.moved": ["hexId"],
  "robber.stolen": ["playerName", "victimName"],
  "development.played": ["playerName", "cardKind"],
  "development.bought": ["playerName"],
  "development.knightPlayed": ["playerName"],
  "development.freeRoadPlaced": ["playerName"],
  "development.yearOfPlentyLog": ["resource"],
  "development.monopolyLog": ["resource"],
  "trade.maritime": ["playerName", "give", "receive"],
  "trade.player.published": ["proposerName"],
  "trade.player.cancelled": ["proposerName"],
  "trade.player.accepted": ["acceptingPlayerName", "proposerName"],
  "guild.tokensTransferred": ["fromName", "amount", "toName"],
  "guild.auctionNoEligibleBidders": ["round"],
  "guild.redeemedResources": ["playerName"],
  "guild.auctionRoundNoBids": ["round"],
  "guild.auctionResolved": ["winnerName", "bid", "round", "outcomeKind"],
  "guild.prizeRedeemed": ["playerName"]
};

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

function projectLogEntry(entry: GameLogEntry): PublicLogEntry {
  const projected: PublicLogEntry = { id: entry.id };
  if (!entry.messageKey) return projected;
  projected.messageKey = entry.messageKey;
  const allowedKeys = safeLogParams[entry.messageKey] ?? [];
  if (entry.params && allowedKeys.length > 0) {
    const params: Record<string, string | number> = {};
    for (const key of allowedKeys) {
      const value = entry.params[key];
      if (typeof value === "string" || typeof value === "number") params[key] = value;
    }
    if (Object.keys(params).length > 0) projected.params = params;
  }
  return projected;
}

function projectOutcome(outcome: BlindBoxOutcome): PublicBlindBoxOutcomeView {
  if (outcome.kind === "resources") {
    return {
      kind: "resources",
      resourceCardCount: resources.reduce((total, resource) => total + outcome.resources[resource], 0)
    };
  }
  return { kind: outcome.kind };
}

function projectGuild(guild: CommerceGuildState): PublicGuildView {
  const last = guild.gathering.lastAuctionResult;
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
      auctionResults: guild.gathering.auctionResults.map(projectOutcome),
      ...(last
        ? {
            lastAuctionResult: {
              winnerId: last.winnerId,
              winnerName: last.winnerName,
              round: last.round,
              winningBid: last.winningBid,
              outcome: projectOutcome(last.outcome)
            }
          }
        : {})
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

function projectGame(
  match: MatchState,
  viewerPlayerId: string | undefined,
  nicknames: ReadonlyMap<string, string>,
  revealFinalScores: boolean
): PublicGameView {
  const game = match.game;
  return {
    phase: game.phase,
    players: game.players.map((player) =>
      projectPlayer(
        game,
        player,
        viewerPlayerId,
        nicknames.get(player.id) ?? player.name,
        revealFinalScores
      )
    ),
    activePlayerId: game.activePlayerId,
    turn: game.turn,
    round: game.round,
    turnState: { phase: game.turnState.phase, awaitedPlayerIds: awaitedPlayerIds(game) },
    targetScore: game.targetScore,
    board: game.board.map((hex) => ({
      ...hex,
      vertexIds: [...hex.vertexIds],
      edgeIds: [...hex.edgeIds]
    })),
    edges: game.edges.map((edge) => ({ ...edge, vertexIds: [...edge.vertexIds] })),
    ports: game.ports.map((port) => ({ ...port, vertexIds: [...port.vertexIds] })),
    buildings: game.buildings.map((building) => ({ ...building })),
    roads: game.roads.map((road) => ({ ...road })),
    robberHexId: game.robberHexId,
    bank: { resources: copyResourceMap(game.bank.resources) },
    log: game.log.map(projectLogEntry),
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
  viewerSeatId: string
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
  const game = room.matchState
    ? projectGame(
        room.matchState,
        viewerSeat.playerId,
        nicknames,
        room.lifecycle === "finished" || room.matchState.game.phase === "gameOver"
      )
    : undefined;
  const publicState: PublicRoomState = {
    roomCode: room.roomCode,
    lifecycle: room.lifecycle,
    roomVersion: room.roomVersion,
    ...(room.lifecycle === "lobby" && room.hostSeatId ? { hostSeatId: room.hostSeatId } : {}),
    seats,
    ...(game ? { game, guild: projectGuild(room.matchState!.guild) } : {}),
    submittedBidSeatIds: room.pendingAuction
      ? room.seats
          .filter((seat) => Object.hasOwn(room.pendingAuction!.bidsBySeatId, seat.seatId))
          .map((seat) => seat.seatId)
      : []
  };

  return {
    publicState,
    privateState: projectPrivateState(room, viewerSeat)
  };
}
