import { LEGACY_STANDARD_MAP_SEED } from "../../src/domain/mapSeed";
import type { MatchState } from "../../src/domain/match/types";
import { matchesBoardDataForSeed } from "../../src/domain/randomBoard";
import type { GameState } from "../../src/domain/types";
import type { PersistedRoom } from "./roomTypes";

type LegacyMatchState = Omit<MatchState, "game"> & {
  game: Omit<GameState, "mapSeed">;
};

interface PersistedRoomV1 extends Omit<PersistedRoom, "schemaVersion" | "matchState"> {
  schemaVersion: 1;
  matchState?: LegacyMatchState;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function migratePersistedRoomV1(value: unknown): PersistedRoom | undefined {
  if (!record(value) || value.schemaVersion !== 1) return undefined;

  const legacy = value as unknown as PersistedRoomV1;
  if (legacy.lifecycle === "lobby") {
    return { ...legacy, schemaVersion: 2 } as PersistedRoom;
  }
  if (
    (legacy.lifecycle !== "playing" && legacy.lifecycle !== "finished") ||
    !record(legacy.matchState) ||
    !record(legacy.matchState.game) ||
    Object.hasOwn(legacy.matchState.game, "mapSeed")
  ) {
    return undefined;
  }

  const game = legacy.matchState.game;
  if (!matchesBoardDataForSeed({
    board: game.board,
    edges: game.edges,
    ports: game.ports
  }, LEGACY_STANDARD_MAP_SEED)) {
    return undefined;
  }

  return {
    ...legacy,
    schemaVersion: 2,
    matchState: {
      ...legacy.matchState,
      game: { ...game, mapSeed: LEGACY_STANDARD_MAP_SEED }
    }
  } as PersistedRoom;
}
