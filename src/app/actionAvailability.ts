import {
  buildCosts,
  getLegalRoadEdgeIds,
  getLegalSettlementVertexIds,
  getUpgradeableBuildingIds
} from "../domain/rules/building";
import { getMaritimeTradeRatio } from "../domain/rules/maritimeTrade";
import type { CommerceGuildState, ResourceCost } from "../domain/expansion/commerceGuild";
import {
  resources,
  type DevelopmentCardKind,
  type EdgeId,
  type GameState,
  type Player,
  type PlayerId,
  type Resource,
  type ResourceMap,
  type VertexId
} from "../domain/types";

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

export interface DevelopmentCardAvailability {
  cardId?: string;
  count: number;
  enabled: boolean;
  kind: Exclude<DevelopmentCardKind, "victoryPoint">;
  reason?: string;
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
    gatheringPlayers: Array<{
      id: PlayerId;
      tokens: number;
      remainingAllowance: number;
      bankStock: ResourceMap;
    }>;
  };
}

export interface ActionAvailabilityState {
  game: GameState;
  guild: CommerceGuildState;
}

const developmentCardCost: ResourceMap = {
  wood: 0,
  brick: 0,
  wool: 1,
  grain: 1,
  ore: 1
};

const playableKinds: Exclude<DevelopmentCardKind, "victoryPoint">[] = [
  "knight",
  "roadBuilding",
  "yearOfPlenty",
  "monopoly"
];

function canPay(player: Player, cost: ResourceCost): boolean {
  return resources.every((resource) => player.resources[resource] >= (cost[resource] ?? 0));
}

function unavailableReason(player: Player, cost: ResourceCost): string | undefined {
  const missing = resources.filter(
    (resource) => player.resources[resource] < (cost[resource] ?? 0)
  );
  return missing.length > 0 ? `Cannot afford: need ${missing.join(", ")}.` : undefined;
}

function phaseReason(game: GameState, playerId: PlayerId, action = "using this action") {
  if (game.phase === "setup") return "Complete setup placement before using turn actions.";
  if (game.phase === "gameOver") return "Start a new game to use turn actions.";
  if (game.activePlayerId !== playerId) return "Only the active player may perform this action.";
  switch (game.turnState.phase) {
    case "action":
      return undefined;
    case "awaitingRoll":
      return `Roll the dice before ${action}.`;
    case "awaitingDiscards":
      return "Complete all required discards before using turn actions.";
    case "awaitingRobberPlacement":
      return "Move the robber before using turn actions.";
    case "awaitingRobberVictim":
      return "Choose a robber victim before using turn actions.";
    case "awaitingDevelopmentEffect":
      return "Complete the current development-card effect first.";
  }
}

function buildAvailability<TTarget>(
  game: GameState,
  player: Player,
  cost: ResourceMap,
  targets: TTarget[]
): ActionAvailability<TTarget> & { cost: ResourceMap } {
  const unavailable = phaseReason(game, player.id, "building");
  if (unavailable) return { cost, enabled: false, reason: unavailable, targets };
  const costReason = unavailableReason(player, cost);
  if (costReason) return { cost, enabled: false, reason: costReason, targets };
  if (targets.length === 0) {
    return { cost, enabled: false, reason: "No legal target is available.", targets };
  }
  return { cost, enabled: true, targets };
}

export function getActionAvailability(
  state: ActionAvailabilityState,
  playerId: PlayerId
): TurnActionAvailability {
  const { game, guild } = state;
  const player = game.players.find((candidate) => candidate.id === playerId);
  if (!player) throw new Error(`Unknown player: ${playerId}`);

  const normalActionReason = phaseReason(game, playerId);
  const road = buildAvailability(game, player, buildCosts.road, getLegalRoadEdgeIds(game, playerId));
  const settlement = buildAvailability(
    game,
    player,
    buildCosts.settlement,
    getLegalSettlementVertexIds(game, playerId)
  );
  const city = buildAvailability(
    game,
    player,
    buildCosts.city,
    getUpgradeableBuildingIds(game, playerId)
  );
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
  const buyCostReason = unavailableReason(player, developmentCardCost);
  const recipientIds = game.players
    .filter((candidate) => candidate.id !== playerId)
    .map((candidate) => candidate.id);

  return {
    roll: {
      enabled:
        game.phase === "playing" &&
        game.activePlayerId === playerId &&
        game.turnState.phase === "awaitingRoll",
      reason:
        game.phase === "setup"
          ? "Complete setup before rolling."
          : game.phase === "gameOver"
            ? "Start a new game before rolling."
            : game.activePlayerId !== playerId
          ? "Only the active player may roll."
          : game.turnState.phase !== "awaitingRoll"
            ? "The dice have already been rolled for this turn."
            : undefined,
      targets: []
    },
    endTurn: {
      enabled: !normalActionReason,
      reason: normalActionReason,
      targets: []
    },
    road,
    settlement,
    city,
    buyDevelopmentCard: {
      cost: developmentCardCost,
      enabled: !normalActionReason && !buyCostReason && game.developmentDeck.length > 0,
      reason:
        normalActionReason ??
        buyCostReason ??
        (game.developmentDeck.length === 0 ? "The development deck is empty." : undefined),
      targets: []
    },
    developmentCards: playableKinds.map((kind) => {
      const cards = player.developmentCards.filter((card) => card.kind === kind);
      const playableCard = cards.find((card) => card.purchasedTurn < game.turn);
      return {
        cardId: playableCard?.id,
        count: cards.length,
        enabled: developmentPhaseReady && Boolean(playableCard),
        kind,
        reason: !developmentPhaseReady
          ? "A development card cannot be played during the current phase."
          : !playableCard
            ? "No eligible card of this type is available."
            : undefined
      };
    }),
    maritime: {
      enabled: !normalActionReason && trades.length > 0,
      reason:
        normalActionReason ??
        (trades.length === 0 ? "No affordable maritime trade is available." : undefined),
      ratios,
      trades
    },
    commerce: {
      tradeSlots: guild.tradeSlots.map((slot) => {
        const reason =
          normalActionReason ??
          (guild.usedTradePlayerIds.includes(playerId)
            ? "A Commerce Guild trade was already completed this turn."
            : unavailableReason(player, slot.requires));
        return { id: slot.id, enabled: !reason, reason, targets: [] };
      }),
      transfer: {
        enabled: !normalActionReason && player.guildTokens > 0 && recipientIds.length > 0,
        maxAmount: player.guildTokens,
        reason:
          normalActionReason ??
          (player.guildTokens === 0 ? "No guild tokens are available to send." : undefined),
        recipientIds,
        targets: []
      },
      startGathering: {
        enabled: game.phase === "playing" && guild.gathering.phase === "idle",
        reason:
          game.phase !== "playing"
            ? "A gathering is available only during normal play."
            : guild.gathering.phase !== "idle"
              ? "A gathering is already in progress."
              : undefined,
        targets: []
      },
      openAuction: {
        enabled: game.phase === "playing" && guild.gathering.phase === "redemption",
        reason:
          game.phase !== "playing"
            ? "Auctions are available only during normal play."
            : guild.gathering.phase !== "redemption"
              ? "Resource redemption is not open."
              : undefined,
        targets: []
      },
      redeemPrize: {
        enabled: !normalActionReason && player.vouchers >= 3,
        reason:
          normalActionReason ??
          (player.vouchers < 3 ? "Three vouchers are required to redeem a prize." : undefined),
        targets: []
      },
      gatheringPlayers: game.players.map((candidate) => ({
        id: candidate.id,
        tokens: candidate.guildTokens,
        remainingAllowance: Math.max(
          0,
          4 - (guild.gathering.redemptions[candidate.id] ?? 0)
        ),
        bankStock: game.bank.resources
      }))
    }
  };
}
