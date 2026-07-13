import { formatAvailabilityReason, type AvailabilityFact, type AvailabilityReason } from "../app/actionAvailability";
import type { GameTableActions, GameTableIntent, GameTableView } from "../ui/GameTable";
import type { OnlineAllowedActions } from "./allowedActions";
import type { OnlineClientState } from "./onlineReducer";
import type { ClientWebSocketMessage, OnlineMatchCommand, RoomSnapshotMessage } from "./protocol";
import type { PrivateSeatState, PublicGameView } from "./view";
import { parseOnlineGameProjection } from "./onlineGameProjection";

type SendMessage = (message: ClientWebSocketMessage) => boolean;

const disconnectedReason = "The online connection is not ready.";

export const readOnlineGameProjection = parseOnlineGameProjection;

function reason(value?: AvailabilityReason): string | undefined {
  return formatAvailabilityReason(value);
}

function availability(value: AvailabilityFact<string>, connected: boolean) {
  return connected
    ? { enabled: value.enabled, ...(reason(value.disabledReason) ? { reason: reason(value.disabledReason) } : {}), targets: [...value.targets] }
    : { enabled: false, reason: disconnectedReason, targets: [] };
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
  const boardData = projected.boardData;
  return {
    game: {
      phase: game.phase,
      players: game.players.map((player) => ({ id: player.playerId,
        name: publicState.seats.find((seat) => seat.playerId === player.playerId)?.nickname ?? player.playerId,
        color: player.color,
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
      buildings: game.buildings.map((building) => ({ ...building })),
      roads: game.roads.map((road) => ({ id: `${road.ownerId}:${road.edgeId}`, ...road })),
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
    decisionPolicy: {
      discard: { ...availability(allowedActions.decisions.discard, connected), exactCount: allowedActions.decisions.discard.exactCount,
        maxByResource: { ...allowedActions.decisions.discard.maxByResource } },
      robberHex: availability(allowedActions.decisions.robberHex, connected),
      robberVictim: availability(allowedActions.decisions.robberVictim, connected),
      freeRoad: { ...availability(allowedActions.decisions.freeRoad, connected), remainingRoads: allowedActions.decisions.freeRoad.remainingRoads },
      yearOfPlenty: { ...availability(allowedActions.decisions.yearOfPlenty, connected), remainingPicks: allowedActions.decisions.yearOfPlenty.remainingPicks },
      monopoly: availability(allowedActions.decisions.monopoly, connected)
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
