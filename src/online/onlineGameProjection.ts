import type { StandardBoardData } from "../domain/board";
import { parseMapSeed, type MapSeed } from "../domain/mapSeed";
import { createBoardDataForSeed } from "../domain/randomBoard";
import { resources } from "../domain/types";
import type { AvailabilityReasonCode } from "../app/actionAvailability";
import type { OnlineAllowedActions } from "./allowedActions";
import type { RoomSnapshotMessage } from "./protocol";
import type { PrivateSeatState, ProjectedRoomView, PublicGameView, PublicGuildView, PublicRoomState } from "./view";

declare const parsedProjection: unique symbol;
export type ParsedOnlineGameProjection = ProjectedRoomView & {
  readonly boardData: StandardBoardData;
  readonly [parsedProjection]: true;
};

const MAX_ID_POINTS = 128;
const MAX_COUNT = 10_000;
const phases = new Set(["setup", "playing", "gameOver"]);
const turnPhases = new Set(["awaitingRoll", "awaitingDiscards", "awaitingRobberPlacement", "awaitingRobberVictim", "awaitingDevelopmentEffect", "action"]);
const developmentKinds = new Set(["knight", "victoryPoint", "roadBuilding", "yearOfPlenty", "monopoly"]);
const playableDevelopmentKinds = new Set(["knight", "roadBuilding", "yearOfPlenty", "monopoly"]);
const gatheringPhases = new Set(["idle", "redemption", "auction", "complete"]);
const reasonCodes = new Set<AvailabilityReasonCode>([
  "GAME_SETUP", "GAME_OVER", "NOT_YOUR_TURN", "ROLL_REQUIRED", "ALREADY_ROLLED", "REQUIRED_DECISION",
  "INSUFFICIENT_RESOURCES", "NO_LEGAL_TARGET", "DEVELOPMENT_DECK_EMPTY", "DEVELOPMENT_CARD_PHASE",
  "NO_ELIGIBLE_DEVELOPMENT_CARD", "NO_MARITIME_TRADE", "GUILD_TRADE_ALREADY_USED", "NO_GUILD_TOKENS",
  "NO_RECIPIENT", "GATHERING_ONLY_DURING_PLAY", "GATHERING_IN_PROGRESS", "REDEMPTION_NOT_OPEN",
  "REDEMPTION_CAP_REACHED", "NO_BANK_STOCK", "VOUCHERS_REQUIRED", "SETUP_NOT_ACTIVE",
  "SETUP_SETTLEMENT_REQUIRED", "SETUP_ROAD_REQUIRED", "NO_REQUIRED_DISCARD", "ROBBER_MOVE_NOT_PENDING",
  "ROBBER_VICTIM_NOT_PENDING", "DEVELOPMENT_EFFECT_NOT_PENDING", "NO_PENDING_PLAYER_TRADE",
  "PLAYER_TRADE_ALREADY_OPEN", "PLAYER_TRADE_PROPOSER_NOT_ACTIVE", "CANNOT_ACCEPT_OWN_TRADE",
  "CANNOT_AFFORD_PLAYER_TRADE", "WAITING_FOR_REQUIRED_PLAYERS", "WAITING_FOR_ACTIVE_PLAYER",
  "REQUIRED_PLAYER_OFFLINE", "AUCTION_NOT_OPEN", "BID_ALREADY_SUBMITTED"
]);
const publicLogKeys = new Set([
  "game.welcome", "setup.started", "setup.newGameStarted", "robber.sevenRolled",
  "guild.slotCompleted", "guild.gatheringStarted", "guild.auctionOpened", "guild.auctionNoEligibleBidders",
  "dice.rolled", "robber.discardCompleted", "robber.moved", "robber.stolen", "development.played",
  "development.bought", "development.knightPlayed", "development.freeRoadPlaced", "development.yearOfPlentyLog",
  "development.monopolyLog", "trade.maritime", "trade.player.published", "trade.player.cancelled",
  "trade.player.accepted", "guild.tokensTransferred", "guild.redeemedResources", "guild.auctionRoundNoBids",
  "guild.prizeRedeemed", "guild.auctionResolved"
]);

type Obj = Record<string, unknown>;
interface BoardIds {
  readonly hexIds: ReadonlySet<string>;
  readonly vertexIds: ReadonlySet<string>;
  readonly edgeIds: ReadonlySet<string>;
}

function boardIdsFor(boardData: StandardBoardData): BoardIds {
  return {
    hexIds: new Set(boardData.board.map(({ id }) => id)),
    vertexIds: new Set(boardData.board.flatMap(({ vertexIds }) => vertexIds)),
    edgeIds: new Set(boardData.edges.map(({ id }) => id))
  };
}

const object = (value: unknown): value is Obj => value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value: Obj, required: readonly string[], optional: readonly string[] = []) => {
  const keys = Object.keys(value);
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.hasOwn(value, key)) && keys.every((key) => allowed.has(key));
};
const boundedString = (value: unknown, max = MAX_ID_POINTS): value is string =>
  typeof value === "string" && Array.from(value).length > 0 && Array.from(value).length <= max;
const nonNegativeInt = (value: unknown, max = MAX_COUNT): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= max;
const stringArray = (value: unknown, max: number): value is string[] =>
  Array.isArray(value) && value.length <= max && value.every((entry) => boundedString(entry));
const unique = (values: readonly string[]) => new Set(values).size === values.length;

function resourceMap(value: unknown): boolean {
  return object(value) && exact(value, resources) && resources.every((resource) => nonNegativeInt(value[resource], 95));
}

function resourceCost(value: unknown): boolean {
  return object(value) && Object.keys(value).every((key) => resources.includes(key as (typeof resources)[number]) && nonNegativeInt(value[key], 19));
}

function reason(value: unknown): boolean {
  if (!object(value) || !exact(value, ["code"], ["params"]) || !reasonCodes.has(value.code as AvailabilityReasonCode)) return false;
  if (value.params === undefined) return true;
  return object(value.params) && Object.keys(value.params).length <= 8 && Object.entries(value.params).every(([key, entry]) =>
    boundedString(key, 32) && (boundedString(entry) || nonNegativeInt(entry) || typeof entry === "boolean" || stringArray(entry, 4))
  );
}

function availability(value: unknown, targetMax: number, allowedTargets?: ReadonlySet<string>, extras: readonly string[] = []): value is Obj {
  if (!object(value) || !exact(value, ["enabled", "targets"], ["disabledReason", ...extras]) ||
      typeof value.enabled !== "boolean" || !stringArray(value.targets, targetMax) || !unique(value.targets) ||
      (value.disabledReason !== undefined && !reason(value.disabledReason))) return false;
  return !allowedTargets || value.targets.every((target) => allowedTargets.has(target));
}

function allowedActions(
  value: unknown,
  playerIds: ReadonlySet<string>,
  buildingIds: ReadonlySet<string>,
  privateCards: ReadonlyMap<string, string>,
  boardIds: BoardIds
): value is OnlineAllowedActions {
  if (!object(value) || !exact(value, ["turn", "maritime", "commerce", "setup", "decisions", "publicTrade", "sealedBid"]) ||
      !object(value.turn) || !exact(value.turn, ["roll", "endTurn", "road", "settlement", "city", "buyDevelopmentCard", "developmentCards"])) return false;
  const turn = value.turn;
  if (!availability(turn.roll, 0) || !availability(turn.endTurn, 0) ||
      !availability(turn.road, 72, boardIds.edgeIds, ["cost"]) || !resourceMap(turn.road.cost) ||
      !availability(turn.settlement, 54, boardIds.vertexIds, ["cost"]) || !resourceMap(turn.settlement.cost) ||
      !availability(turn.city, 20, buildingIds, ["cost"]) || !resourceMap(turn.city.cost) ||
      !availability(turn.buyDevelopmentCard, 0, undefined, ["cost"]) || !resourceMap(turn.buyDevelopmentCard.cost) ||
      !Array.isArray(turn.developmentCards) || turn.developmentCards.length > 4 || !turn.developmentCards.every((card) =>
        object(card) && exact(card, ["count", "enabled", "kind"], ["cardId", "disabledReason"]) &&
        nonNegativeInt(card.count, 25) && card.count >= 1 && typeof card.enabled === "boolean" &&
        (!card.enabled || card.cardId !== undefined) && playableDevelopmentKinds.has(card.kind as string) &&
        (card.cardId === undefined || boundedString(card.cardId)) &&
        (card.disabledReason === undefined || reason(card.disabledReason)))) return false;
  const advertisedKinds = turn.developmentCards.map((card) => card.kind);
  const advertisedCardIds = turn.developmentCards.flatMap((card) => card.cardId === undefined ? [] : [card.cardId]);
  if (!unique(advertisedKinds) || !unique(advertisedCardIds) || !turn.developmentCards.every((card) =>
    card.cardId === undefined || privateCards.get(card.cardId) === card.kind)) return false;

  if (!object(value.maritime) || !exact(value.maritime, ["enabled", "ratios", "trades"], ["disabledReason"]) ||
      typeof value.maritime.enabled !== "boolean" || (value.maritime.disabledReason !== undefined && !reason(value.maritime.disabledReason)) ||
      !resourceMap(value.maritime.ratios) || !Array.isArray(value.maritime.trades) || value.maritime.trades.length > 5 ||
      !value.maritime.trades.every((trade) => object(trade) && exact(trade, ["give", "ratio", "receives"]) &&
        resources.includes(trade.give as never) && nonNegativeInt(trade.ratio, 4) && stringArray(trade.receives, 4) &&
        trade.receives.every((resource) => resources.includes(resource as never)))) return false;

  if (!object(value.commerce) || !exact(value.commerce, ["tradeSlots", "transfer", "startGathering", "openAuction", "redeemGathering", "redeemPrize"]) ||
      !Array.isArray(value.commerce.tradeSlots) || value.commerce.tradeSlots.length > 16 || !value.commerce.tradeSlots.every((slot) =>
        availability(slot, 0, undefined, ["id"]) && boundedString(slot.id)) ||
      !availability(value.commerce.transfer, 0, undefined, ["maxAmount", "recipientIds"]) || !nonNegativeInt(value.commerce.transfer.maxAmount) ||
      !stringArray(value.commerce.transfer.recipientIds, 3) || !value.commerce.transfer.recipientIds.every((id) => playerIds.has(id)) ||
      !availability(value.commerce.startGathering, 0) || !availability(value.commerce.openAuction, 0) ||
      !availability(value.commerce.redeemGathering, 5, new Set(resources), ["maxAmount", "bankStock"]) ||
      !nonNegativeInt(value.commerce.redeemGathering.maxAmount, 4) || !resourceMap(value.commerce.redeemGathering.bankStock) ||
      !availability(value.commerce.redeemPrize, 0)) return false;

  if (!object(value.setup) || !exact(value.setup, ["settlement", "road"]) ||
      !availability(value.setup.settlement, 54, boardIds.vertexIds) || !availability(value.setup.road, 72, boardIds.edgeIds) ||
      !object(value.decisions) || !exact(value.decisions, ["discard", "robberHex", "robberVictim", "freeRoad", "yearOfPlenty", "monopoly"]) ||
      !availability(value.decisions.discard, 0, undefined, ["exactCount", "maxByResource"]) ||
      !nonNegativeInt(value.decisions.discard.exactCount, 48) || !resourceMap(value.decisions.discard.maxByResource) ||
      !availability(value.decisions.robberHex, 18, boardIds.hexIds) || !availability(value.decisions.robberVictim, 3, playerIds) ||
      !availability(value.decisions.freeRoad, 72, boardIds.edgeIds, ["remainingRoads"]) || !nonNegativeInt(value.decisions.freeRoad.remainingRoads, 2) ||
      !availability(value.decisions.yearOfPlenty, 5, new Set(resources), ["remainingPicks"]) || !nonNegativeInt(value.decisions.yearOfPlenty.remainingPicks, 2) ||
      !availability(value.decisions.monopoly, 5, new Set(resources))) return false;

  if (!object(value.publicTrade) || !exact(value.publicTrade, ["publish", "cancel", "accept"]) ||
      !availability(value.publicTrade.publish, 0, undefined, ["maxOfferResources"]) || !resourceMap(value.publicTrade.publish.maxOfferResources) ||
      !availability(value.publicTrade.cancel, 0) || !availability(value.publicTrade.accept, 0) ||
      !object(value.sealedBid) || !exact(value.sealedBid, ["enabled", "round", "maxAmount", "submitted"], ["disabledReason"]) ||
      typeof value.sealedBid.enabled !== "boolean" || !nonNegativeInt(value.sealedBid.round, 4) || !nonNegativeInt(value.sealedBid.maxAmount) ||
      typeof value.sealedBid.submitted !== "boolean" || (value.sealedBid.disabledReason !== undefined && !reason(value.sealedBid.disabledReason))) return false;
  return true;
}

function privateState(value: unknown): value is PrivateSeatState {
  if (!object(value) || !exact(value, ["seatId", "seatTokenPresent", "canRestartMatch"], ["playerId", "resources", "developmentCards", "ownPendingBid", "requiredDecision"]) ||
      !boundedString(value.seatId) || value.seatTokenPresent !== true || typeof value.canRestartMatch !== "boolean" || !boundedString(value.playerId) || !resourceMap(value.resources) ||
      !Array.isArray(value.developmentCards) || value.developmentCards.length > 25 || !value.developmentCards.every((card) =>
        object(card) && exact(card, ["id", "kind", "purchasedTurn", "revealed"]) && boundedString(card.id) &&
        developmentKinds.has(card.kind as string) && nonNegativeInt(card.purchasedTurn) && typeof card.revealed === "boolean") ||
      (value.ownPendingBid !== undefined && !nonNegativeInt(value.ownPendingBid))) return false;
  if (value.requiredDecision === undefined) return true;
  if (!object(value.requiredDecision) || !boundedString(value.requiredDecision.kind, 32)) return false;
  const decision = value.requiredDecision;
  if (decision.kind === "discardResources") return exact(decision, ["kind", "count"]) && nonNegativeInt(decision.count, 48);
  if (decision.kind === "placeRobber" || decision.kind === "chooseMonopolyResource") return exact(decision, ["kind"]);
  if (decision.kind === "chooseRobberVictim") return exact(decision, ["kind", "eligiblePlayerIds"]) && stringArray(decision.eligiblePlayerIds, 3);
  if (decision.kind === "placeFreeRoad") return exact(decision, ["kind", "remainingRoads"]) && nonNegativeInt(decision.remainingRoads, 2);
  return decision.kind === "chooseYearOfPlentyResource" && exact(decision, ["kind", "remainingPicks"]) && nonNegativeInt(decision.remainingPicks, 2);
}

function publicLogEntry(value: unknown, boardIds: BoardIds): boolean {
  if (!object(value) || !exact(value, ["id"], ["messageKey", "params"]) ||
      !boundedString(value.id) ||
      (value.messageKey !== undefined && !publicLogKeys.has(value.messageKey as string))) return false;
  if (value.messageKey === "robber.moved") {
    return object(value.params) && exact(value.params, ["hexId"]) &&
      boardIds.hexIds.has(value.params.hexId as string);
  }
  return value.params === undefined || (object(value.params) && Object.keys(value.params).length <= 10 &&
    Object.entries(value.params).every(([key, param]) =>
      boundedString(key, 32) && (boundedString(param, 128) || nonNegativeInt(param))));
}

function publicGame(value: unknown, mapSeed: MapSeed, boardIds: BoardIds): value is PublicGameView {
  if (!object(value) || !exact(value,
    ["phase", "players", "activePlayerId", "turn", "round", "turnState", "targetScore", "mapSeed", "buildings", "roads", "robberHexId", "bank", "log", "developmentDeckCount", "lastDice"],
    ["pendingPlayerTrade", "setup", "winnerId", "largestArmyOwnerId", "longestRoadOwnerId"]) ||
    !phases.has(value.phase as string) || value.mapSeed !== mapSeed || !boundedString(value.activePlayerId) ||
    !nonNegativeInt(value.turn) || !nonNegativeInt(value.round) || !nonNegativeInt(value.targetScore, 100) || !boardIds.hexIds.has(value.robberHexId as string) ||
    !object(value.turnState) || !exact(value.turnState, ["phase", "awaitedPlayerIds"]) || !turnPhases.has(value.turnState.phase as string) ||
    !stringArray(value.turnState.awaitedPlayerIds, 4) || !object(value.bank) || !exact(value.bank, ["resources"]) || !resourceMap(value.bank.resources) ||
    !nonNegativeInt(value.developmentDeckCount, 25) || (value.lastDice !== null && (!object(value.lastDice) || !exact(value.lastDice, ["first", "second", "total"]) ||
      !nonNegativeInt(value.lastDice.first, 6) || !nonNegativeInt(value.lastDice.second, 6) || !nonNegativeInt(value.lastDice.total, 12)))) return false;
  if (!Array.isArray(value.players) || value.players.length < 3 || value.players.length > 4 || !value.players.every((player) =>
    object(player) && exact(player, ["playerId", "color", "resourceCardCount", "developmentCardCount", "visibleScore", "guildTokens", "vouchers", "prizeCards", "knightsPlayed"]) &&
    boundedString(player.playerId) && boundedString(player.color, 32) &&
    [player.resourceCardCount, player.developmentCardCount, player.visibleScore, player.guildTokens, player.vouchers, player.prizeCards, player.knightsPlayed]
      .every((count) => nonNegativeInt(count)))) return false;
  const playerIds = new Set(value.players.map((player) => player.playerId));
  if (!playerIds.has(value.activePlayerId as string) || !value.turnState.awaitedPlayerIds.every((id) => playerIds.has(id))) return false;
  if (!Array.isArray(value.buildings) || value.buildings.length > 20 || !value.buildings.every((building) => object(building) &&
      exact(building, ["id", "ownerId", "vertexId", "kind"]) && boundedString(building.id) && playerIds.has(building.ownerId as string) &&
      boardIds.vertexIds.has(building.vertexId as string) && (building.kind === "settlement" || building.kind === "city")) ||
      !Array.isArray(value.roads) || value.roads.length > 60 || !value.roads.every((road) => object(road) && exact(road, ["ownerId", "edgeId"]) &&
        playerIds.has(road.ownerId as string) && boardIds.edgeIds.has(road.edgeId as string))) return false;
  if ((value.phase === "setup") !== (value.setup !== undefined)) return false;
  if (value.setup !== undefined) {
    const setup = value.setup;
    if (!object(setup) || !exact(setup, ["order", "placementIndex", "stage"], ["pendingSettlement"]) ||
        !stringArray(setup.order, 8) || setup.order.length !== value.players.length * 2 ||
        !nonNegativeInt(setup.placementIndex, setup.order.length - 1) ||
        (setup.stage !== "settlement" && setup.stage !== "road")) return false;
    const firstPass = value.players.map((player) => player.playerId);
    const expectedOrder = [...firstPass, ...firstPass.slice().reverse()];
    if (setup.order.some((id, index) => id !== expectedOrder[index]) ||
        value.activePlayerId !== setup.order[setup.placementIndex]) return false;
    if (setup.stage === "settlement") {
      if (setup.pendingSettlement !== undefined) return false;
    } else {
      const pending = setup.pendingSettlement;
      if (!object(pending) || !exact(pending, ["playerId", "vertexId"]) ||
          pending.playerId !== value.activePlayerId || !boardIds.vertexIds.has(pending.vertexId as string) ||
          !value.buildings.some((building) => object(building) && building.ownerId === pending.playerId &&
            building.vertexId === pending.vertexId && building.kind === "settlement")) return false;
    }
  }
  if (!Array.isArray(value.log) || value.log.length > 6 ||
      !value.log.every((entry) => publicLogEntry(entry, boardIds))) return false;
  if (value.pendingPlayerTrade !== undefined && (!object(value.pendingPlayerTrade) || !exact(value.pendingPlayerTrade, ["proposerId", "offered", "requested"]) ||
      !playerIds.has(value.pendingPlayerTrade.proposerId as string) || !resourceMap(value.pendingPlayerTrade.offered) || !resourceMap(value.pendingPlayerTrade.requested))) return false;
  return [value.winnerId, value.largestArmyOwnerId, value.longestRoadOwnerId].every((id) => id === undefined || playerIds.has(id as string));
}

function publicGuild(value: unknown, playerIds: ReadonlySet<string>): value is PublicGuildView {
  if (!object(value) || !exact(value, ["tradeSlots", "usedTradePlayerIds", "gathering"]) || !Array.isArray(value.tradeSlots) || value.tradeSlots.length > 16 ||
      !value.tradeSlots.every((slot) => object(slot) && exact(slot, ["id", "requires", "tokenReward"]) && boundedString(slot.id) && resourceCost(slot.requires) && nonNegativeInt(slot.tokenReward)) ||
      !stringArray(value.usedTradePlayerIds, 4) || !value.usedTradePlayerIds.every((id) => playerIds.has(id)) || !object(value.gathering) ||
      !exact(value.gathering, ["phase", "auctionRound", "auctionResults"], ["lastAuctionResult"]) || !gatheringPhases.has(value.gathering.phase as string) ||
      !nonNegativeInt(value.gathering.auctionRound, 4) ||
      (value.gathering.phase === "auction" && (value.gathering.auctionRound as number) > 3) ||
      !Array.isArray(value.gathering.auctionResults) || value.gathering.auctionResults.length > 3) return false;
  const outcome = (candidate: unknown) => object(candidate) && exact(candidate, ["kind"], ["resourceCardCount"]) &&
    (candidate.kind === "voucher" || candidate.kind === "developmentCard" || (candidate.kind === "resources" && nonNegativeInt(candidate.resourceCardCount, 5)));
  if (!value.gathering.auctionResults.every(outcome)) return false;
  const last = value.gathering.lastAuctionResult;
  return last === undefined || (object(last) && exact(last, ["winnerId", "winnerName", "round", "winningBid", "outcome"]) &&
    playerIds.has(last.winnerId as string) && boundedString(last.winnerName, 20) && nonNegativeInt(last.round, 3) && nonNegativeInt(last.winningBid) && outcome(last.outcome));
}

export function parseOnlineGameProjection(snapshot: RoomSnapshotMessage | undefined): ParsedOnlineGameProjection | undefined {
  if (!snapshot || (snapshot.lifecycle !== "playing" && snapshot.lifecycle !== "finished") || !object(snapshot.publicState)) return undefined;
  const publicState = snapshot.publicState;
  const gameCandidate = publicState.game;
  if (!object(gameCandidate)) return undefined;
  let mapSeed: MapSeed;
  let boardData: StandardBoardData;
  try {
    mapSeed = parseMapSeed(gameCandidate.mapSeed);
    boardData = createBoardDataForSeed(mapSeed);
  } catch {
    return undefined;
  }
  const boardIds = boardIdsFor(boardData);
  if (!privateState(snapshot.privateState) || !publicGame(gameCandidate, mapSeed, boardIds)) return undefined;
  const game = gameCandidate;
  const playerIds = new Set(game.players.map((player) => player.playerId));
  if (playerIds.size !== game.players.length || !object(publicState) || !exact(publicState, ["roomCode", "lifecycle", "roomVersion", "seats", "game", "guild", "submittedBidSeatIds"]) ||
      !boundedString(publicState.roomCode, 6) || publicState.roomCode !== publicState.roomCode.toUpperCase() ||
      publicState.lifecycle !== snapshot.lifecycle || publicState.roomVersion !== snapshot.roomVersion ||
      !Array.isArray(publicState.seats) || publicState.seats.length !== game.players.length || !publicState.seats.every((seat) =>
        object(seat) && exact(seat, ["seatId", "playerId", "nickname", "ready"]) && boundedString(seat.seatId) && boundedString(seat.playerId) &&
        playerIds.has(seat.playerId as string) && boundedString(seat.nickname, 20) && typeof seat.ready === "boolean") ||
      !stringArray(publicState.submittedBidSeatIds, 4) || !publicGuild(publicState.guild, playerIds)) return undefined;
  const seatIds = new Set(publicState.seats.map((seat) => seat.seatId));
  const seatedPlayerIds = new Set(publicState.seats.map((seat) => seat.playerId));
  const submittedBidSeatIds = new Set(publicState.submittedBidSeatIds);
  const presenceSeatIds = new Set(snapshot.presence.map((entry) => entry.seatId));
  if (seatIds.size !== publicState.seats.length || seatedPlayerIds.size !== playerIds.size ||
      submittedBidSeatIds.size !== publicState.submittedBidSeatIds.length ||
      presenceSeatIds.size !== snapshot.presence.length ||
      snapshot.presence.some((entry) => entry.online !== (entry.connectionCount > 0))) return undefined;
  const privateSeat = publicState.seats.find((seat) => seat.seatId === snapshot.privateState.seatId);
  const privateCards = new Map(snapshot.privateState.developmentCards?.map((card) => [card.id, card.kind]) ?? []);
  const buildingIds = new Set(game.buildings.map((building) => building.id));
  if (!privateSeat || privateSeat.playerId !== snapshot.privateState.playerId ||
      !publicState.submittedBidSeatIds.every((id) => seatIds.has(id)) ||
      snapshot.presence.length !== publicState.seats.length || !snapshot.presence.every((entry) => seatIds.has(entry.seatId)) ||
      !allowedActions(snapshot.allowedActions, playerIds, buildingIds, privateCards, boardIds)) return undefined;
  const result: ProjectedRoomView & { readonly boardData: StandardBoardData } = {
    publicState: publicState as unknown as PublicRoomState,
    privateState: snapshot.privateState,
    allowedActions: snapshot.allowedActions,
    boardData
  };
  return result as ParsedOnlineGameProjection;
}
