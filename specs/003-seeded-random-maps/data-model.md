# Data Model: Seeded Random Maps and Clean Local Start

Date: 2026-07-13
Status: Planned
Requirements: RM-001 through RM-035

## 1. Public Seed Types

`src/domain/mapSeed.ts` owns the only constructor/parser boundary for seeds.

```ts
declare const mapSeedBrand: unique symbol;

export type MapSeed = string & { readonly [mapSeedBrand]: true };

export const LEGACY_STANDARD_MAP_SEED: MapSeed;

export function parseMapSeed(value: unknown): MapSeed;
export function formatM1MapSeed(highWord: number, lowWord: number): MapSeed;
export function createMapRandomSource(seed: MapSeed): RandomSource;
```

Validation:

- `M0-STANDARD` is the only supported `M0` value.
- `M1-[0-9A-F]{16}` is the only supported `M1` shape.
- Lowercase, whitespace, signs, shortened/padded variants, unknown prefixes, and extra fields are rejected rather than normalized.
- `formatM1MapSeed` accepts two unsigned 32-bit safe integers and always emits the canonical uppercase form.
- `createMapRandomSource(M0-STANDARD)` is not used directly; compatibility board reconstruction selects the fixed plan.

## 2. Board Data

Existing domain records remain the public board representation:

```ts
export interface StandardBoardData {
  board: BoardHex[];
  edges: BoardEdge[];
  ports: MaritimePort[];
}
```

New generation API in `src/domain/randomBoard.ts`:

```ts
export function createBoardDataForSeed(seed: MapSeed): StandardBoardData;
```

Invariants for `M1`:

- `board.length === 19`, unique vertices total 54, unique edges total 72.
- Hex coordinates are the existing standard radius-two axial coordinate set.
- Hex/vertex/edge/port IDs are derived from geometry position and never from terrain, number, or port type.
- Terrain multiset is `forest ×4`, `pasture ×4`, `field ×4`, `hill ×3`, `mountain ×3`, `desert ×1`.
- Number multiset is `2 ×1`, `3 ×2`, `4 ×2`, `5 ×2`, `6 ×2`, `8 ×2`, `9 ×2`, `10 ×2`, `11 ×2`, `12 ×1`.
- Desert has `resource === null` and `diceNumber === null`; all other terrain/resource pairs are canonical.
- No adjacent numbered hexes both contain 6 or 8.
- Ports occupy nine unique coastal edges, no two port edges share a vertex, with four generic plus one per resource.
- `robberHexId` is the generated desert ID.

`M0-STANDARD` reconstructs the released fixed board including legacy IDs so migrated live references remain valid. It is never returned by the fresh-seed source.

## 3. Game and Match State

`GameState` gains one required synchronized field:

```ts
export interface GameState {
  mapSeed: MapSeed;
  // existing fields unchanged
}
```

The seed is public and persisted as part of `MatchState.game`. There is no duplicate room-level seed.

Setup choice and restart types in `src/domain/match/types.ts`:

```ts
export type MapRestartMode = "fresh" | "sameMap";

export type MatchMapSelection =
  | { readonly kind: "fresh" }
  | { readonly kind: "seed"; readonly seed: MapSeed };

export interface MatchExecutionContext {
  random: RandomSource;
  nextMapSeed(): MapSeed;
  nextLogId(): string;
  now(): number;
}

export type MatchCommand =
  | { type: "START_NEW_GAME"; mode: MapRestartMode }
  | /* existing commands */;
```

Creation signature in `src/domain/match/createMatch.ts`:

```ts
export function createSetupMatch(
  seats: readonly MatchSeat[],
  map: MatchMapSelection,
  context: MatchExecutionContext
): MatchState;
```

Transition behavior:

| Operation | Seed source | Retained | Reset |
| --- | --- | --- | --- |
| Initial Local | `context.nextMapSeed()` | default four names | every game/expansion field |
| Initial Online | `context.nextMapSeed()` | locked room roster | every game/expansion field |
| Fresh restart | `context.nextMapSeed()` | current names/order | all state except roster |
| Same-map restart | current `game.mapSeed` | current names/order and seed | all state except roster/seed |

Every result is setup phase, player one active, settlement stage, snake order, empty pieces/hands/resources/pending state, full bank, fresh Commerce Guild, and independently shuffled development deck.

## 4. UI Projection

`GameTableGameView` gains:

```ts
readonly mapSeed: string;
```

`GameTableView` replaces `newGameEnabled` with:

```ts
readonly restart: {
  readonly enabled: boolean;
  readonly requiresConfirmation: boolean;
};
```

`GameTableIntent` replaces `game.new` with:

```ts
{ readonly type: "game.restart"; readonly mode: MapRestartMode }
```

Local maps the intent to `START_NEW_GAME`. Online maps it to `room.restart`. The Settings dialog owns only presentation, copy status, and confirmation state; it does not choose or parse a seed.

## 5. Online Public and Private Views

`PublicGameView` changes:

```ts
export interface PublicGameView {
  mapSeed: MapSeed;
  // remove boardLayout: "standard-v1"
  // existing public dynamic fields remain
}
```

`PrivateSeatState` gains:

```ts
canRestartMatch: boolean;
```

Projection rules:

- `mapSeed` is identical for every seat and safe to serialize publicly.
- `canRestartMatch` is true only when the viewer seat equals `hostSeatId` and lifecycle is `playing` or `finished`.
- Host identity remains omitted from post-start `PublicRoomState`.
- Projection regenerates the board from `mapSeed` and rejects a stored board mismatch before returning any snapshot.
- Browser parsing regenerates board data and validates all referenced IDs before branding the projection as parsed.

`ParsedOnlineGameProjection` gains regenerated data for the adapter:

```ts
export type ParsedOnlineGameProjection = ProjectedRoomView & {
  readonly boardData: StandardBoardData;
  readonly [parsedProjection]: true;
};
```

## 6. Wire Protocol v2

```ts
export const PROTOCOL_SCHEMA_VERSION = 2 as const;

export type ClientWebSocketMessage =
  | (VersionedClientMessage & {
      type: "room.restart";
      mode: MapRestartMode;
    })
  | /* existing messages */;
```

Strict parse rules:

- Exact keys: `type`, `commandId`, `expectedVersion`, `mode`.
- `mode` is exactly `fresh` or `sameMap`.
- No `seed`, `playerId`, `seatId`, host flag, randomness, or unknown key is accepted.
- Snapshots require schema version 2, a canonical public `mapSeed`, and private `canRestartMatch`.
- Schema v1 clients follow the existing `PROTOCOL_INCOMPATIBLE` refresh/recovery path.

## 7. Persisted Room v2

```ts
export interface PersistedRoom {
  schemaVersion: 2;
  // existing room fields
  matchState?: MatchState;
}
```

Semantic rules:

- Lobby: `matchState === undefined`; no seed exists yet.
- Playing: `matchState.game.phase !== "gameOver"` and `game.mapSeed` is supported/canonical.
- Finished: `matchState.game.phase === "gameOver"` and `game.mapSeed` is supported/canonical.
- Stored `board`, `edges`, and `ports` equal `createBoardDataForSeed(game.mapSeed)` exactly.
- Existing seat, host, ticket, version, auction, phase, player mapping, and retention invariants remain.

Legacy input type is confined to `worker/room/roomMigration.ts`:

```ts
export type PersistedRoomV1 = /* released schema-1 shape without game.mapSeed */;

export function migratePersistedRoomV1(room: PersistedRoomV1): PersistedRoom;
```

Migration matrix:

| v1 lifecycle | Board condition | Result |
| --- | --- | --- |
| lobby | no match/board | schema 2, otherwise unchanged |
| playing | exact released board | add `M0-STANDARD`, schema 2 |
| finished | exact released board | add `M0-STANDARD`, schema 2 |
| playing/finished | missing, changed, or malformed board | throw; no write |

Migration preserves `roomVersion`, timestamps, seats, host, hands, deck, phase, pieces, pending trade, pending auction, tickets, logs, and scores.

## 8. Room Restart Transition

New lifecycle function:

```ts
export function restartRoom(
  room: PersistedRoom,
  requestingSeatId: string,
  mode: MapRestartMode,
  context: MatchExecutionContext,
  execute: (state: MatchState, command: MatchCommand, context: MatchExecutionContext) => MatchState,
  now: number
): PersistedRoom;
```

Preconditions:

- Lifecycle is `playing` or `finished`.
- `matchState` exists.
- Requesting seat exists and equals `hostSeatId`.
- Mode is protocol-validated.

Postconditions:

- Shared command is `{ type: "START_NEW_GAME", mode }`.
- Lifecycle becomes `playing` because setup is a live match phase.
- `pendingAuction` is absent; all other pending match/private state is reset by setup creation.
- `roomVersion` increments once and activity/expiry timestamps refresh once.
- Seat IDs, tokens, player mappings, join order, host, presence attachments, and roster nicknames remain.
- Pipeline records the command ID only after the transition and projection preflight succeed.

## 9. Test-only Scenario State

`test/fixtures/createScenarioGame.ts` exports a prepared rule-test fixture. It may use `M0-STANDARD` and the released board IDs for compatibility with existing assertions, but it is never imported below `src/` or `worker/`.

Repository guard tests require:

- no `createDemoGame` declaration/export/import under `src/` or `worker/`;
- no production import from `test/`;
- Local initial state contains no prepared pieces or resources.
