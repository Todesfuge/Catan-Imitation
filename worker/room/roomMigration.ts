import {
  createInitialGatheringCooldown,
  createPostGatheringCooldown,
  type CommerceGuildState
} from "../../src/domain/expansion/commerceGuild";
import { LEGACY_STANDARD_MAP_SEED } from "../../src/domain/mapSeed";
import type { MatchState } from "../../src/domain/match/types";
import type { GameState } from "../../src/domain/types";
import type { PersistedRoom } from "./roomTypes";

type LegacyCommerceGuildState = Omit<CommerceGuildState, "gatheringCooldown"> & {
  lastAutoGatheringRound?: number;
};

type LegacyMatchStateV2 = Omit<MatchState, "guild"> & {
  guild: LegacyCommerceGuildState;
};

type LegacyMatchStateV1 = Omit<LegacyMatchStateV2, "game"> & {
  game: Omit<GameState, "mapSeed">;
};

interface PersistedRoomV2 extends Omit<PersistedRoom, "schemaVersion" | "matchState"> {
  schemaVersion: 2;
  matchState?: LegacyMatchStateV2;
}

interface PersistedRoomV1 extends Omit<PersistedRoom, "schemaVersion" | "matchState"> {
  schemaVersion: 1;
  matchState?: LegacyMatchStateV1;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = []
): boolean {
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key));
}

function positiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1;
}

function legacyGuild(value: unknown, game: Record<string, unknown>): value is LegacyCommerceGuildState {
  if (!record(value) || !exactKeys(
    value,
    ["tradeSlots", "usedTradePlayerIds", "gathering"],
    ["lastAutoGatheringRound"]
  ) || !record(value.gathering)) {
    return false;
  }
  const phase = value.gathering.phase;
  if (phase !== "idle" && phase !== "redemption" && phase !== "auction" && phase !== "complete") {
    return false;
  }
  return !Object.hasOwn(value, "lastAutoGatheringRound") ||
    (positiveSafeInteger(value.lastAutoGatheringRound) &&
      positiveSafeInteger(game.round) &&
      value.lastAutoGatheringRound <= game.round);
}

function migrateV1ToV2(value: unknown): PersistedRoomV2 | undefined {
  if (!record(value) || !Object.hasOwn(value, "schemaVersion") || value.schemaVersion !== 1) {
    return undefined;
  }

  const legacy = value as unknown as PersistedRoomV1;
  if (legacy.lifecycle === "lobby") {
    return { ...legacy, schemaVersion: 2 } as PersistedRoomV2;
  }
  if (
    (legacy.lifecycle !== "playing" && legacy.lifecycle !== "finished") ||
    !record(legacy.matchState) ||
    !record(legacy.matchState.game) ||
    Object.hasOwn(legacy.matchState.game, "mapSeed")
  ) {
    return undefined;
  }

  return {
    ...legacy,
    schemaVersion: 2,
    matchState: {
      ...legacy.matchState,
      game: { ...legacy.matchState.game, mapSeed: LEGACY_STANDARD_MAP_SEED }
    }
  } as PersistedRoomV2;
}

function migrateV2ToV3(value: unknown): PersistedRoom | undefined {
  if (!record(value) || !Object.hasOwn(value, "schemaVersion") || value.schemaVersion !== 2) {
    return undefined;
  }

  const legacy = value as unknown as PersistedRoomV2;
  if (legacy.lifecycle === "lobby") {
    return { ...legacy, schemaVersion: 3 } as PersistedRoom;
  }
  if (
    (legacy.lifecycle !== "playing" && legacy.lifecycle !== "finished") ||
    !record(legacy.matchState) ||
    !record(legacy.matchState.game) ||
    !legacyGuild(legacy.matchState.guild, legacy.matchState.game)
  ) {
    return undefined;
  }

  const game = legacy.matchState.game;
  if (!positiveSafeInteger(game.turn) || !Array.isArray(game.players)) return undefined;
  const phase = legacy.matchState.guild.gathering.phase;
  let gatheringCooldown;
  try {
    gatheringCooldown = phase === "idle" || phase === "complete"
      ? createInitialGatheringCooldown(game.turn, game.players.length)
      : createPostGatheringCooldown(game.turn, game.players.length);
  } catch {
    return undefined;
  }
  const {
    lastAutoGatheringRound: _obsoleteAutomaticRound,
    ...guild
  } = legacy.matchState.guild;

  return {
    ...legacy,
    schemaVersion: 3,
    matchState: {
      ...legacy.matchState,
      guild: { ...guild, gatheringCooldown }
    }
  } as PersistedRoom;
}

export function migratePersistedRoom(value: unknown): PersistedRoom | undefined {
  if (!record(value) || !Object.hasOwn(value, "schemaVersion")) return undefined;
  if (value.schemaVersion === 2) return migrateV2ToV3(value);
  if (value.schemaVersion !== 1) return undefined;
  const v2 = migrateV1ToV2(value);
  return v2 === undefined ? undefined : migrateV2ToV3(v2);
}
