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
import { RuleViolationError } from "../errors";
import { awardDevelopmentCardFromDeck } from "../rules/developmentCards";

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

export interface AuctionSummaryData {
  winnerId: PlayerId;
  winnerName: string;
  round: number;
  winningBid: number;
  outcome: BlindBoxOutcome;
}

export interface GatheringState {
  phase: GatheringPhase;
  redemptions: Record<PlayerId, number>;
  auctionRound: number;
  auctionResults: BlindBoxOutcome[];
  lastAuctionSummary?: string;
  lastAuctionResult?: AuctionSummaryData;
}

export interface GatheringCooldownWindow {
  availableAtTurn: number;
  displayDuration: number;
}

export type GatheringStartBlocker =
  | "notPlaying"
  | "unresolvedAction"
  | "notCurrentPlayer"
  | "pendingTrade"
  | "gatheringInProgress"
  | "cooldown";

export interface CommerceGuildState {
  tradeSlots: TradeSlot[];
  usedTradePlayerIds: PlayerId[];
  gathering: GatheringState;
  gatheringCooldown: GatheringCooldownWindow;
}

export interface GuildResult {
  game: GameState;
  guild: CommerceGuildState;
}

export interface AuctionWonResult extends GuildResult {
  kind: "won";
  winnerId: PlayerId;
  winningBid: number;
  outcome: BlindBoxOutcome;
  summary: string;
}

export interface AuctionNoBidResult extends GuildResult {
  kind: "noBid";
  round: number;
  summary: string;
}

export type AuctionResult = AuctionWonResult | AuctionNoBidResult;

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

function assertPositiveSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RuleViolationError(`${label} must be a positive safe integer.`);
  }
}

export function createInitialGatheringCooldown(
  currentTurn: number,
  playerCount: number
): GatheringCooldownWindow {
  assertPositiveSafeInteger(currentTurn, "Current turn");
  assertPositiveSafeInteger(playerCount, "Player count");
  const displayDuration = 2 * playerCount;
  const availableAtTurn = currentTurn + displayDuration;
  assertPositiveSafeInteger(displayDuration, "Gathering display duration");
  assertPositiveSafeInteger(availableAtTurn, "Gathering available turn");
  return {
    availableAtTurn,
    displayDuration
  };
}

export function createPostGatheringCooldown(
  currentTurn: number,
  playerCount: number
): GatheringCooldownWindow {
  assertPositiveSafeInteger(currentTurn, "Current turn");
  assertPositiveSafeInteger(playerCount, "Player count");
  const availableAtTurn = currentTurn + playerCount + 1;
  assertPositiveSafeInteger(availableAtTurn, "Gathering available turn");
  return {
    availableAtTurn,
    displayDuration: playerCount
  };
}

export function getGatheringCooldownRemaining(
  window: GatheringCooldownWindow,
  currentTurn: number
): number {
  assertPositiveSafeInteger(currentTurn, "Current turn");
  assertPositiveSafeInteger(window.availableAtTurn, "Gathering available turn");
  assertPositiveSafeInteger(window.displayDuration, "Gathering display duration");
  return Math.min(
    window.displayDuration,
    Math.max(0, window.availableAtTurn - currentTurn)
  );
}

export function createCommerceGuild(
  playerCount: number,
  currentTurn: number,
  tradeSlots: TradeSlot[] = defaultTradeSlots
): CommerceGuildState {
  if (tradeSlots.length !== 3) {
    throw new RuleViolationError("Commerce Guild requires exactly three trade slots.");
  }

  return {
    tradeSlots,
    usedTradePlayerIds: [],
    gathering: createIdleGathering(),
    gatheringCooldown: createInitialGatheringCooldown(currentTurn, playerCount)
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
    throw new RuleViolationError(`Unknown player: ${playerId}`);
  }
  return player;
}

function canPay(resourcesMap: ResourceMap, cost: ResourceCost): boolean {
  return resources.every((resource) => resourcesMap[resource] >= (cost[resource] ?? 0));
}

function assertWholeNumber(value: number, label: string, allowZero = true): void {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0 || (!allowZero && value === 0)) {
    throw new RuleViolationError(`${label} must be a ${allowZero ? "non-negative" : "positive"} finite whole number.`);
  }
}

function assertResourceCost(cost: ResourceCost, label: string, requirePositive = true): void {
  for (const resource of resources) {
    assertWholeNumber(cost[resource] ?? 0, `${label} ${resource}`);
  }
  if (requirePositive && resources.every((resource) => (cost[resource] ?? 0) === 0)) {
    throw new RuleViolationError(`${label} must include at least one resource.`);
  }
}

function assertTradeSlot(slot: TradeSlot): void {
  assertResourceCost(slot.requires, "Trade-slot cost");
  assertWholeNumber(slot.tokenReward, "Trade-slot reward", false);
}

function sampleRandom(random: () => number): number {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RuleViolationError("Random source must return a finite value in the range [0, 1).");
  }
  return value;
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
    throw new RuleViolationError("A player may complete a Commerce Guild trade only once per turn.");
  }

  const slotIndex = guild.tradeSlots.findIndex((slot) => slot.id === slotId);
  if (slotIndex === -1) {
    throw new RuleViolationError(`Unknown trade slot: ${slotId}`);
  }

  const player = getPlayer(game, playerId);
  const slot = guild.tradeSlots[slotIndex];
  assertTradeSlot(slot);
  assertTradeSlot(nextSlot);
  if (!canPay(player.resources, slot.requires)) {
    throw new RuleViolationError("Player does not have the required resources for this trade.");
  }

  const normalizedCost = normalizeCost(slot.requires);
  const paidGame = updatePlayer(game, playerId, (candidate) => ({
    ...candidate,
    resources: subtractCost(candidate.resources, slot.requires),
    guildTokens: candidate.guildTokens + slot.tokenReward
  }));
  const updatedGame = {
    ...paidGame,
    bank: {
      resources: addResourceMaps(paidGame.bank.resources, normalizedCost)
    }
  };

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
  if (fromPlayerId === toPlayerId) {
    throw new RuleViolationError("Token transfer requires two different players.");
  }

  assertWholeNumber(amount, "Token transfer amount", false);

  const from = getPlayer(game, fromPlayerId);
  getPlayer(game, toPlayerId);
  if (from.guildTokens < amount) {
    throw new RuleViolationError("Player does not have enough guild tokens.");
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

export function getGatheringStartBlocker(
  game: GameState,
  guild: CommerceGuildState,
  playerId: PlayerId,
  hasPendingTrade: boolean
): GatheringStartBlocker | undefined {
  if (game.phase !== "playing") return "notPlaying";
  if (game.turnState.phase !== "action") return "unresolvedAction";
  if (game.activePlayerId !== playerId) return "notCurrentPlayer";
  if (hasPendingTrade) return "pendingTrade";
  if (guild.gathering.phase !== "idle") return "gatheringInProgress";
  if (getGatheringCooldownRemaining(guild.gatheringCooldown, game.turn) > 0) {
    return "cooldown";
  }
  return undefined;
}

function gatheringStartError(blocker: GatheringStartBlocker): string {
  switch (blocker) {
    case "notPlaying": return "A Commerce Guild gathering is available only during normal play.";
    case "unresolvedAction": return "Complete the current turn requirement before starting a gathering.";
    case "notCurrentPlayer": return "Only the active player may start a Commerce Guild gathering.";
    case "pendingTrade": return "Close the pending player trade before starting a gathering.";
    case "gatheringInProgress": return "A Commerce Guild gathering is already in progress.";
    case "cooldown": return "The Commerce Guild gathering is still cooling down.";
  }
}

export function startGuildGathering(
  game: GameState,
  guild: CommerceGuildState,
  playerId: PlayerId,
  hasPendingTrade: boolean
): CommerceGuildState {
  const blocker = getGatheringStartBlocker(game, guild, playerId, hasPendingTrade);
  if (blocker) {
    throw new RuleViolationError(gatheringStartError(blocker));
  }
  return {
    ...guild,
    gatheringCooldown: createPostGatheringCooldown(game.turn, game.players.length),
    gathering: {
      phase: "redemption",
      redemptions: {},
      auctionRound: 1,
      auctionResults: []
    }
  };
}

export function closeCompletedGuildGathering(guild: CommerceGuildState): CommerceGuildState {
  if (guild.gathering.phase !== "complete") return guild;
  return {
    ...guild,
    gathering: {
      ...guild.gathering,
      phase: "idle"
    }
  };
}

export function openGuildAuction(
  game: GameState,
  guild: CommerceGuildState
): CommerceGuildState {
  const hasEligibleBidder = game.players.some((player) => player.guildTokens > 0);
  return {
    ...guild,
    gathering: {
      ...guild.gathering,
      phase: hasEligibleBidder ? "auction" : "complete",
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
    throw new RuleViolationError("Guild gathering is not in resource redemption phase.");
  }

  assertResourceCost(requested, "Gathering redemption");

  const player = getPlayer(game, playerId);
  const alreadyRedeemed = guild.gathering.redemptions[playerId] ?? 0;
  const remainingGatheringCap = Math.max(0, 4 - alreadyRedeemed);
  if (remainingGatheringCap === 0) {
    throw new RuleViolationError("The gathering redemption cap has already been reached.");
  }
  if (player.guildTokens === 0) {
    throw new RuleViolationError("The player has no guild tokens available for redemption.");
  }
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

  if (resources.some((resource) => gained[resource] > game.bank.resources[resource])) {
    throw new RuleViolationError("The bank does not have enough stock for this gathering redemption.");
  }

  const redeemedGame = updatePlayer(game, playerId, (candidate) => ({
    ...candidate,
    guildTokens: candidate.guildTokens - redeemedCount,
    resources: addResourceMaps(candidate.resources, gained)
  }));

  return {
    game: {
      ...redeemedGame,
      bank: {
        resources: subtractCost(redeemedGame.bank.resources, gained)
      }
    },
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
): { winnerId: PlayerId; winningBid: number } | undefined {
  const turnOrder = turnOrderFromActive(game);
  const validBids = Object.entries(bids).filter(([playerId, bid]) => {
    assertWholeNumber(bid, "Auction bid");
    const player = getPlayer(game, playerId);
    if (bid > player.guildTokens) {
      throw new RuleViolationError(`${player.name} bid exceeds available guild tokens.`);
    }
    return bid > 0 && player.guildTokens >= bid;
  });

  validBids.sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1];
    }
    return turnOrder.indexOf(left[0]) - turnOrder.indexOf(right[0]);
  });

  return validBids.length > 0 ? {
    winnerId: validBids[0][0],
    winningBid: validBids[0][1]
  } : undefined;
}

function rollResourceBundle(random: () => number): ResourceMap {
  const amount = 2 + Math.floor(sampleRandom(random) * 3);
  let bundle = emptyResources();

  for (let index = 0; index < amount; index += 1) {
    const resource = resources[Math.floor(sampleRandom(random) * resources.length)];
    bundle = addResourceMaps(bundle, { ...emptyResources(), [resource]: 1 });
  }

  return bundle;
}

function openBlindBox(random: () => number): BlindBoxOutcome {
  const roll = sampleRandom(random);

  if (roll < 0.5) {
    return { kind: "resources", resources: rollResourceBundle(random) };
  }
  if (roll < 0.8) {
    return { kind: "voucher" };
  }
  return { kind: "developmentCard", card: "knight" };
}

function applyBlindBoxOutcome(
  game: GameState,
  playerId: PlayerId,
  outcome: BlindBoxOutcome
): { game: GameState; outcome: BlindBoxOutcome } {
  if (outcome.kind === "resources") {
    const awarded = Object.fromEntries(
      resources.map((resource) => [
        resource,
        Math.min(outcome.resources[resource], game.bank.resources[resource])
      ])
    ) as ResourceMap;
    const rewardedGame = updatePlayer(game, playerId, (player) => ({
      ...player,
      resources: addResourceMaps(player.resources, awarded)
    }));
    return {
      game: {
        ...rewardedGame,
        bank: {
          resources: subtractCost(rewardedGame.bank.resources, awarded)
        }
      },
      outcome: { kind: "resources", resources: awarded }
    };
  }

  if (outcome.kind === "voucher") {
    return {
      game: updatePlayer(game, playerId, (player) => ({
        ...player,
        vouchers: player.vouchers + 1
      })),
      outcome
    };
  }

  return { game, outcome };
}

function resolveBlindBoxOutcome(
  game: GameState,
  playerId: PlayerId,
  random: () => number
): { game: GameState; outcome: BlindBoxOutcome } {
  const provisionalOutcome = openBlindBox(random);
  if (provisionalOutcome.kind !== "developmentCard") {
    return applyBlindBoxOutcome(game, playerId, provisionalOutcome);
  }

  const reward = awardDevelopmentCardFromDeck(game, playerId);
  return {
    game: reward.game,
    outcome: {
      kind: "developmentCard",
      card: reward.card.kind
    }
  };
}

export function describeBlindBoxOutcome(outcome: BlindBoxOutcome): string {
  if (outcome.kind === "voucher") {
    return "voucher";
  }
  if (outcome.kind === "developmentCard") {
    return `${outcome.card} development card`;
  }
  const description = resources
    .filter((resource) => outcome.resources[resource] > 0)
    .map((resource) => `${resource} ${outcome.resources[resource]}`)
    .join(", ");
  return description.length > 0 ? `resources: ${description}` : "no resources (bank stock exhausted)";
}

export function resolveAuctionRound(
  game: GameState,
  guild: CommerceGuildState,
  bids: Record<PlayerId, number>,
  random: () => number = Math.random
): AuctionResult {
  if (guild.gathering.phase !== "auction") {
    throw new RuleViolationError("Guild gathering is not in auction phase.");
  }

  const winner = pickAuctionWinner(game, bids);
  const round = guild.gathering.auctionRound;
  const nextRound = round + 1;
  if (!winner) {
    const summary = `No bids were placed in Commerce Guild auction round ${round}.`;
    return {
      kind: "noBid",
      game,
      guild: {
        ...guild,
        gathering: {
          ...guild.gathering,
          auctionRound: nextRound,
          phase: nextRound > 3 ? "complete" : "auction",
          lastAuctionSummary: summary
        }
      },
      round,
      summary
    };
  }

  const { winnerId, winningBid } = winner;
  const paidGame = updatePlayer(game, winnerId, (player) => ({
    ...player,
    guildTokens: player.guildTokens - winningBid
  }));
  const resolvedOutcome = resolveBlindBoxOutcome(paidGame, winnerId, random);
  const outcome = resolvedOutcome.outcome;
  const rewardedGame = resolvedOutcome.game;
  const winnerName = getPlayer(game, winnerId).name;
  const summary = `${winnerName} won auction round ${round} with ${winningBid} ${winningBid === 1 ? "token" : "tokens"}: ${describeBlindBoxOutcome(outcome)}.`;

  return {
    kind: "won",
    game: rewardedGame,
    guild: {
      ...guild,
      gathering: {
        ...guild.gathering,
        auctionRound: nextRound,
        phase: nextRound > 3 ? "complete" : "auction",
        auctionResults: [...guild.gathering.auctionResults, outcome],
        lastAuctionSummary: summary,
        lastAuctionResult: {
          winnerId,
          winnerName,
          round,
          winningBid,
          outcome
        }
      }
    },
    winnerId,
    winningBid,
    outcome,
    summary
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
