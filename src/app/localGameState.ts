import {
  formatAvailabilityReason,
  getActionAvailability,
  getActionAvailabilityFacts
} from "./actionAvailability";
import { formatM1MapSeed } from "../domain/mapSeed";
import { createSetupMatch, defaultMatchSeats } from "../domain/match/createMatch";
import type { MatchCommand, MatchExecutionContext, MatchState } from "../domain/match/types";
import type { RandomSource } from "../domain/match/random";
import { calculatePlayerScore } from "../domain/rules/scoring";
import {
  getPlayerTradeAcceptanceReason
} from "../domain/rules/playerTrade";
import {
  getDiceIncome,
  getExpectedIncomeMatrix,
  getPlayerIncome
} from "../domain/stats/income";
import type { PlayerId, ResourceMap } from "../domain/types";
import type {
  GameTableIntent,
  GameTableView
} from "../ui/GameTable";

export interface UiState {
  selectedDiceTotal: number;
  selectedPlayerId: PlayerId;
  notice: string | null;
}

export interface AppState extends MatchState, UiState {}

export type UiCommand =
  | { type: "SELECT_DICE_TOTAL"; diceTotal: number }
  | { type: "SELECT_PLAYER"; playerId: PlayerId };

export type GameCommand = MatchCommand | UiCommand;

class LocalRandomSource implements RandomSource {
  nextInt(maxExclusive: number): number {
    if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError("maxExclusive must be a positive safe integer.");
    }
    return Math.floor(Math.random() * maxExclusive);
  }
}

let logCounter = 0;

export const localMatchSeats = defaultMatchSeats;

export const localMatchExecutionContext: MatchExecutionContext = {
  random: new LocalRandomSource(),
  nextMapSeed: () => {
    const words = crypto.getRandomValues(new Uint32Array(2));
    return formatM1MapSeed(words[0], words[1]);
  },
  nextLogId: () => `log-${++logCounter}`,
  now: () => Date.now()
};

export function createUiState(selectedPlayerId: PlayerId): UiState {
  return {
    selectedDiceTotal: 8,
    selectedPlayerId,
    notice: null
  };
}

export function createInitialAppState(): AppState {
  const match = createSetupMatch(
    localMatchSeats,
    { kind: "fresh" },
    localMatchExecutionContext
  );
  return {
    ...match,
    ...createUiState(match.game.activePlayerId)
  };
}

function cloneResources(value: ResourceMap): ResourceMap {
  return { wood: value.wood, brick: value.brick, wool: value.wool, grain: value.grain, ore: value.ore };
}

function controlIdForIndex(index: number): string {
  return `local-control-${index + 1}`;
}

const unsafePublicLogKeys = new Set([
  "development.played",
  "development.yearOfPlentyLog",
  "development.monopolyLog",
  "trade.maritime",
  "guild.auctionResolved"
]);

function projectLocalLog(entry: AppState["game"]["log"][number]): GameTableView["game"]["log"][number] {
  if (!entry.messageKey || unsafePublicLogKeys.has(entry.messageKey)) {
    return {
      id: entry.id,
      fallbackText: entry.messageKey === "guild.auctionResolved"
        ? "The Commerce Guild auction was resolved."
        : entry.messageKey?.startsWith("development.")
          ? "A development-card action was completed."
          : entry.messageKey === "trade.maritime"
            ? "A maritime trade was completed."
            : "Game activity updated."
    };
  }
  const params = entry.params ?? {};
  const safeParams = {
    ...(typeof params.playerName === "string" ? { playerName: params.playerName } : {}),
    ...(typeof params.victimName === "string" ? { victimName: params.victimName } : {}),
    ...(typeof params.proposerName === "string" ? { proposerName: params.proposerName } : {}),
    ...(typeof params.acceptingPlayerName === "string" ? { acceptingPlayerName: params.acceptingPlayerName } : {}),
    ...(typeof params.fromName === "string" ? { fromName: params.fromName } : {}),
    ...(typeof params.toName === "string" ? { toName: params.toName } : {}),
    ...(typeof params.total === "number" ? { total: params.total } : {}),
    ...(typeof params.eventCount === "number" ? { eventCount: params.eventCount } : {}),
    ...(typeof params.hexId === "string" ? { hexId: params.hexId } : {}),
    ...(typeof params.round === "number" ? { round: params.round } : {}),
    ...(typeof params.amount === "number" ? { amount: params.amount } : {})
  };
  return { id: entry.id, fallbackText: "Game activity updated.", messageKey: entry.messageKey, params: safeParams };
}

function projectLocalActions(state: AppState): GameTableView["legality"]["actions"] {
  const source = getActionAvailability(state, state.game.activePlayerId);
  const availability = (value: { enabled: boolean; reason?: string; targets: readonly string[] }) => ({
    enabled: value.enabled,
    ...(value.reason ? { reason: value.reason } : {}),
    targets: [...value.targets]
  });
  return {
    roll: availability(source.roll),
    endTurn: availability(source.endTurn),
    road: availability(source.road),
    settlement: availability(source.settlement),
    city: availability(source.city),
    buyDevelopmentCard: availability(source.buyDevelopmentCard),
    developmentCards: source.developmentCards.map((card) => ({
      ...(card.cardId ? { cardId: card.cardId } : {}),
      count: card.count,
      enabled: card.enabled,
      kind: card.kind,
      ...(card.reason ? { reason: card.reason } : {})
    })),
    maritime: {
      enabled: source.maritime.enabled,
      ...(source.maritime.reason ? { reason: source.maritime.reason } : {}),
      ratios: { ...source.maritime.ratios },
      trades: source.maritime.trades.map((trade) => ({ ...trade, receives: [...trade.receives] }))
    },
    commerce: {
      tradeSlots: source.commerce.tradeSlots.map((slot) => ({ id: slot.id, ...availability(slot) })),
      transfer: {
        ...availability(source.commerce.transfer),
        maxAmount: source.commerce.transfer.maxAmount,
        recipientIds: [...source.commerce.transfer.recipientIds]
      },
      startGathering: availability(source.commerce.startGathering),
      openAuction: availability(source.commerce.openAuction),
      redeemPrize: availability(source.commerce.redeemPrize),
      gatheringPlayers: source.commerce.gatheringPlayers.map((player) => ({
        id: player.id,
        tokens: player.tokens,
        remainingAllowance: player.remainingAllowance,
        bankStock: cloneResources(player.bankStock)
      }))
    }
  };
}

export function createLocalGameTableView(state: AppState): GameTableView {
  const { players } = state.game;
  const activePlayerId = state.game.activePlayerId;
  const actionFacts = getActionAvailabilityFacts(state, activePlayerId);
  const decisionPlayerId = state.game.turnState.phase === "awaitingDiscards"
    ? Object.keys(state.game.turnState.pendingDiscards)[0] ?? activePlayerId
    : activePlayerId;
  const decisionFacts = decisionPlayerId === activePlayerId
    ? actionFacts
    : getActionAvailabilityFacts(state, decisionPlayerId);
  const tableActions = projectLocalActions(state);
  return {
    game: {
      phase: state.game.phase,
      players: players.map((player) => ({
        id: player.id,
        name: player.name,
        color: player.color,
        visibleScore: calculatePlayerScore(state.game, player.id),
        resourceCardCount: Object.values(player.resources).reduce(
          (total, count) => total + count,
          0
        ),
        developmentCardCount: player.developmentCards.length,
        guildTokens: player.guildTokens,
        vouchers: player.vouchers,
        prizeCards: player.prizeCards,
        knightsPlayed: player.knightsPlayed
      })),
      activePlayerId,
      turn: state.game.turn,
      round: state.game.round,
      turnState: {
        phase: state.game.turnState.phase,
        awaitedPlayerIds: state.game.turnState.phase === "awaitingDiscards"
          ? Object.keys(state.game.turnState.pendingDiscards)
          : state.game.turnState.phase === "awaitingRobberPlacement" ||
              state.game.turnState.phase === "awaitingRobberVictim" ||
              state.game.turnState.phase === "awaitingDevelopmentEffect"
            ? [activePlayerId]
            : [],
        ...(state.game.turnState.pendingRobber
          ? { pendingRobber: { eligibleVictimIds: [...state.game.turnState.pendingRobber.eligibleVictimIds] } }
          : {}),
        ...(state.game.turnState.pendingDevelopmentEffect
          ? { pendingDevelopmentEffect: {
              kind: state.game.turnState.pendingDevelopmentEffect.kind,
              ...(state.game.turnState.pendingDevelopmentEffect.kind === "roadBuilding"
                ? { remainingRoads: state.game.turnState.pendingDevelopmentEffect.remainingRoads }
                : state.game.turnState.pendingDevelopmentEffect.kind === "yearOfPlenty"
                  ? { remainingPicks: state.game.turnState.pendingDevelopmentEffect.remainingPicks }
                  : {})
            } }
          : {})
      },
      targetScore: state.game.targetScore,
      board: state.game.board.map((hex) => ({ ...hex, vertexIds: [...hex.vertexIds], edgeIds: [...hex.edgeIds] })),
      edges: state.game.edges.map((edge) => ({ ...edge, vertexIds: [...edge.vertexIds] as [string, string] })),
      ports: state.game.ports.map((port) => ({ ...port, vertexIds: [...port.vertexIds] })),
      buildings: state.game.buildings.map((building) => ({ ...building })),
      roads: state.game.roads.map((road) => ({ ...road })),
      robberHexId: state.game.robberHexId,
      bank: { resources: cloneResources(state.game.bank.resources) },
      log: state.game.log.map(projectLocalLog),
      developmentDeckCount: state.game.developmentDeck.length,
      ...(state.game.setup ? { setup: { stage: state.game.setup.stage } } : {}),
      ...(state.game.winnerId ? { winnerId: state.game.winnerId } : {})
    },
    guild: {
      tradeSlots: state.guild.tradeSlots.map((slot) => ({ id: slot.id, requires: { ...slot.requires }, tokenReward: slot.tokenReward })),
      gathering: {
        phase: state.guild.gathering.phase,
        auctionRound: state.guild.gathering.auctionRound,
        ...(state.guild.gathering.lastAuctionResult
          ? { lastAuctionResult: {
              winnerName: state.guild.gathering.lastAuctionResult.winnerName,
              round: state.guild.gathering.lastAuctionResult.round,
              winningBid: state.guild.gathering.lastAuctionResult.winningBid,
              outcome: state.guild.gathering.lastAuctionResult.outcome.kind === "resources"
                ? {
                    kind: "resources" as const,
                    resourceCardCount: Object.values(state.guild.gathering.lastAuctionResult.outcome.resources).reduce((sum, count) => sum + count, 0)
                  }
                : { kind: state.guild.gathering.lastAuctionResult.outcome.kind }
            } }
          : {})
      }
    },
    controlledPlayers: players.map((player, index) => ({
      controlId: controlIdForIndex(index),
      displaySlot: index,
      displayName: player.name,
      isActive: player.id === activePlayerId,
      resources: cloneResources(player.resources),
      developmentCards: player.developmentCards.map((card) => ({ ...card })),
      guildTokens: player.guildTokens,
      gatheringRemainingAllowance: tableActions.commerce.gatheringPlayers.find((candidate) => candidate.id === player.id)?.remainingAllowance ?? 0,
      gatheringBankStock: cloneResources(state.game.bank.resources),
      ...(state.pendingPlayerTrade
        ? player.id === state.pendingPlayerTrade.proposerId
          ? { tradeResponse: { kind: "cancel" as const } }
          : { tradeResponse: {
              kind: "accept" as const,
              ...(getPlayerTradeAcceptanceReason(state.game, state.pendingPlayerTrade, player.id)
                ? { reason: getPlayerTradeAcceptanceReason(state.game, state.pendingPlayerTrade, player.id)! }
                : {})
            } }
        : {}),
      ...(state.game.turnState.pendingDiscards[player.id]
        ? { decision: { kind: "discard" as const, count: state.game.turnState.pendingDiscards[player.id]! } }
        : player.id === activePlayerId && state.game.turnState.phase === "awaitingRobberPlacement"
          ? { decision: { kind: "robber" as const } }
          : player.id === activePlayerId && state.game.turnState.phase === "awaitingDevelopmentEffect"
            ? { decision: { kind: "development" as const } }
            : {})
    })),
    lastDice: state.lastDice ? { ...state.lastDice } : null,
    ...(state.pendingPlayerTrade ? { pendingPlayerTrade: {
      proposerId: state.pendingPlayerTrade.proposerId,
      offered: cloneResources(state.pendingPlayerTrade.offered),
      requested: cloneResources(state.pendingPlayerTrade.requested)
    } } : {}),
    selectedDiceTotal: state.selectedDiceTotal,
    selectedPlayerId: state.selectedPlayerId,
    notice: state.notice,
    statistics: {
      playerRows: Object.fromEntries(
        players.map((player) => [player.id, getPlayerIncome(state.game, player.id).map((row) => ({
          diceTotal: row.diceTotal,
          probability: row.probability,
          resources: cloneResources(row.resources),
          expected: cloneResources(row.expected)
        }))])
      ),
      diceIncome: Object.fromEntries(
        [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((total) => [
          total,
          {
            players: Object.fromEntries(
              Object.entries(getDiceIncome(state.game, total).players).map(([playerId, value]) => [
                playerId,
                cloneResources(value)
              ])
            )
          }
        ])
      ),
      matrix: {
        totals: Object.fromEntries(
          Object.entries(getExpectedIncomeMatrix(state.game).totals).map(([playerId, value]) => [
            playerId,
            cloneResources(value)
          ])
        )
      }
    },
    legality: {
      actions: tableActions,
      ...(state.game.phase === "setup"
        ? { setupControlId: controlIdForIndex(players.findIndex((player) => player.id === activePlayerId)) }
        : {}),
      setupRoadEdgeIds: [...actionFacts.setup.road.targets],
      setupSettlementVertexIds: [...actionFacts.setup.settlement.targets],
      freeRoadEdgeIds: [...actionFacts.decisions.freeRoad.targets]
    },
    decisionPolicy: {
      discard: { enabled: decisionFacts.decisions.discard.enabled, targets: [], exactCount: decisionFacts.decisions.discard.exactCount,
        maxByResource: cloneResources(decisionFacts.decisions.discard.maxByResource),
        ...(formatAvailabilityReason(decisionFacts.decisions.discard.disabledReason) ? { reason: formatAvailabilityReason(decisionFacts.decisions.discard.disabledReason) } : {}) },
      robberHex: { enabled: decisionFacts.decisions.robberHex.enabled, targets: [...decisionFacts.decisions.robberHex.targets],
        ...(formatAvailabilityReason(decisionFacts.decisions.robberHex.disabledReason) ? { reason: formatAvailabilityReason(decisionFacts.decisions.robberHex.disabledReason) } : {}) },
      robberVictim: { enabled: decisionFacts.decisions.robberVictim.enabled, targets: [...decisionFacts.decisions.robberVictim.targets],
        ...(formatAvailabilityReason(decisionFacts.decisions.robberVictim.disabledReason) ? { reason: formatAvailabilityReason(decisionFacts.decisions.robberVictim.disabledReason) } : {}) },
      freeRoad: { enabled: decisionFacts.decisions.freeRoad.enabled, targets: [...decisionFacts.decisions.freeRoad.targets], remainingRoads: decisionFacts.decisions.freeRoad.remainingRoads,
        ...(formatAvailabilityReason(decisionFacts.decisions.freeRoad.disabledReason) ? { reason: formatAvailabilityReason(decisionFacts.decisions.freeRoad.disabledReason) } : {}) },
      yearOfPlenty: { enabled: decisionFacts.decisions.yearOfPlenty.enabled, targets: [...decisionFacts.decisions.yearOfPlenty.targets], remainingPicks: decisionFacts.decisions.yearOfPlenty.remainingPicks,
        ...(formatAvailabilityReason(decisionFacts.decisions.yearOfPlenty.disabledReason) ? { reason: formatAvailabilityReason(decisionFacts.decisions.yearOfPlenty.disabledReason) } : {}) },
      monopoly: { enabled: decisionFacts.decisions.monopoly.enabled, targets: [...decisionFacts.decisions.monopoly.targets],
        ...(formatAvailabilityReason(decisionFacts.decisions.monopoly.disabledReason) ? { reason: formatAvailabilityReason(decisionFacts.decisions.monopoly.disabledReason) } : {}) }
    },
    tradePolicy: {
      publishEnabled: actionFacts.publicTrade.publish.enabled,
      ...(actionFacts.publicTrade.publish.disabledReason
        ? { publishReason: formatAvailabilityReason(actionFacts.publicTrade.publish.disabledReason) }
        : {}),
      maxOfferResources: cloneResources(actionFacts.publicTrade.publish.maxOfferResources)
    }
  };
}

export function createLocalGameTableController(
  getState: () => AppState,
  dispatchCommand: (command: GameCommand) => void
): { dispatch(intent: GameTableIntent): void } {
  let auctionKey = "";
  let auctionBids: Record<PlayerId, number> = {};
  const actorForControl = (controlId: string): PlayerId => {
    const index = Number(controlId.match(/^local-control-(\d+)$/)?.[1]) - 1;
    const player = getState().game.players[index];
    if (!player) throw new Error("Unknown local game-table control.");
    return player.id;
  };
  const active = () => getState().game.activePlayerId;

  return {
    dispatch(intent) {
      switch (intent.type) {
        case "ui.selectDiceTotal": dispatchCommand({ type: "SELECT_DICE_TOTAL", diceTotal: intent.diceTotal }); return;
        case "ui.selectPlayer": dispatchCommand({ type: "SELECT_PLAYER", playerId: intent.playerId }); return;
        case "game.new":
          auctionKey = "";
          auctionBids = {};
          dispatchCommand({ type: "START_NEW_GAME", mode: "fresh" });
          return;
        case "turn.roll": dispatchCommand({ type: "ROLL_DICE", playerId: active() }); return;
        case "turn.end": dispatchCommand({ type: "END_TURN", playerId: active() }); return;
        case "build.road": dispatchCommand({ type: "BUILD_ROAD", playerId: active(), edgeId: intent.edgeId }); return;
        case "build.settlement": dispatchCommand({ type: "BUILD_SETTLEMENT", playerId: active(), vertexId: intent.vertexId }); return;
        case "build.city": dispatchCommand({ type: "BUILD_CITY", playerId: active(), buildingId: intent.buildingId }); return;
        case "setup.settlement": dispatchCommand({ type: "PLACE_SETUP_SETTLEMENT", playerId: actorForControl(intent.controlId), vertexId: intent.vertexId }); return;
        case "setup.road": dispatchCommand({ type: "PLACE_SETUP_ROAD", playerId: actorForControl(intent.controlId), edgeId: intent.edgeId }); return;
        case "robber.place": dispatchCommand({ type: "PLACE_ROBBER", playerId: active(), hexId: intent.hexId }); return;
        case "robber.steal": dispatchCommand({ type: "STEAL_ROBBER_RESOURCE", playerId: active(), victimId: intent.victimId }); return;
        case "development.buy": dispatchCommand({ type: "BUY_DEVELOPMENT_CARD", playerId: active() }); return;
        case "development.play": dispatchCommand({ type: "PLAY_DEVELOPMENT_CARD", playerId: active(), cardId: intent.cardId }); return;
        case "development.chooseResource": dispatchCommand({ type: intent.choice === "yearOfPlenty" ? "CHOOSE_YEAR_OF_PLENTY_RESOURCE" : "CHOOSE_MONOPOLY_RESOURCE", playerId: active(), resource: intent.resource }); return;
        case "development.placeRoad": dispatchCommand({ type: "PLACE_FREE_ROAD", playerId: active(), edgeId: intent.edgeId }); return;
        case "trade.maritime": dispatchCommand({ type: "MARITIME_TRADE", playerId: active(), give: intent.give, receive: intent.receive }); return;
        case "trade.publish": dispatchCommand({ type: "PUBLISH_PLAYER_TRADE", playerId: active(), offered: { ...intent.offered }, requested: { ...intent.requested } }); return;
        case "trade.respond": dispatchCommand({ type: intent.response === "accept" ? "ACCEPT_PLAYER_TRADE" : "CANCEL_PLAYER_TRADE", playerId: actorForControl(intent.controlId) }); return;
        case "commerce.completeSlot": dispatchCommand({ type: "COMPLETE_TRADE_SLOT", playerId: active(), slotId: intent.slotId }); return;
        case "commerce.transfer": dispatchCommand({ type: "TRANSFER_TOKENS", fromPlayerId: active(), toPlayerId: intent.recipientId, amount: intent.amount }); return;
        case "commerce.startGathering": dispatchCommand({ type: "START_GATHERING" }); return;
        case "commerce.redeem": dispatchCommand({ type: "REDEEM_GATHERING", playerId: actorForControl(intent.controlId), resources: { ...intent.resources } }); return;
        case "commerce.openAuction": dispatchCommand({ type: "OPEN_AUCTION" }); return;
        case "commerce.redeemPrize": dispatchCommand({ type: "REDEEM_PRIZE", playerId: active() }); return;
        case "decision.discard": dispatchCommand({ type: "DISCARD_FOR_SEVEN", playerId: actorForControl(intent.controlId), resources: { ...intent.resources } }); return;
        case "auction.submitBid": {
          const state = getState();
          const nextKey = `${state.game.turn}:${state.guild.gathering.auctionRound}`;
          if (auctionKey !== nextKey) {
            auctionKey = nextKey;
            auctionBids = {};
          }
          auctionBids[actorForControl(intent.controlId)] = intent.bid;
          if (Object.keys(auctionBids).length === state.game.players.length) {
            dispatchCommand({ type: "RESOLVE_AUCTION", bids: { ...auctionBids } });
            auctionBids = {};
          }
          return;
        }
      }
    }
  };
}
