# Research: Seeded Random Maps and Clean Local Start

Date: 2026-07-13
Status: Complete
Source specification: `specs/003-seeded-random-maps/spec.md`

## 1. Seed Syntax and Compatibility

Decision: use two explicit public seed forms:

- `M1-` followed by exactly sixteen uppercase hexadecimal digits for new 64-bit random maps.
- `M0-STANDARD` for the released fixed board used by compatible v1 rooms.

Reasons:

- Sixteen hex digits are canonical, short enough for settings UI, easy to validate without a dependency, and preserve the full two-word 64-bit value.
- At one million generated maps, the birthday-collision probability remains approximately 2.7e-8, which is negligible for this private-room portfolio product.
- The version prefix freezes generation behavior. Future algorithms must use a new prefix rather than silently changing an existing seed.
- `M0-STANDARD` is readable during migration and can never be confused with a newly generated `M1` seed.

Rejected:

- UUID seeds: longer, contain formatting unrelated to map generation, and invite accidental case/variant handling.
- Arbitrary user-entered seeds: explicitly outside this release and would add validation, history, and abuse/error UX without helping current acceptance.
- A seed that also drives deck, dice, theft, or Commerce Guild outcomes: exposes or reproduces hidden randomness and violates RM-010.

## 2. Deterministic Random Stream

Decision: `src/domain/mapSeed.ts` owns parsing, formatting, and a frozen dependency-free 32-bit seeded stream. All arithmetic uses explicit unsigned 32-bit operations; bounded integers use deterministic multiply-high mapping instead of environment randomness or a retry loop. Golden vectors freeze both seed decoding and the first generated layouts.

Reasons:

- Browser, Node/Vitest, and Cloudflare Workers all implement the required JavaScript integer and `BigInt` semantics.
- A local implementation avoids a runtime dependency for a small, stable contract.
- A versioned seed plus golden vectors makes accidental algorithm drift visible in review.
- Multiply-high selection has fixed work for every draw. Its at-most-one-bucket-per-2^32 mapping bias is immaterial for this product and avoids an unbounded rejection loop.

Rejected:

- `Math.random()`: cannot recreate a public map and differs from the authoritative Worker entropy path.
- A general-purpose random library: unnecessary dependency and version surface for one frozen generator.
- Retry-until-valid map generation: deterministic in practice but not bounded by contract and therefore fails RM-008.

## 3. Bounded Board Construction

Decision: retain the 19 axial coordinates and build each `M1` board through bounded selection:

1. Build neutral topology IDs from coordinate/index identity, independent of terrain and port content.
2. Fisher–Yates shuffle the exact terrain multiset.
3. Exclude the desert, enumerate the bounded set of four pairwise non-adjacent hex positions, choose one set for `[6, 6, 8, 8]`, and shuffle those four values.
4. Shuffle the remaining fourteen number tokens onto the remaining non-desert hexes.
5. Treat the thirty coastal edges as one cycle. Use dynamic-programming count/unranking to select nine non-adjacent positions in fixed time, then shuffle the exact four-generic/five-resource port multiset onto them.

Reasons:

- The terrain, token, and port multisets are correct by construction rather than repaired after generation.
- The red-token candidate space is at most `C(18, 4) = 3060`, so complete bounded enumeration is inexpensive.
- Cycle independent-set unranking selects one of the valid nine-edge coastal sets without enumerating roughly fourteen million raw combinations or retrying random candidates.
- Neutral `M1` IDs keep buildings, roads, logs, and online validation stable when content changes.

`M0-STANDARD` is a compatibility exception: it reconstructs the released fixed board, including its legacy content-derived IDs, so migrated mid-match building, road, and robber references remain valid. New maps never emit those IDs.

Rejected:

- Shuffle then swap adjacent 6/8 values: order-sensitive repair logic is difficult to prove complete and can bias or fail on future changes.
- Select nine random coast edges and retry conflicts: violates bounded termination.
- Change the board radius or component counts: outside the approved scope.

## 4. Public Projection Shape

Decision: protocol v2 replaces `PublicGameView.boardLayout: "standard-v1"` with `PublicGameView.mapSeed`. The Worker verifies that stored board data equals the board derived from that seed before projection. The browser parses the seed, recreates the same board through the shared generator, and validates all building, road, robber, setup, and allowed-action IDs against that generated topology.

Reasons:

- Board content is already a pure function of the public seed, so sending redundant board/edge/port arrays would create two possible sources of truth.
- Seed-only projection stays comfortably inside the existing 16 KiB wire limit.
- Strict regenerated-ID validation preserves the current fail-closed projection boundary.
- Public seed exposure does not reveal deck order, hands, bids, or future random outcomes.

Rejected:

- Send the complete board DTO in every snapshot: larger payload, duplicate validation, and possible seed/data disagreement.
- Keep `standard-v1` and let each client invent random content: no authoritative convergence or replay contract.

## 5. Randomness Separation and Retry Stability

Decision: extend `MatchExecutionContext` with `nextMapSeed(): MapSeed` while retaining `random: RandomSource` for hidden match outcomes. `createSetupMatch` accepts either `{ kind: "fresh" }` or `{ kind: "seed"; seed }`.

Environment behavior:

- Local: `nextMapSeed` uses browser cryptographic bytes; `random` remains the separate local hidden-random source.
- Worker: map-seed bytes and the existing buffered hidden random source are prepared before the storage transaction. Every retry receives the same prepared seed and hidden sequence.
- Worker E2E: both channels derive deterministic but separate values from stored room version.

Reasons:

- Fresh-map creation cannot shift or expose the hidden deck stream through public seeded generation.
- Same-map replay never consumes a new map seed but still receives a newly shuffled hidden deck.
- Precomputation preserves the command pipeline's existing retry stability.

## 6. Restart Command and Authority

Decision: add a versioned top-level WebSocket message:

```ts
{ type: "room.restart"; commandId: string; expectedVersion: number; mode: "fresh" | "sameMap" }
```

The room command pipeline authenticates the seat, applies idempotency/rate/version checks, and calls `restartRoom`. `restartRoom` accepts `playing` or `finished`, requires `requestingSeatId === hostSeatId`, executes the shared `START_NEW_GAME` transition, clears `pendingAuction`, persists one incremented room version, preflights projections, and broadcasts.

Reasons:

- Restart is room-authority behavior, not an ordinary player turn action.
- The client cannot supply a seed or actor identity.
- A separate message avoids weakening `trustedCommand`, which currently injects player identity into actorless gameplay commands.
- The existing serialized mutation path already provides stale-version rejection, duplicate command replay, atomic persistence, projection preflight, and broadcast convergence.

Caller capability is projected as `PrivateSeatState.canRestartMatch`; public post-start state continues not to reveal host credentials or private authority metadata.

## 7. Stored Schema v2 and Migration

Decision: set `PersistedRoom.schemaVersion` to `2`. A v2 `playing` or `finished` room requires a canonical supported `game.mapSeed`; a v2 lobby has no match and therefore no seed yet.

Migration rules:

- Valid v1 lobby: copy to schema v2 unchanged because no board exists; its eventual start creates `M1`.
- Valid v1 playing/finished room: compare the complete stored `board`, `edges`, and `ports` to the released v1 fixture. Only an exact match receives `game.mapSeed = M0-STANDARD`.
- Unsupported seed version, malformed seed, unknown seedless board, or invalid v1 structure: throw `RoomSchemaError` before any `put`.
- After constructing the candidate v2 value, run full v2 semantic validation, then persist once. Ticket cleanup may be combined into the same replacement.

Reasons:

- Exact recognition prevents silently relabeling corrupt or experimental rooms as the released map.
- Adding the seed inside `GameState` keeps one synchronized owner rather than duplicating room and game fields.
- A bounded `roomMigration.ts` keeps version conversion out of the already large storage module.

## 8. Local Start and Runtime Demo Removal

Decision: `createInitialAppState()` directly calls the shared fresh setup factory with the existing four default names. Production deletes `createDemoGame` and its re-export. Scenario-heavy tests use `test/fixtures/createScenarioGame.ts`.

Reasons:

- Local entry and every restart exercise the same real setup state machine.
- Test setup remains convenient without exposing a debug scenario through production imports or bundles.
- The fixture migration is mechanical and can be reviewed separately from rule changes.

## 9. UI, Accessibility, and Localization

Decision: Settings displays `state.game.mapSeed` in selectable text and provides Copy Seed, New Random Map, and Replay Current Map controls. `GameTableView.restart` carries `enabled` and `requiresConfirmation`; Local enables restart without an authority check, Online enables it only for a connected caller with `canRestartMatch` and requires confirmation.

Clipboard handling remains inside the settings dialog: `navigator.clipboard.writeText` success/failure drives an `aria-live` localized status. Failure never hides or disables the selectable seed.

Reasons:

- The shared settings surface covers Local and Online without adding another screen.
- Inline confirmation inside the existing dialog is keyboard-testable and avoids a second nested browser dialog.
- English remains the default; every new label/status receives English and Simplified-Chinese entries.

## 10. Test Boundaries

Decision: add focused files instead of extending known hotspots:

- `test/domain/mapSeed.test.ts`
- `test/domain/randomBoard.test.ts`
- `test/fixtures/createScenarioGame.ts`
- `test/worker/roomMigration.test.ts`
- `test/worker/roomRestart.test.ts`

The existing `test/worker/roomLifecycle.test.ts` is already 1,911 lines and `test/worker/roomWebSocket.test.ts` is 918 lines. New migration and restart suites keep those boundaries reviewable while reusing existing storage and recipient helpers where practical.
