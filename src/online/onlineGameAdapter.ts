import { formatAvailabilityReason, type AvailabilityFact, type AvailabilityReason } from "../app/actionAvailability";
import { createStandardBoardData } from "../domain/board";
import { resources, type ResourceMap } from "../domain/types";
import type { GameTableActions, GameTableIntent, GameTableView } from "../ui/GameTable";
import type { OnlineAllowedActions } from "./allowedActions";
import type { OnlineClientState } from "./onlineReducer";
import type { ClientWebSocketMessage, OnlineMatchCommand, RoomSnapshotMessage } from "./protocol";
import type { PrivateSeatState, ProjectedRoomView, PublicGameView, PublicGuildView, PublicRoomState } from "./view";

type SendMessage = (message: ClientWebSocketMessage) => boolean;

const disconnectedReason = "The online connection is not ready.";
const standardGeometry = createStandardBoardData();
const standardHexIds = new Set(standardGeometry.board.map((hex) => hex.id));
const standardVertexIds = new Set(standardGeometry.board.flatMap((hex) => hex.vertexIds));
const standardEdgeIds = new Set(standardGeometry.edges.map((edge) => edge.id));

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isResourceMap(value: unknown): value is ResourceMap {
  return isObject(value) && resources.every((resource) =>
    Number.isSafeInteger(value[resource]) && (value[resource] as number) >= 0
  );
}

function isAvailability(value: unknown): value is AvailabilityFact<string> {
  return isObject(value) && typeof value.enabled === "boolean" && isStringArray(value.targets) &&
    (value.disabledReason === undefined || (isObject(value.disabledReason) && typeof value.disabledReason.code === "string"));
}

function isAllowedActions(value: unknown): value is OnlineAllowedActions {
  if (!isObject(value) || !isObject(value.turn) || !isObject(value.maritime) ||
      !isObject(value.commerce) || !isObject(value.setup) || !isObject(value.decisions) ||
      !isObject(value.publicTrade) || !isObject(value.sealedBid)) return false;
  const turn = value.turn;
  const maritime = value.maritime;
  const commerce = value.commerce;
  const decisions = value.decisions;
  if (![turn.roll, turn.endTurn, turn.road, turn.settlement, turn.city, turn.buyDevelopmentCard]
    .every(isAvailability)) return false;
  if (!Array.isArray(turn.developmentCards) || !turn.developmentCards.every((card) =>
    isObject(card) && typeof card.kind === "string" && typeof card.count === "number" && typeof card.enabled === "boolean"
  )) return false;
  if (typeof maritime.enabled !== "boolean" || !isObject(maritime.ratios)) return false;
  const maritimeRatios = maritime.ratios;
  if (!resources.every((resource) => Number.isSafeInteger(maritimeRatios[resource])) ||
      !Array.isArray(maritime.trades) || !maritime.trades.every((trade) =>
        isObject(trade) && typeof trade.give === "string" && Number.isSafeInteger(trade.ratio) && isStringArray(trade.receives))) return false;
  if (!Array.isArray(commerce.tradeSlots) || !commerce.tradeSlots.every((slot) =>
    isObject(slot) && isAvailability(slot) && typeof slot.id === "string")) return false;
  if (![commerce.transfer, commerce.startGathering, commerce.openAuction, commerce.redeemGathering, commerce.redeemPrize]
    .every(isAvailability)) return false;
  if (!isObject(commerce.transfer) || !isObject(commerce.redeemGathering) ||
      !Number.isSafeInteger(commerce.transfer.maxAmount) || !isStringArray(commerce.transfer.recipientIds) ||
      !Number.isSafeInteger(commerce.redeemGathering.maxAmount) || !isResourceMap(commerce.redeemGathering.bankStock)) return false;
  if (!isAvailability(value.setup.settlement) || !isAvailability(value.setup.road)) return false;
  if (![decisions.discard, decisions.robberHex, decisions.robberVictim, decisions.freeRoad, decisions.yearOfPlenty, decisions.monopoly]
    .every(isAvailability)) return false;
  if (![value.publicTrade.publish, value.publicTrade.cancel, value.publicTrade.accept].every(isAvailability)) return false;
  if (!isObject(value.publicTrade.publish) || !isResourceMap(value.publicTrade.publish.maxOfferResources)) return false;
  return typeof value.sealedBid.enabled === "boolean" && Number.isSafeInteger(value.sealedBid.maxAmount) &&
    typeof value.sealedBid.submitted === "boolean";
}

function isPublicGame(value: unknown): value is PublicGameView {
  if (!isObject(value) || !Array.isArray(value.players) || !isObject(value.turnState) ||
      value.boardLayout !== "standard-v1" || !Array.isArray(value.buildings) || !Array.isArray(value.roads) || !isObject(value.bank) ||
      !isResourceMap(value.bank.resources) || !Array.isArray(value.log)) return false;
  if (typeof value.phase !== "string" || typeof value.activePlayerId !== "string" ||
      typeof value.turnState.phase !== "string" || !isStringArray(value.turnState.awaitedPlayerIds)) return false;
  if (!value.players.every((player) => isObject(player) && typeof player.playerId === "string" &&
      typeof player.nickname === "string" && typeof player.color === "string" &&
      [player.visibleScore, player.resourceCardCount, player.developmentCardCount, player.guildTokens,
        player.vouchers, player.prizeCards, player.knightsPlayed].every(Number.isFinite) &&
      !Object.hasOwn(player, "resources") && !Object.hasOwn(player, "developmentCards"))) return false;
  return value.buildings.every((building) => isObject(building) && typeof building.id === "string" &&
      typeof building.ownerId === "string" && typeof building.vertexId === "string" && standardVertexIds.has(building.vertexId) &&
      (building.kind === "settlement" || building.kind === "city")) &&
    value.roads.every((road) => isObject(road) && typeof road.id === "string" && typeof road.ownerId === "string" &&
      typeof road.edgeId === "string" && standardEdgeIds.has(road.edgeId)) &&
    value.log.every((entry) => isObject(entry) && typeof entry.id === "string");
}

function isPublicGuild(value: unknown): value is PublicGuildView {
  return isObject(value) && Array.isArray(value.tradeSlots) && isObject(value.gathering) &&
    typeof value.gathering.phase === "string" && Number.isSafeInteger(value.gathering.auctionRound) &&
    value.tradeSlots.every((slot) => isObject(slot) && typeof slot.id === "string" &&
      isObject(slot.requires) && typeof slot.tokenReward === "number");
}

function isPrivateState(value: unknown): value is PrivateSeatState {
  if (!isObject(value) || typeof value.seatId !== "string" || value.seatTokenPresent !== true) return false;
  if (value.playerId !== undefined && typeof value.playerId !== "string") return false;
  if (value.resources !== undefined && !isResourceMap(value.resources)) return false;
  if (value.developmentCards !== undefined && (!Array.isArray(value.developmentCards) ||
      !value.developmentCards.every((card) => isObject(card) && typeof card.id === "string" &&
        typeof card.kind === "string" && typeof card.purchasedTurn === "number" && typeof card.revealed === "boolean"))) return false;
  if (value.playerId !== undefined && (!isResourceMap(value.resources) || !Array.isArray(value.developmentCards))) return false;
  return value.requiredDecision === undefined || (isObject(value.requiredDecision) && typeof value.requiredDecision.kind === "string");
}

export function readOnlineGameProjection(snapshot: RoomSnapshotMessage | undefined): ProjectedRoomView | undefined {
  if (!snapshot || (snapshot.lifecycle !== "playing" && snapshot.lifecycle !== "finished") ||
      !isObject(snapshot.publicState) || !isObject(snapshot.privateState) || !isAllowedActions(snapshot.allowedActions)) return undefined;
  const publicState = snapshot.publicState;
  if (typeof publicState.roomCode !== "string" || publicState.lifecycle !== snapshot.lifecycle ||
      publicState.roomVersion !== snapshot.roomVersion || !Array.isArray(publicState.seats) ||
      !isStringArray(publicState.submittedBidSeatIds) || !isPublicGame(publicState.game) ||
      !isPublicGuild(publicState.guild) || !isPrivateState(snapshot.privateState)) return undefined;
  if (!publicState.seats.every((seat) => isObject(seat) && typeof seat.seatId === "string" &&
      typeof seat.nickname === "string" && typeof seat.ready === "boolean" &&
      (seat.playerId === undefined || typeof seat.playerId === "string"))) return undefined;
  const privateState = snapshot.privateState;
  const callerSeat = publicState.seats.find((seat) => seat.seatId === privateState.seatId);
  if (!callerSeat || callerSeat.playerId !== privateState.playerId ||
      !publicState.game.players.some((player) => player.playerId === privateState.playerId)) return undefined;
  const publicSeats = publicState.seats as PublicRoomState["seats"];
  if (!standardHexIds.has(publicState.game.robberHexId) ||
      !snapshot.presence.every((entry) => publicSeats.some((seat) => seat.seatId === entry.seatId))) return undefined;
  return { publicState: publicState as unknown as PublicRoomState, privateState, allowedActions: snapshot.allowedActions };
}

function reason(value?: AvailabilityReason): string | undefined {
  return formatAvailabilityReason(value);
}

function availability(value: AvailabilityFact<string>, connected: boolean) {
  return connected
    ? { enabled: value.enabled, ...(reason(value.disabledReason) ? { reason: reason(value.disabledReason) } : {}), targets: [...value.targets] }
    : { enabled: false, reason: disconnectedReason, targets: [...value.targets] };
}

function projectActions(source: OnlineAllowedActions, connected: boolean, privateState: PrivateSeatState, game: PublicGameView): GameTableActions {
  const action = (value: AvailabilityFact<string>) => availability(value, connected);
  return {
    roll: action(source.turn.roll), endTurn: action(source.turn.endTurn), road: action(source.turn.road),
    settlement: action(source.turn.settlement), city: action(source.turn.city),
    buyDevelopmentCard: action(source.turn.buyDevelopmentCard),
    developmentCards: source.turn.developmentCards.map((card) => ({
      ...(card.cardId ? { cardId: card.cardId } : {}), count: card.count,
      enabled: connected && card.enabled, kind: card.kind,
      ...(connected ? (reason(card.disabledReason) ? { reason: reason(card.disabledReason) } : {}) : { reason: disconnectedReason })
    })),
    maritime: {
      enabled: connected && source.maritime.enabled,
      ...(connected ? (reason(source.maritime.disabledReason) ? { reason: reason(source.maritime.disabledReason) } : {}) : { reason: disconnectedReason }),
      ratios: { ...source.maritime.ratios },
      trades: source.maritime.trades.map((trade) => ({ ...trade, receives: [...trade.receives] }))
    },
    commerce: {
      tradeSlots: source.commerce.tradeSlots.map((slot) => ({ id: slot.id, ...action(slot) })),
      transfer: { ...action(source.commerce.transfer), maxAmount: source.commerce.transfer.maxAmount, recipientIds: [...source.commerce.transfer.recipientIds] },
      startGathering: action(source.commerce.startGathering), openAuction: action(source.commerce.openAuction),
      redeemPrize: action(source.commerce.redeemPrize),
      gatheringPlayers: privateState.playerId ? [{
        id: privateState.playerId,
        tokens: game.players.find((player) => player.playerId === privateState.playerId)?.guildTokens ?? 0,
        remainingAllowance: source.commerce.redeemGathering.maxAmount,
        bankStock: { ...source.commerce.redeemGathering.bankStock }
      }] : []
    }
  };
}

function decision(privateState: PrivateSeatState): GameTableView["controlledPlayers"][number]["decision"] {
  const required = privateState.requiredDecision;
  if (!required) return undefined;
  if (required.kind === "discardResources") return { kind: "discard", count: required.count };
  if (required.kind === "placeRobber" || required.kind === "chooseRobberVictim") return { kind: "robber" };
  return { kind: "development" };
}

export function createOnlineGameTableView(state: OnlineClientState): GameTableView {
  const projected = readOnlineGameProjection(state.snapshot);
  if (!projected?.allowedActions) throw new Error("Invalid online game projection.");
  const { publicState, privateState, allowedActions } = projected;
  const game = publicState.game!;
  const guild = publicState.guild!;
  const connected = state.status === "connected" && state.snapshot?.lifecycle === "playing";
  const ownPlayer = game.players.find((player) => player.playerId === privateState.playerId)!;
  const ownSeat = publicState.seats.find((seat) => seat.seatId === privateState.seatId)!;
  const tableActions = projectActions(allowedActions, connected, privateState, game);
  const required = privateState.requiredDecision;
  const boardData = standardGeometry;
  return {
    game: {
      phase: game.phase,
      players: game.players.map((player) => ({ id: player.playerId, name: player.nickname, color: player.color,
        visibleScore: player.visibleScore, resourceCardCount: player.resourceCardCount,
        developmentCardCount: player.developmentCardCount, guildTokens: player.guildTokens,
        vouchers: player.vouchers, prizeCards: player.prizeCards, knightsPlayed: player.knightsPlayed })),
      activePlayerId: game.activePlayerId, turn: game.turn, round: game.round,
      turnState: {
        phase: game.turnState.phase, awaitedPlayerIds: [...game.turnState.awaitedPlayerIds],
        ...(required?.kind === "chooseRobberVictim" ? { pendingRobber: { eligibleVictimIds: [...allowedActions.decisions.robberVictim.targets] } } : {}),
        ...(required?.kind === "placeFreeRoad" ? { pendingDevelopmentEffect: { kind: "roadBuilding" as const, remainingRoads: required.remainingRoads } } :
          required?.kind === "chooseYearOfPlentyResource" ? { pendingDevelopmentEffect: { kind: "yearOfPlenty" as const, remainingPicks: required.remainingPicks } } :
            required?.kind === "chooseMonopolyResource" ? { pendingDevelopmentEffect: { kind: "monopoly" as const } } : {})
      },
      targetScore: game.targetScore,
      board: boardData.board.map(({ edgeIds: _edgeIds, ...hex }) => ({ ...hex, vertexIds: [...hex.vertexIds] })),
      edges: boardData.edges.map(({ hexId: _hexId, ...edge }) => ({ ...edge, vertexIds: [...edge.vertexIds] as [string, string] })),
      ports: boardData.ports.map((port) => ({ ...port, vertexIds: [...port.vertexIds] })),
      buildings: game.buildings.map((building) => ({ ...building })), roads: game.roads.map((road) => ({ ...road })),
      robberHexId: game.robberHexId, bank: { resources: { ...game.bank.resources } },
      log: game.log.map((entry) => ({ id: entry.id, fallbackText: "Game activity updated.",
        ...(entry.messageKey ? { messageKey: entry.messageKey } : {}), ...(entry.params ? { params: { ...entry.params } } : {}) })),
      developmentDeckCount: game.developmentDeckCount,
      ...(game.setup ? { setup: { stage: game.setup.stage } } : {}), ...(game.winnerId ? { winnerId: game.winnerId } : {})
    },
    guild: {
      tradeSlots: guild.tradeSlots.map((slot) => ({ id: slot.id, requires: { ...slot.requires }, tokenReward: slot.tokenReward })),
      gathering: { phase: guild.gathering.phase, auctionRound: guild.gathering.auctionRound,
        ...(guild.gathering.lastAuctionResult ? { lastAuctionResult: { ...guild.gathering.lastAuctionResult, outcome: { ...guild.gathering.lastAuctionResult.outcome } } } : {}) }
    },
    controlledPlayers: [{
      controlId: privateState.seatId,
      displaySlot: game.players.findIndex((player) => player.playerId === privateState.playerId),
      displayName: ownSeat.nickname, isActive: privateState.playerId === game.activePlayerId,
      resources: { ...privateState.resources! }, developmentCards: privateState.developmentCards!.map((card) => ({ ...card })),
      guildTokens: ownPlayer.guildTokens, gatheringRemainingAllowance: allowedActions.commerce.redeemGathering.maxAmount,
      gatheringBankStock: { ...allowedActions.commerce.redeemGathering.bankStock },
      ...(decision(privateState) ? { decision: decision(privateState) } : {}),
      ...(game.pendingPlayerTrade
        ? game.pendingPlayerTrade.proposerId === privateState.playerId && allowedActions.publicTrade.cancel.enabled
          ? { tradeResponse: { kind: "cancel" as const } }
          : { tradeResponse: { kind: "accept" as const, ...(reason(allowedActions.publicTrade.accept.disabledReason) ? { reason: reason(allowedActions.publicTrade.accept.disabledReason) } : {}) } }
        : {})
    }],
    lastDice: game.lastDice ? { ...game.lastDice } : null,
    ...(game.pendingPlayerTrade ? { pendingPlayerTrade: { proposerId: game.pendingPlayerTrade.proposerId,
      offered: { ...game.pendingPlayerTrade.offered }, requested: { ...game.pendingPlayerTrade.requested } } } : {}),
    selectedDiceTotal: 8, selectedPlayerId: privateState.playerId!,
    notice: state.notice?.code === "VERSION_CONFLICT" ? "The room changed. Review the latest snapshot before trying again." : null,
    legality: {
      actions: tableActions,
      ...(game.phase === "setup" ? { setupControlId: privateState.seatId } : {}),
      setupRoadEdgeIds: [...allowedActions.setup.road.targets], setupSettlementVertexIds: [...allowedActions.setup.settlement.targets],
      freeRoadEdgeIds: [...allowedActions.decisions.freeRoad.targets]
    },
    tradePolicy: {
      publishEnabled: connected && allowedActions.publicTrade.publish.enabled,
      ...(connected ? (reason(allowedActions.publicTrade.publish.disabledReason) ? { publishReason: reason(allowedActions.publicTrade.publish.disabledReason) } : {}) : { publishReason: disconnectedReason }),
      maxOfferResources: { ...allowedActions.publicTrade.publish.maxOfferResources }
    },
    sealedAuction: {
      viewerSeatId: privateState.seatId,
      seats: publicState.seats.map((seat) => ({ seatId: seat.seatId, nickname: seat.nickname, submitted: publicState.submittedBidSeatIds.includes(seat.seatId) })),
      ...(privateState.ownPendingBid !== undefined ? { ownPendingBid: privateState.ownPendingBid } : {}),
      enabled: connected && allowedActions.sealedBid.enabled,
      maxAmount: allowedActions.sealedBid.maxAmount, submitted: allowedActions.sealedBid.submitted,
      ...(connected ? (reason(allowedActions.sealedBid.disabledReason) ? { reason: reason(allowedActions.sealedBid.disabledReason) } : {}) : { reason: disconnectedReason })
    },
    newGameEnabled: false
  };
}

function matchCommand(intent: GameTableIntent): OnlineMatchCommand | undefined {
  switch (intent.type) {
    case "turn.roll": return { type: "ROLL_DICE" };
    case "turn.end": return { type: "END_TURN" };
    case "build.road": return { type: "BUILD_ROAD", edgeId: intent.edgeId };
    case "build.settlement": return { type: "BUILD_SETTLEMENT", vertexId: intent.vertexId };
    case "build.city": return { type: "BUILD_CITY", buildingId: intent.buildingId };
    case "setup.settlement": return { type: "PLACE_SETUP_SETTLEMENT", vertexId: intent.vertexId };
    case "setup.road": return { type: "PLACE_SETUP_ROAD", edgeId: intent.edgeId };
    case "robber.place": return { type: "PLACE_ROBBER", hexId: intent.hexId };
    case "robber.steal": return { type: "STEAL_ROBBER_RESOURCE", victimId: intent.victimId };
    case "development.buy": return { type: "BUY_DEVELOPMENT_CARD" };
    case "development.play": return { type: "PLAY_DEVELOPMENT_CARD", cardId: intent.cardId };
    case "development.chooseResource": return { type: intent.choice === "yearOfPlenty" ? "CHOOSE_YEAR_OF_PLENTY_RESOURCE" : "CHOOSE_MONOPOLY_RESOURCE", resource: intent.resource };
    case "development.placeRoad": return { type: "PLACE_FREE_ROAD", edgeId: intent.edgeId };
    case "trade.maritime": return { type: "MARITIME_TRADE", give: intent.give, receive: intent.receive };
    case "trade.publish": return { type: "PUBLISH_PLAYER_TRADE", offered: { ...intent.offered }, requested: { ...intent.requested } };
    case "trade.respond": return { type: intent.response === "accept" ? "ACCEPT_PLAYER_TRADE" : "CANCEL_PLAYER_TRADE" };
    case "decision.discard": return { type: "DISCARD_FOR_SEVEN", resources: { ...intent.resources } };
    case "commerce.completeSlot": return { type: "COMPLETE_TRADE_SLOT", slotId: intent.slotId };
    case "commerce.transfer": return { type: "TRANSFER_TOKENS", toPlayerId: intent.recipientId, amount: intent.amount };
    case "commerce.startGathering": return { type: "START_GATHERING" };
    case "commerce.redeem": return { type: "REDEEM_GATHERING", resources: { ...intent.resources } };
    case "commerce.openAuction": return { type: "OPEN_AUCTION" };
    case "commerce.redeemPrize": return { type: "REDEEM_PRIZE" };
    default: return undefined;
  }
}

export function createOnlineGameTableController(
  getState: () => OnlineClientState,
  send: SendMessage,
  createCommandId: () => string
): { dispatch(intent: GameTableIntent): boolean } {
  return {
    dispatch(intent) {
      const state = getState();
      const projected = readOnlineGameProjection(state.snapshot);
      if (state.status !== "connected" || state.snapshot?.lifecycle !== "playing" || !projected) return false;
      if (intent.type === "ui.selectDiceTotal" || intent.type === "ui.selectPlayer" || intent.type === "game.new") return false;
      const commandId = createCommandId();
      if (intent.type === "auction.submitBid") {
        return send({ type: "auction.submitBid", commandId, expectedVersion: state.snapshot.roomVersion, amount: intent.bid });
      }
      const command = matchCommand(intent);
      return command ? send({ type: "match.command", commandId, expectedVersion: state.snapshot.roomVersion, command }) : false;
    }
  };
}
