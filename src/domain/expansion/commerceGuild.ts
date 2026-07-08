import {
  addResourceMaps,
  emptyResources,
  resources,
  type DevelopmentCardKind,
  type GameState,
  type Player,
  type PlayerId,
  type Resource,
  type ResourceMap
} from "../types";
import { createGuildDevelopmentCard } from "../rules/developmentCards";

export type ResourceCost = Partial<Record<Resource, number>>;

export interface TradeSlot {
  id: string;
  requires: ResourceCost;
  tokenReward: number;
}

export type GatheringPhase = "idle" | "redemption" | "auction" | "complete";

export type BlindBoxOutcome =
  | { kind: "resources"; resources: ResourceMap }
  | { kind: "voucher" }
  | { kind: "developmentCard"; card: DevelopmentCardKind };

export interface GatheringState {
  phase: GatheringPhase;
  redemptions: Record<PlayerId, number>;
  auctionRound: number;
  auctionResults: BlindBoxOutcome[];
}

export interface CommerceGuildState {
  tradeSlots: TradeSlot[];
  usedTradePlayerIds: PlayerId[];
  gathering: GatheringState;
}

export interface GuildResult {
  game: GameState;
  guild: CommerceGuildState;
}

export interface AuctionResult extends GuildResult {
  winnerId: PlayerId;
  winningBid: number;
  outcome: BlindBoxOutcome;
}

const defaultTradeSlots: TradeSlot[] = [
  { id: "wood-contract", requires: { wood: 2 }, tokenReward: 2 },
  { id: "brick-contract", requires: { brick: 1, grain: 1 }, tokenReward: 3 },
  { id: "ore-contract", requires: { ore: 1 }, tokenReward: 2 }
];

function createIdleGathering(): GatheringState {
  return {
    phase: "idle",
    redemptions: {},
    auctionRound: 1,
    auctionResults: []
  };
}

export function createCommerceGuild(tradeSlots: TradeSlot[] = defaultTradeSlots): CommerceGuildState {
  if (tradeSlots.length !== 3) {
    throw new Error("Commerce Guild requires exactly three trade slots.");
  }

  return {
    tradeSlots,
    usedTradePlayerIds: [],
    gathering: createIdleGathering()
  };
}

function updatePlayer(game: GameState, playerId: PlayerId, update: (player: Player) => Player): GameState {
  return {
    ...game,
    players: game.players.map((player) => (player.id === playerId ? update(player) : player))
  };
}

function getPlayer(game: GameState, playerId: PlayerId): Player {
  const player = game.players.find((candidate) => candidate.id === playerId);
  if (!player) {
    throw new Error(`Unknown player: ${playerId}`);
  }
  return player;
}

function canPay(resourcesMap: ResourceMap, cost: ResourceCost): boolean {
  return resources.every((resource) => resourcesMap[resource] >= (cost[resource] ?? 0));
}

function subtractCost(resourcesMap: ResourceMap, cost: ResourceCost): ResourceMap {
  return {
    wood: resourcesMap.wood - (cost.wood ?? 0),
    brick: resourcesMap.brick - (cost.brick ?? 0),
    wool: resourcesMap.wool - (cost.wool ?? 0),
    grain: resourcesMap.grain - (cost.grain ?? 0),
    ore: resourcesMap.ore - (cost.ore ?? 0)
  };
}

function normalizeCost(cost: ResourceCost): ResourceMap {
  return {
    wood: cost.wood ?? 0,
    brick: cost.brick ?? 0,
    wool: cost.wool ?? 0,
    grain: cost.grain ?? 0,
    ore: cost.ore ?? 0
  };
}

export function completeTradeSlot(
  game: GameState,
  guild: CommerceGuildState,
  playerId: PlayerId,
  slotId: string,
  nextSlot: TradeSlot = defaultTradeSlots[0]
): GuildResult {
  if (guild.usedTradePlayerIds.includes(playerId)) {
    throw new Error("A player may complete a Commerce Guild trade only once per turn.");
  }

  const slotIndex = guild.tradeSlots.findIndex((slot) => slot.id === slotId);
  if (slotIndex === -1) {
    throw new Error(`Unknown trade slot: ${slotId}`);
  }

  const player = getPlayer(game, playerId);
  const slot = guild.tradeSlots[slotIndex];
  if (!canPay(player.resources, slot.requires)) {
    throw new Error("Player does not have the required resources for this trade.");
  }

  const updatedGame = updatePlayer(game, playerId, (candidate) => ({
    ...candidate,
    resources: subtractCost(candidate.resources, slot.requires),
    guildTokens: candidate.guildTokens + slot.tokenReward
  }));

  const refreshedSlots = guild.tradeSlots.map((candidate, index) =>
    index === slotIndex ? nextSlot : candidate
  );

  return {
    game: updatedGame,
    guild: {
      ...guild,
      tradeSlots: refreshedSlots,
      usedTradePlayerIds: [...guild.usedTradePlayerIds, playerId]
    }
  };
}

export function transferGuildTokens(
  game: GameState,
  fromPlayerId: PlayerId,
  toPlayerId: PlayerId,
  amount: number
): GameState {
  if (amount <= 0) {
    throw new Error("Token transfer amount must be positive.");
  }

  const from = getPlayer(game, fromPlayerId);
  getPlayer(game, toPlayerId);
  if (from.guildTokens < amount) {
    throw new Error("Player does not have enough guild tokens.");
  }

  return {
    ...game,
    players: game.players.map((player) => {
      if (player.id === fromPlayerId) {
        return { ...player, guildTokens: player.guildTokens - amount };
      }
      if (player.id === toPlayerId) {
        return { ...player, guildTokens: player.guildTokens + amount };
      }
      return player;
    })
  };
}

export function startGuildGathering(guild: CommerceGuildState): CommerceGuildState {
  return {
    ...guild,
    gathering: {
      phase: "redemption",
      redemptions: {},
      auctionRound: 1,
      auctionResults: []
    }
  };
}

export function openGuildAuction(guild: CommerceGuildState): CommerceGuildState {
  return {
    ...guild,
    gathering: {
      ...guild.gathering,
      phase: "auction",
      auctionRound: 1
    }
  };
}

export function redeemGatheringResources(
  game: GameState,
  guild: CommerceGuildState,
  playerId: PlayerId,
  requested: ResourceCost
): GuildResult {
  if (guild.gathering.phase !== "redemption") {
    throw new Error("Guild gathering is not in resource redemption phase.");
  }

  const player = getPlayer(game, playerId);
  const alreadyRedeemed = guild.gathering.redemptions[playerId] ?? 0;
  const remainingGatheringCap = Math.max(0, 4 - alreadyRedeemed);
  const redeemable = Math.min(remainingGatheringCap, player.guildTokens);
  let remaining = redeemable;
  let redeemedCount = 0;
  let gained = emptyResources();

  for (const resource of resources) {
    const requestedCount = requested[resource] ?? 0;
    const accepted = Math.min(requestedCount, remaining);
    if (accepted <= 0) {
      continue;
    }

    gained = addResourceMaps(gained, { ...emptyResources(), [resource]: accepted });
    remaining -= accepted;
    redeemedCount += accepted;
  }

  return {
    game: updatePlayer(game, playerId, (candidate) => ({
      ...candidate,
      guildTokens: candidate.guildTokens - redeemedCount,
      resources: addResourceMaps(candidate.resources, gained)
    })),
    guild: {
      ...guild,
      gathering: {
        ...guild.gathering,
        redemptions: {
          ...guild.gathering.redemptions,
          [playerId]: alreadyRedeemed + redeemedCount
        }
      }
    }
  };
}

function turnOrderFromActive(game: GameState): PlayerId[] {
  const activeIndex = game.players.findIndex((player) => player.id === game.activePlayerId);
  const ordered = activeIndex === -1 ? game.players : game.players.slice(activeIndex).concat(game.players.slice(0, activeIndex));
  return ordered.map((player) => player.id);
}

function pickAuctionWinner(
  game: GameState,
  bids: Record<PlayerId, number>
): { winnerId: PlayerId; winningBid: number } {
  const turnOrder = turnOrderFromActive(game);
  const validBids = Object.entries(bids).filter(([playerId, bid]) => {
    const player = getPlayer(game, playerId);
    return bid > 0 && player.guildTokens >= bid;
  });

  if (validBids.length === 0) {
    throw new Error("Auction requires at least one affordable positive bid.");
  }

  validBids.sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1];
    }
    return turnOrder.indexOf(left[0]) - turnOrder.indexOf(right[0]);
  });

  return {
    winnerId: validBids[0][0],
    winningBid: validBids[0][1]
  };
}

function rollResourceBundle(random: () => number): ResourceMap {
  const amount = 2 + Math.floor(random() * 3);
  let bundle = emptyResources();

  for (let index = 0; index < amount; index += 1) {
    const resource = resources[Math.floor(random() * resources.length)];
    bundle = addResourceMaps(bundle, { ...emptyResources(), [resource]: 1 });
  }

  return bundle;
}

function openBlindBox(random: () => number): BlindBoxOutcome {
  const roll = random();

  if (roll < 0.5) {
    return { kind: "resources", resources: rollResourceBundle(random) };
  }
  if (roll < 0.8) {
    return { kind: "voucher" };
  }
  return { kind: "developmentCard", card: "knight" };
}

function applyBlindBoxOutcome(game: GameState, playerId: PlayerId, outcome: BlindBoxOutcome): GameState {
  return updatePlayer(game, playerId, (player) => {
    if (outcome.kind === "resources") {
      return { ...player, resources: addResourceMaps(player.resources, outcome.resources) };
    }
    if (outcome.kind === "voucher") {
      return { ...player, vouchers: player.vouchers + 1 };
    }
    return {
      ...player,
      developmentCards: [
        ...player.developmentCards,
        createGuildDevelopmentCard(outcome.card, game, player)
      ]
    };
  });
}

export function resolveAuctionRound(
  game: GameState,
  guild: CommerceGuildState,
  bids: Record<PlayerId, number>,
  random: () => number = Math.random
): AuctionResult {
  if (guild.gathering.phase !== "auction") {
    throw new Error("Guild gathering is not in auction phase.");
  }

  const { winnerId, winningBid } = pickAuctionWinner(game, bids);
  const outcome = openBlindBox(random);
  const paidGame = updatePlayer(game, winnerId, (player) => ({
    ...player,
    guildTokens: player.guildTokens - winningBid
  }));
  const rewardedGame = applyBlindBoxOutcome(paidGame, winnerId, outcome);
  const nextRound = guild.gathering.auctionRound + 1;

  return {
    game: rewardedGame,
    guild: {
      ...guild,
      gathering: {
        ...guild.gathering,
        auctionRound: nextRound,
        phase: nextRound > 3 ? "complete" : "auction",
        auctionResults: [...guild.gathering.auctionResults, outcome]
      }
    },
    winnerId,
    winningBid,
    outcome
  };
}

export function redeemPrizeCards(game: GameState, playerId: PlayerId): GameState {
  return updatePlayer(game, playerId, (player) => {
    const prizeCards = Math.floor(player.vouchers / 3);
    if (prizeCards === 0) {
      return player;
    }

    return {
      ...player,
      vouchers: player.vouchers - prizeCards * 3,
      prizeCards: player.prizeCards + prizeCards
    };
  });
}
