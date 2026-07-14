import {
  getGatheringCooldownRemaining,
  getGatheringStartBlocker,
  type CommerceGuildState,
  type GatheringStartBlocker,
  type ResourceCost
} from "../domain/expansion/commerceGuild";
import type { PlayerTradeOffer } from "../domain/rules/playerTrade";
import {
  buildCosts,
  getLegalRoadEdgeIds,
  getLegalSettlementVertexIds,
  getLegalSetupRoadEdgeIds,
  getLegalSetupSettlementVertexIds,
  getUpgradeableBuildingIds
} from "../domain/rules/building";
import { getMaritimeTradeRatio } from "../domain/rules/maritimeTrade";
import {
  emptyResources,
  resources,
  type DevelopmentCardKind,
  type EdgeId,
  type GameState,
  type HexId,
  type Player,
  type PlayerId,
  type Resource,
  type ResourceMap,
  type VertexId
} from "../domain/types";

export type AvailabilityReasonCode =
  | "GAME_SETUP"
  | "GAME_OVER"
  | "NOT_YOUR_TURN"
  | "ROLL_REQUIRED"
  | "ALREADY_ROLLED"
  | "REQUIRED_DECISION"
  | "INSUFFICIENT_RESOURCES"
  | "NO_LEGAL_TARGET"
  | "DEVELOPMENT_DECK_EMPTY"
  | "DEVELOPMENT_CARD_PHASE"
  | "NO_ELIGIBLE_DEVELOPMENT_CARD"
  | "NO_MARITIME_TRADE"
  | "GUILD_TRADE_ALREADY_USED"
  | "NO_GUILD_TOKENS"
  | "NO_RECIPIENT"
  | "GATHERING_ONLY_DURING_PLAY"
  | "GATHERING_IN_PROGRESS"
  | "GATHERING_COOLDOWN"
  | "REDEMPTION_NOT_OPEN"
  | "REDEMPTION_CAP_REACHED"
  | "NO_BANK_STOCK"
  | "VOUCHERS_REQUIRED"
  | "SETUP_NOT_ACTIVE"
  | "SETUP_SETTLEMENT_REQUIRED"
  | "SETUP_ROAD_REQUIRED"
  | "NO_REQUIRED_DISCARD"
  | "ROBBER_MOVE_NOT_PENDING"
  | "ROBBER_VICTIM_NOT_PENDING"
  | "DEVELOPMENT_EFFECT_NOT_PENDING"
  | "NO_PENDING_PLAYER_TRADE"
  | "PLAYER_TRADE_ALREADY_OPEN"
  | "PLAYER_TRADE_PROPOSER_NOT_ACTIVE"
  | "CANNOT_ACCEPT_OWN_TRADE"
  | "CANNOT_AFFORD_PLAYER_TRADE"
  | "WAITING_FOR_REQUIRED_PLAYERS"
  | "WAITING_FOR_ACTIVE_PLAYER"
  | "REQUIRED_PLAYER_OFFLINE"
  | "AUCTION_NOT_OPEN"
  | "BID_ALREADY_SUBMITTED";

export interface AvailabilityReason {
  code: AvailabilityReasonCode;
  params?: Record<string, string | number | string[]>;
}

export interface AvailabilityFact<TTarget = never> {
  enabled: boolean;
  disabledReason?: AvailabilityReason;
  targets: TTarget[];
}

export interface ActionAvailability<TTarget = never> {
  enabled: boolean;
  reason?: string;
  targets: TTarget[];
}

export interface MaritimeTradeChoice {
  give: Resource;
  ratio: number;
  receives: Resource[];
}

export interface DevelopmentCardFact {
  cardId?: string;
  count: number;
  enabled: boolean;
  kind: Exclude<DevelopmentCardKind, "victoryPoint">;
  disabledReason?: AvailabilityReason;
}

export interface DevelopmentCardAvailability {
  cardId?: string;
  count: number;
  enabled: boolean;
  kind: Exclude<DevelopmentCardKind, "victoryPoint">;
  reason?: string;
}

interface CommerceAvailabilityFacts {
  tradeSlots: Array<AvailabilityFact & { id: string }>;
  transfer: AvailabilityFact & { maxAmount: number; recipientIds: PlayerId[] };
  startGathering: AvailabilityFact;
  openAuction: AvailabilityFact;
  redeemGathering: AvailabilityFact<Resource> & {
    maxAmount: number;
    bankStock: ResourceMap;
  };
  redeemPrize: AvailabilityFact;
  gatheringPlayers: Array<{
    id: PlayerId;
    tokens: number;
    remainingAllowance: number;
    bankStock: ResourceMap;
  }>;
}

export interface TurnActionAvailabilityFacts {
  roll: AvailabilityFact;
  endTurn: AvailabilityFact;
  road: AvailabilityFact<EdgeId> & { cost: ResourceMap };
  settlement: AvailabilityFact<VertexId> & { cost: ResourceMap };
  city: AvailabilityFact<string> & { cost: ResourceMap };
  buyDevelopmentCard: AvailabilityFact & { cost: ResourceMap };
  developmentCards: DevelopmentCardFact[];
  maritime: {
    enabled: boolean;
    disabledReason?: AvailabilityReason;
    ratios: Record<Resource, number>;
    trades: MaritimeTradeChoice[];
  };
  commerce: CommerceAvailabilityFacts;
}

export interface MatchActionAvailabilityFacts extends TurnActionAvailabilityFacts {
  setup: {
    settlement: AvailabilityFact<VertexId>;
    road: AvailabilityFact<EdgeId>;
  };
  decisions: {
    discard: AvailabilityFact & { exactCount: number; maxByResource: ResourceMap };
    robberHex: AvailabilityFact<HexId>;
    robberVictim: AvailabilityFact<PlayerId>;
    freeRoad: AvailabilityFact<EdgeId> & { remainingRoads: number };
    yearOfPlenty: AvailabilityFact<Resource> & { remainingPicks: number };
    monopoly: AvailabilityFact<Resource>;
  };
  publicTrade: {
    publish: AvailabilityFact & { maxOfferResources: ResourceMap };
    cancel: AvailabilityFact;
    accept: AvailabilityFact;
  };
}

export interface SealedBidAvailabilityFact {
  enabled: boolean;
  disabledReason?: AvailabilityReason;
  round: number;
  maxAmount: number;
  submitted: boolean;
}

export interface OnlineActionAvailabilityFacts extends MatchActionAvailabilityFacts {
  sealedBid: SealedBidAvailabilityFact;
}

export interface SealedBidAvailabilityInput {
  round: number;
  submitted: boolean;
}

export interface OnlineActionAvailabilityContext {
  connectedPlayerIds?: readonly PlayerId[];
  sealedBid?: SealedBidAvailabilityInput;
}

export interface TurnActionAvailability {
  roll: ActionAvailability;
  endTurn: ActionAvailability;
  road: ActionAvailability<EdgeId> & { cost: ResourceMap };
  settlement: ActionAvailability<VertexId> & { cost: ResourceMap };
  city: ActionAvailability<string> & { cost: ResourceMap };
  buyDevelopmentCard: ActionAvailability & { cost: ResourceMap };
  developmentCards: DevelopmentCardAvailability[];
  maritime: {
    enabled: boolean;
    reason?: string;
    ratios: Record<Resource, number>;
    trades: MaritimeTradeChoice[];
  };
  commerce: {
    tradeSlots: Array<ActionAvailability & { id: string }>;
    transfer: ActionAvailability & { maxAmount: number; recipientIds: PlayerId[] };
    startGathering: ActionAvailability;
    openAuction: ActionAvailability;
    redeemPrize: ActionAvailability;
    gatheringPlayers: CommerceAvailabilityFacts["gatheringPlayers"];
  };
}

export interface ActionAvailabilityState {
  game: GameState;
  guild: CommerceGuildState;
  pendingPlayerTrade?: PlayerTradeOffer;
}

const playableKinds: Exclude<DevelopmentCardKind, "victoryPoint">[] = [
  "knight",
  "roadBuilding",
  "yearOfPlenty",
  "monopoly"
];

function disabled<TTarget = never>(
  code: AvailabilityReasonCode,
  targets: TTarget[] = [],
  params?: AvailabilityReason["params"]
): AvailabilityFact<TTarget> {
  return {
    enabled: false,
    disabledReason: { code, ...(params ? { params } : {}) },
    targets
  };
}

function enabled<TTarget = never>(targets: TTarget[] = []): AvailabilityFact<TTarget> {
  return { enabled: true, targets };
}

function missingResources(player: Player, cost: ResourceCost): Resource[] {
  return resources.filter((resource) => player.resources[resource] < (cost[resource] ?? 0));
}

function normalActionReason(game: GameState, playerId: PlayerId): AvailabilityReason | undefined {
  if (game.phase === "setup") return { code: "GAME_SETUP" };
  if (game.phase === "gameOver") return { code: "GAME_OVER" };
  if (game.activePlayerId !== playerId) return { code: "NOT_YOUR_TURN" };
  if (game.turnState.phase === "action") return undefined;
  if (game.turnState.phase === "awaitingRoll") return { code: "ROLL_REQUIRED" };
  return { code: "REQUIRED_DECISION" };
}

function gatheringStartReason(
  state: ActionAvailabilityState,
  playerId: PlayerId
): AvailabilityReason | undefined {
  const blocker = getGatheringStartBlocker(
    state.game,
    state.guild,
    playerId,
    state.pendingPlayerTrade !== undefined
  );
  if (!blocker) return undefined;

  const reasons: Record<GatheringStartBlocker, () => AvailabilityReason> = {
    notPlaying: () => ({ code: "GATHERING_ONLY_DURING_PLAY" }),
    unresolvedAction: () => ({
      code: state.game.turnState.phase === "awaitingRoll" ? "ROLL_REQUIRED" : "REQUIRED_DECISION"
    }),
    notCurrentPlayer: () => ({ code: "NOT_YOUR_TURN" }),
    pendingTrade: () => ({ code: "PLAYER_TRADE_ALREADY_OPEN" }),
    gatheringInProgress: () => ({ code: "GATHERING_IN_PROGRESS" }),
    cooldown: () => ({
      code: "GATHERING_COOLDOWN",
      params: {
        remainingTurns: getGatheringCooldownRemaining(
          state.guild.gatheringCooldown,
          state.game.turn
        )
      }
    })
  };
  return reasons[blocker]();
}

function fromReason(reason: AvailabilityReason | undefined): AvailabilityFact {
  return reason ? { enabled: false, disabledReason: reason, targets: [] } : enabled();
}

function awaitedPlayerIds(game: GameState): PlayerId[] {
  if (game.turnState.phase === "awaitingDiscards") {
    return Object.keys(game.turnState.pendingDiscards);
  }
  if (
    game.turnState.phase === "awaitingRobberPlacement" ||
    game.turnState.phase === "awaitingRobberVictim" ||
    game.turnState.phase === "awaitingDevelopmentEffect"
  ) {
    return [game.activePlayerId];
  }
  return [];
}

export function getRequiredPlayerWaitingReason(
  game: GameState,
  viewerPlayerId: PlayerId,
  connectedPlayerIds?: readonly PlayerId[]
): AvailabilityReason | undefined {
  const awaited = awaitedPlayerIds(game);
  if (awaited.length === 0 || awaited.includes(viewerPlayerId)) return undefined;

  if (connectedPlayerIds) {
    const connected = new Set(connectedPlayerIds);
    const offlinePlayerIds = awaited.filter((playerId) => !connected.has(playerId));
    if (offlinePlayerIds.length > 0) {
      return { code: "REQUIRED_PLAYER_OFFLINE", params: { playerIds: offlinePlayerIds } };
    }
  }

  return awaited.length === 1
    ? { code: "WAITING_FOR_ACTIVE_PLAYER", params: { playerId: awaited[0] } }
    : { code: "WAITING_FOR_REQUIRED_PLAYERS", params: { playerIds: awaited } };
}

function withWaitingReason<T extends AvailabilityFact<unknown>>(
  fact: T,
  reason: AvailabilityReason | undefined
): T {
  return fact.enabled || !reason ? fact : { ...fact, disabledReason: reason };
}

export function applyRequiredPlayerWaitingFacts(
  facts: MatchActionAvailabilityFacts,
  reason: AvailabilityReason | undefined
): MatchActionAvailabilityFacts {
  if (!reason) return facts;
  return {
    ...facts,
    roll: withWaitingReason(facts.roll, reason),
    endTurn: withWaitingReason(facts.endTurn, reason),
    road: withWaitingReason(facts.road, reason),
    settlement: withWaitingReason(facts.settlement, reason),
    city: withWaitingReason(facts.city, reason),
    buyDevelopmentCard: withWaitingReason(facts.buyDevelopmentCard, reason),
    developmentCards: facts.developmentCards.map((card) =>
      card.enabled ? card : { ...card, disabledReason: reason }
    ),
    maritime:
      facts.maritime.enabled
        ? facts.maritime
        : { ...facts.maritime, disabledReason: reason },
    commerce: {
      ...facts.commerce,
      tradeSlots: facts.commerce.tradeSlots.map((slot) => withWaitingReason(slot, reason)),
      transfer: withWaitingReason(facts.commerce.transfer, reason),
      redeemPrize: withWaitingReason(facts.commerce.redeemPrize, reason)
    },
    decisions: {
      discard: withWaitingReason(facts.decisions.discard, reason),
      robberHex: withWaitingReason(facts.decisions.robberHex, reason),
      robberVictim: withWaitingReason(facts.decisions.robberVictim, reason),
      freeRoad: withWaitingReason(facts.decisions.freeRoad, reason),
      yearOfPlenty: withWaitingReason(facts.decisions.yearOfPlenty, reason),
      monopoly: withWaitingReason(facts.decisions.monopoly, reason)
    }
  };
}

export function getSealedBidAvailabilityFact(
  state: ActionAvailabilityState,
  playerId: PlayerId,
  input?: SealedBidAvailabilityInput
): SealedBidAvailabilityFact {
  const player = state.game.players.find((candidate) => candidate.id === playerId);
  if (!player) throw new Error(`Unknown player: ${playerId}`);
  const round = input?.round ?? state.guild.gathering.auctionRound;
  const submitted = input?.submitted ?? false;
  const disabledReason =
    state.game.phase !== "playing" || state.guild.gathering.phase !== "auction" || !input
      ? { code: "AUCTION_NOT_OPEN" as const }
      : submitted
        ? { code: "BID_ALREADY_SUBMITTED" as const }
        : undefined;
  return {
    enabled: !disabledReason,
    round,
    maxAmount: player.guildTokens,
    submitted,
    ...(disabledReason ? { disabledReason } : {})
  };
}

function buildFact<TTarget>(
  game: GameState,
  player: Player,
  cost: ResourceMap,
  targets: TTarget[]
): AvailabilityFact<TTarget> & { cost: ResourceMap } {
  const phase = normalActionReason(game, player.id);
  if (phase) return { ...fromReason(phase), cost, targets };
  const missing = missingResources(player, cost);
  if (missing.length > 0) {
    return { ...disabled("INSUFFICIENT_RESOURCES", targets, { resources: missing }), cost };
  }
  if (targets.length === 0) return { ...disabled("NO_LEGAL_TARGET", targets), cost };
  return { ...enabled(targets), cost };
}

function setupFact<TTarget>(
  game: GameState,
  playerId: PlayerId,
  stage: "settlement" | "road",
  targets: TTarget[]
): AvailabilityFact<TTarget> {
  if (game.phase !== "setup") return disabled("SETUP_NOT_ACTIVE", []);
  if (game.activePlayerId !== playerId) return disabled("NOT_YOUR_TURN", []);
  if (game.setup?.stage !== stage) {
    return disabled(stage === "settlement" ? "SETUP_ROAD_REQUIRED" : "SETUP_SETTLEMENT_REQUIRED", []);
  }
  return targets.length > 0 ? enabled(targets) : disabled("NO_LEGAL_TARGET", targets);
}

function decisionReason(game: GameState, playerId: PlayerId): AvailabilityReason {
  return game.activePlayerId === playerId
    ? { code: "DEVELOPMENT_EFFECT_NOT_PENDING" }
    : { code: "NOT_YOUR_TURN" };
}

export function getActionAvailabilityFacts(
  state: ActionAvailabilityState,
  playerId: PlayerId
): MatchActionAvailabilityFacts {
  const { game, guild } = state;
  const player = game.players.find((candidate) => candidate.id === playerId);
  if (!player) throw new Error(`Unknown player: ${playerId}`);

  const normalReason = normalActionReason(game, playerId);
  const road = buildFact(game, player, buildCosts.road, getLegalRoadEdgeIds(game, playerId));
  const settlement = buildFact(
    game,
    player,
    buildCosts.settlement,
    getLegalSettlementVertexIds(game, playerId)
  );
  const city = buildFact(game, player, buildCosts.city, getUpgradeableBuildingIds(game, playerId));
  const ratios = Object.fromEntries(
    resources.map((resource) => [resource, getMaritimeTradeRatio(game, playerId, resource)])
  ) as Record<Resource, number>;
  const trades = resources.flatMap((give) => {
    const ratio = ratios[give];
    if (player.resources[give] < ratio) return [];
    const receives = resources.filter(
      (receive) => receive !== give && game.bank.resources[receive] > 0
    );
    return receives.length > 0 ? [{ give, ratio, receives }] : [];
  });
  const developmentPhaseReady =
    game.phase === "playing" &&
    game.activePlayerId === playerId &&
    (game.turnState.phase === "awaitingRoll" || game.turnState.phase === "action") &&
    !game.turnState.developmentCardPlayed;
  const developmentCost = buildCosts.developmentCard;
  const buyMissing = missingResources(player, developmentCost);
  const recipientIds = game.players
    .filter((candidate) => candidate.id !== playerId)
    .map((candidate) => candidate.id);
  const remainingAllowance = Math.max(0, 4 - (guild.gathering.redemptions[playerId] ?? 0));
  const redeemable = Math.min(remainingAllowance, player.guildTokens);
  const bankTargets = resources.filter((resource) => game.bank.resources[resource] > 0);
  const pendingEffect = game.turnState.pendingDevelopmentEffect;
  const isOwnEffect =
    game.turnState.phase === "awaitingDevelopmentEffect" && pendingEffect?.playerId === playerId;

  const tradeSlots = guild.tradeSlots.map((slot) => {
    const missing = missingResources(player, slot.requires);
    const reason = normalReason ??
      (guild.usedTradePlayerIds.includes(playerId)
        ? { code: "GUILD_TRADE_ALREADY_USED" as const }
        : missing.length > 0
          ? { code: "INSUFFICIENT_RESOURCES" as const, params: { resources: missing } }
          : undefined);
    return { id: slot.id, ...fromReason(reason) };
  });

  const offer = state.pendingPlayerTrade;
  const canAffordRequested =
    offer && resources.every((resource) => player.resources[resource] >= offer.requested[resource]);

  return {
    roll:
      game.phase === "setup"
        ? disabled("GAME_SETUP")
        : game.phase === "gameOver"
          ? disabled("GAME_OVER")
          : game.activePlayerId !== playerId
            ? disabled("NOT_YOUR_TURN")
            : game.turnState.phase === "awaitingRoll"
              ? enabled()
              : game.turnState.phase === "action"
                ? disabled("ALREADY_ROLLED")
                : disabled("REQUIRED_DECISION"),
    endTurn: fromReason(normalReason),
    road,
    settlement,
    city,
    buyDevelopmentCard: {
      cost: developmentCost,
      ...(normalReason
        ? fromReason(normalReason)
        : buyMissing.length > 0
          ? disabled("INSUFFICIENT_RESOURCES", [], { resources: buyMissing })
          : game.developmentDeck.length === 0
            ? disabled("DEVELOPMENT_DECK_EMPTY")
            : enabled())
    },
    developmentCards: playableKinds.map((kind) => {
      const cards = player.developmentCards.filter((card) => card.kind === kind);
      const playableCard = cards.find((card) => card.purchasedTurn < game.turn);
      return {
        ...(playableCard ? { cardId: playableCard.id } : {}),
        count: cards.length,
        enabled: developmentPhaseReady && Boolean(playableCard),
        kind,
        ...(!developmentPhaseReady
          ? { disabledReason: { code: "DEVELOPMENT_CARD_PHASE" as const } }
          : !playableCard
            ? { disabledReason: { code: "NO_ELIGIBLE_DEVELOPMENT_CARD" as const } }
            : {})
      };
    }),
    maritime: {
      enabled: !normalReason && trades.length > 0,
      ...(normalReason
        ? { disabledReason: normalReason }
        : trades.length === 0
          ? { disabledReason: { code: "NO_MARITIME_TRADE" as const } }
          : {}),
      ratios,
      trades
    },
    commerce: {
      tradeSlots,
      transfer: {
        maxAmount: player.guildTokens,
        recipientIds,
        ...(normalReason
          ? fromReason(normalReason)
          : player.guildTokens === 0
            ? disabled("NO_GUILD_TOKENS")
            : recipientIds.length === 0
              ? disabled("NO_RECIPIENT")
              : enabled())
      },
      startGathering: fromReason(gatheringStartReason(state, playerId)),
      openAuction:
        game.phase !== "playing"
          ? disabled("GATHERING_ONLY_DURING_PLAY")
          : guild.gathering.phase !== "redemption"
            ? disabled("REDEMPTION_NOT_OPEN")
            : enabled(),
      redeemGathering: {
        maxAmount: redeemable,
        bankStock: { ...game.bank.resources },
        ...(guild.gathering.phase !== "redemption"
          ? disabled("REDEMPTION_NOT_OPEN", [])
          : remainingAllowance === 0
            ? disabled("REDEMPTION_CAP_REACHED", [])
            : player.guildTokens === 0
              ? disabled("NO_GUILD_TOKENS", [])
              : bankTargets.length === 0
                ? disabled("NO_BANK_STOCK", [])
                : enabled(bankTargets))
      },
      redeemPrize: {
        ...(normalReason
          ? fromReason(normalReason)
          : player.vouchers < 3
            ? disabled("VOUCHERS_REQUIRED", [], { required: 3 })
            : enabled())
      },
      gatheringPlayers: game.players.map((candidate) => ({
        id: candidate.id,
        tokens: candidate.guildTokens,
        remainingAllowance: Math.max(0, 4 - (guild.gathering.redemptions[candidate.id] ?? 0)),
        bankStock: { ...game.bank.resources }
      }))
    },
    setup: {
      settlement: setupFact(
        game,
        playerId,
        "settlement",
        getLegalSetupSettlementVertexIds(game, playerId)
      ),
      road: setupFact(game, playerId, "road", getLegalSetupRoadEdgeIds(game, playerId))
    },
    decisions: {
      discard:
        game.turnState.phase === "awaitingDiscards" &&
        game.turnState.pendingDiscards[playerId] !== undefined
          ? {
              ...enabled(),
              exactCount: game.turnState.pendingDiscards[playerId]!,
              maxByResource: { ...player.resources }
            }
          : {
              ...disabled("NO_REQUIRED_DISCARD"),
              exactCount: 0,
              maxByResource: emptyResources()
            },
      robberHex:
        game.activePlayerId === playerId && game.turnState.phase === "awaitingRobberPlacement"
          ? enabled(game.board.filter((hex) => hex.id !== game.robberHexId).map((hex) => hex.id))
          : {
              ...disabled("ROBBER_MOVE_NOT_PENDING"),
              ...(game.activePlayerId !== playerId
                ? { disabledReason: { code: "NOT_YOUR_TURN" as const } }
                : {})
            },
      robberVictim:
        game.activePlayerId === playerId && game.turnState.phase === "awaitingRobberVictim"
          ? enabled([...(game.turnState.pendingRobber?.eligibleVictimIds ?? [])])
          : {
              ...disabled("ROBBER_VICTIM_NOT_PENDING"),
              ...(game.activePlayerId !== playerId
                ? { disabledReason: { code: "NOT_YOUR_TURN" as const } }
                : {})
            },
      freeRoad:
        isOwnEffect && pendingEffect?.kind === "roadBuilding"
          ? {
              ...enabled(getLegalRoadEdgeIds(game, playerId)),
              remainingRoads: pendingEffect.remainingRoads
            }
          : {
              ...fromReason(decisionReason(game, playerId)),
              remainingRoads: 0,
              targets: []
            },
      yearOfPlenty:
        isOwnEffect && pendingEffect?.kind === "yearOfPlenty"
          ? {
              ...enabled(resources.filter((resource) => game.bank.resources[resource] > 0)),
              remainingPicks: pendingEffect.remainingPicks
            }
          : {
              ...fromReason(decisionReason(game, playerId)),
              remainingPicks: 0,
              targets: []
            },
      monopoly:
        isOwnEffect && pendingEffect?.kind === "monopoly"
          ? enabled([...resources])
          : { ...fromReason(decisionReason(game, playerId)), targets: [] }
    },
    publicTrade: {
      publish: {
        maxOfferResources: { ...player.resources },
        ...(normalReason
          ? fromReason(normalReason)
          : offer
            ? disabled("PLAYER_TRADE_ALREADY_OPEN")
            : enabled())
      },
      cancel:
        !offer
          ? disabled("NO_PENDING_PLAYER_TRADE")
          : normalReason
            ? fromReason(normalReason)
            : offer.proposerId !== playerId
              ? disabled("NOT_YOUR_TURN")
              : enabled(),
      accept:
        !offer
          ? disabled("NO_PENDING_PLAYER_TRADE")
          : game.phase === "setup"
            ? disabled("GAME_SETUP")
            : game.phase === "gameOver"
              ? disabled("GAME_OVER")
              : game.activePlayerId !== offer.proposerId
                ? disabled("PLAYER_TRADE_PROPOSER_NOT_ACTIVE")
                : game.turnState.phase === "awaitingRoll"
                  ? disabled("ROLL_REQUIRED")
                  : game.turnState.phase !== "action"
                    ? disabled("REQUIRED_DECISION")
                    : offer.proposerId === playerId
                      ? disabled("CANNOT_ACCEPT_OWN_TRADE")
                      : !canAffordRequested
                        ? disabled("CANNOT_AFFORD_PLAYER_TRADE")
                        : enabled()
    }
  };
}

export function getOnlineActionAvailabilityFacts(
  state: ActionAvailabilityState,
  playerId: PlayerId,
  context: OnlineActionAvailabilityContext = {}
): OnlineActionAvailabilityFacts {
  const facts = getActionAvailabilityFacts(state, playerId);
  const waitingReason = getRequiredPlayerWaitingReason(
    state.game,
    playerId,
    context.connectedPlayerIds
  );
  return {
    ...applyRequiredPlayerWaitingFacts(facts, waitingReason),
    sealedBid: getSealedBidAvailabilityFact(state, playerId, context.sealedBid)
  };
}

const reasonMessages: Record<AvailabilityReasonCode, (params?: AvailabilityReason["params"]) => string> = {
  GAME_SETUP: () => "Complete setup placement before using turn actions.",
  GAME_OVER: () => "Start a new game to use turn actions.",
  NOT_YOUR_TURN: () => "Only the active player may perform this action.",
  ROLL_REQUIRED: () => "Roll the dice before using this action.",
  ALREADY_ROLLED: () => "The dice have already been rolled for this turn.",
  REQUIRED_DECISION: () => "Complete the required decision before using turn actions.",
  INSUFFICIENT_RESOURCES: (params) =>
    `Cannot afford: need ${((params?.resources as string[] | undefined) ?? []).join(", ")}.`,
  NO_LEGAL_TARGET: () => "No legal target is available.",
  DEVELOPMENT_DECK_EMPTY: () => "The development deck is empty.",
  DEVELOPMENT_CARD_PHASE: () => "A development card cannot be played during the current phase.",
  NO_ELIGIBLE_DEVELOPMENT_CARD: () => "No eligible card of this type is available.",
  NO_MARITIME_TRADE: () => "No affordable maritime trade is available.",
  GUILD_TRADE_ALREADY_USED: () => "A Commerce Guild trade was already completed this turn.",
  NO_GUILD_TOKENS: () => "No guild tokens are available.",
  NO_RECIPIENT: () => "No recipient is available.",
  GATHERING_ONLY_DURING_PLAY: () => "A gathering is available only during normal play.",
  GATHERING_IN_PROGRESS: () => "A gathering is already in progress.",
  GATHERING_COOLDOWN: (params) =>
    `The gathering is available in ${params?.remainingTurns ?? 0} turn(s).`,
  REDEMPTION_NOT_OPEN: () => "Resource redemption is not open.",
  REDEMPTION_CAP_REACHED: () => "The gathering redemption cap has been reached.",
  NO_BANK_STOCK: () => "The bank has no redeemable stock.",
  VOUCHERS_REQUIRED: () => "Three vouchers are required to redeem a prize.",
  SETUP_NOT_ACTIVE: () => "Setup placement is not active.",
  SETUP_SETTLEMENT_REQUIRED: () => "Place the setup settlement first.",
  SETUP_ROAD_REQUIRED: () => "Place the setup road first.",
  NO_REQUIRED_DISCARD: () => "This player does not owe a discard.",
  ROBBER_MOVE_NOT_PENDING: () => "No robber move is pending.",
  ROBBER_VICTIM_NOT_PENDING: () => "No robber victim choice is pending.",
  DEVELOPMENT_EFFECT_NOT_PENDING: () => "No development-card choice is pending.",
  NO_PENDING_PLAYER_TRADE: () => "No player trade is open.",
  PLAYER_TRADE_ALREADY_OPEN: () => "A player trade is already open.",
  PLAYER_TRADE_PROPOSER_NOT_ACTIVE: () => "The player who published this offer is no longer active.",
  CANNOT_ACCEPT_OWN_TRADE: () => "The active player cannot accept their own offer.",
  CANNOT_AFFORD_PLAYER_TRADE: () => "The requested resources are not affordable.",
  WAITING_FOR_REQUIRED_PLAYERS: () => "Waiting for required players.",
  WAITING_FOR_ACTIVE_PLAYER: () => "Waiting for the active player.",
  REQUIRED_PLAYER_OFFLINE: () => "A required player is offline.",
  AUCTION_NOT_OPEN: () => "The sealed-bid auction is not open.",
  BID_ALREADY_SUBMITTED: () => "A bid was already submitted for this round."
};

export function formatAvailabilityReason(reason?: AvailabilityReason): string | undefined {
  return reason ? reasonMessages[reason.code](reason.params) : undefined;
}

function localize<T extends AvailabilityFact<unknown>>(fact: T): Omit<T, "disabledReason"> & { reason?: string } {
  const { disabledReason, ...rest } = fact;
  return {
    ...rest,
    ...(disabledReason ? { reason: reasonMessages[disabledReason.code](disabledReason.params) } : {})
  };
}

export function getActionAvailability(
  state: ActionAvailabilityState,
  playerId: PlayerId
): TurnActionAvailability {
  const facts = getActionAvailabilityFacts(state, playerId);
  return {
    roll: localize(facts.roll),
    endTurn: localize(facts.endTurn),
    road: localize(facts.road),
    settlement: localize(facts.settlement),
    city: localize(facts.city),
    buyDevelopmentCard: localize(facts.buyDevelopmentCard),
    developmentCards: facts.developmentCards.map(({ disabledReason, ...card }) => ({
      ...card,
      ...(disabledReason ? { reason: reasonMessages[disabledReason.code](disabledReason.params) } : {})
    })),
    maritime: {
      enabled: facts.maritime.enabled,
      ...(facts.maritime.disabledReason
        ? { reason: reasonMessages[facts.maritime.disabledReason.code](facts.maritime.disabledReason.params) }
        : {}),
      ratios: facts.maritime.ratios,
      trades: facts.maritime.trades
    },
    commerce: {
      tradeSlots: facts.commerce.tradeSlots.map(localize),
      transfer: localize(facts.commerce.transfer),
      startGathering: localize(facts.commerce.startGathering),
      openAuction: localize(facts.commerce.openAuction),
      redeemPrize: localize(facts.commerce.redeemPrize),
      gatheringPlayers: facts.commerce.gatheringPlayers
    }
  };
}
