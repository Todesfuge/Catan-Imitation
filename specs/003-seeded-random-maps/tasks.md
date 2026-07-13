# Tasks: Seeded Random Maps and Clean Local Start

Status: Ready for implementation
Plan: `specs/003-seeded-random-maps/plan.md`
Execution rule: complete tasks in order; every task ends with passing focused tests and one reviewable commit.

## Task 1 — T001: Canonical Map Seed and Frozen Random Stream

Requirements: RM-007, RM-009, RM-010, RM-029
Review boundary: seed syntax and deterministic integer stream only; no board or UI changes.

Files:

- Create `src/domain/mapSeed.ts`.
- Create `test/domain/mapSeed.test.ts`.

Steps:

- [ ] Write parser tests for exact `M0-STANDARD` and `M1-[0-9A-F]{16}` acceptance.
- [ ] Write rejection cases for lowercase, whitespace, short/long payloads, non-hex characters, unknown versions, and non-string values.
- [ ] Write formatter tests for unsigned 32-bit boundary words and rejection of negative, fractional, unsafe, or out-of-range words.
- [ ] Write deterministic stream vectors for at least the all-zero, all-one, alternating-bit, and all-`F` M1 seeds; assert bounded draws stay in `[0, maxExclusive)` for 1, 2, 9, 19, and 2^32.
- [ ] Run `pnpm vitest run test/domain/mapSeed.test.ts`; expect RED because `src/domain/mapSeed.ts` and its exports do not exist.
- [ ] Implement branded `MapSeed`, `LEGACY_STANDARD_MAP_SEED`, `parseMapSeed`, `formatM1MapSeed`, and the frozen dependency-free `createMapRandomSource` using explicit unsigned 32-bit operations and bounded multiply-high selection.
- [ ] Rerun `pnpm vitest run test/domain/mapSeed.test.ts`; expect all seed tests GREEN.
- [ ] Run `pnpm build`; expect TypeScript and Vite build success without a new dependency.
- [ ] Review the public API against `contracts/map-seed.md`, then commit `feat: add versioned map seed codec`.

## Task 2 — T002: Bounded Deterministic Board Generator

Requirements: RM-001–RM-008, RM-033
Review boundary: pure seed-to-board behavior and fixed-board compatibility.

Files:

- Modify `src/domain/board.ts`.
- Create `src/domain/randomBoard.ts`.
- Create `test/domain/randomBoard.test.ts`.
- Modify `test/domain/boardGeometry.test.ts`.
- Modify `test/domain/portGameplay.test.ts`.
- Modify `test/domain/production.test.ts`.

Steps:

- [ ] Add test helpers that count unique vertices/edges, derive hex adjacency from shared edges, identify coastal edge order, and compare complete board JSON.
- [ ] Add two or more complete M1 golden layouts and an M0 released-layout golden assertion.
- [ ] Add a deterministic loop over 1,000 canonical M1 seeds asserting topology, terrain/resource pairing, exact terrain/number/port multisets, desert token absence, and one robber-compatible desert ID.
- [ ] In the same loop, assert all four 6/8 tokens are pairwise non-adjacent and all nine port edges are coastal, distinct, and share no vertex.
- [ ] Assert two calls with one seed are byte-equivalent, different fixed verification seeds vary terrain/numbers/port positions, and M1 geometry IDs do not contain terrain, number, or port type text.
- [ ] Run `pnpm vitest run test/domain/randomBoard.test.ts test/domain/boardGeometry.test.ts test/domain/portGameplay.test.ts test/domain/production.test.ts`; expect RED on missing `createBoardDataForSeed` and neutral-identity behavior.
- [ ] Refactor `src/domain/board.ts` just enough to expose standard coordinate/topology/coastal-order construction while retaining the released fixed board for M0 compatibility.
- [ ] Implement `createBoardDataForSeed`: bounded terrain shuffle, enumerated four-hex red-token independent set, remaining token shuffle, coastal-cycle independent-set unranking, and exact port-type shuffle.
- [ ] Make every M1 ID geometry-derived; preserve released M0 IDs and public content exactly.
- [ ] Rerun the focused command; expect all generator/geometry/port/production tests GREEN, including the 1,000-seed set.
- [ ] Run `pnpm test`; expect the pre-integration suite GREEN with no seed-dependent test flakes.
- [ ] Review golden output changes as a compatibility contract, then commit `feat: generate bounded seeded boards`.

## Task 3 — T003: Seed-aware Match Creation and Restart Semantics

Requirements: RM-010–RM-016, RM-031, RM-033
Review boundary: shared match state and transitions; Local UI and online room authority remain unchanged.

Files:

- Modify `src/domain/types.ts`.
- Modify `src/domain/match/types.ts`.
- Modify `src/domain/match/createMatch.ts`.
- Modify `src/domain/match/applyMatchCommand.ts`.
- Modify `src/domain/match/random.ts` only if a shared unsigned-word constant is needed.
- Modify `test/domain/matchTransition.test.ts`.
- Modify `test/domain/setupInteraction.test.ts`.
- Modify `test/domain/matchCommandTestUtils.ts`.
- Update deterministic `MatchExecutionContext` literals reported by TypeScript in main tests.

Steps:

- [ ] Add test contexts with separately controlled `nextMapSeed` and hidden `random`, including counters for calls to each channel.
- [ ] Add initial setup tests asserting required `game.mapSeed`, board equality with the seed, empty snake-order state, fresh guild, full bank, empty hands/resources/pending trade, and a shuffled development deck.
- [ ] Add same-map restart tests asserting only roster and seed/layout are retained; phase, pieces, hands, resources, bank, deck, guild, trade, decisions, log, score ownership, and winner state reset.
- [ ] Add fresh restart tests asserting `nextMapSeed` is called once, a different fixed seed/layout is selected, and the same complete reset occurs.
- [ ] Add isolation tests proving board reconstruction never calls hidden `random`, same-map replay never calls `nextMapSeed`, and deck shuffle still uses hidden `random` after either mode.
- [ ] Add atomic failure tests for invalid seat counts, malformed selected seed, and exhausted hidden randomness; the original input state remains unchanged.
- [ ] Run `pnpm vitest run test/domain/matchTransition.test.ts test/domain/setupInteraction.test.ts`; expect RED on missing `mapSeed`, `nextMapSeed`, map selection, and restart mode.
- [ ] Add required `GameState.mapSeed`, `MapRestartMode`, `MatchMapSelection`, and `MatchExecutionContext.nextMapSeed`.
- [ ] Change `createSetupMatch` to `(seats, map, context)`, derive a fresh or supplied seed, build from it, and shuffle the deck only through `context.random`.
- [ ] Change `START_NEW_GAME` to require `mode` and recreate setup from current player names plus fresh/current seed as specified.
- [ ] Update test contexts with deterministic seed sources without weakening the required execution-context type.
- [ ] Rerun the focused command; expect all match/setup tests GREEN.
- [ ] Run `pnpm test`; expect all main tests GREEN before removing the demo fixture.
- [ ] Commit `feat: add seeded match setup and restart`.

## Task 4 — T004: Clean Local Boot and Test-only Scenario Fixture

Requirements: RM-011–RM-013, RM-017, RM-033
Review boundary: production demo deletion and Local composition only; no online schema changes.

Files:

- Create `test/fixtures/createScenarioGame.ts`.
- Modify `src/app/localGameState.ts`.
- Modify `src/app/gameReducer.ts`.
- Modify `src/domain/setup.ts`.
- Modify `src/domain/match/createMatch.ts` to delete `createDemoGame` after fixture migration.
- Modify the following fixture consumers:
  - `test/domain/auctionNoBid.test.ts`
  - `test/domain/classicSystems.test.ts`
  - `test/domain/commerceGuild.test.ts`
  - `test/domain/commerceGuildIntegrity.test.ts`
  - `test/domain/commerceGuildPolish.test.ts`
  - `test/domain/matchTransition.test.ts`
  - `test/domain/portGameplay.test.ts`
  - `test/domain/production.test.ts`
  - `test/domain/productPolish.test.ts`
  - `test/domain/ruleIntegrity.test.ts`
  - `test/domain/stats.test.ts`
  - `test/online/projectionPrivacy.test.ts`
- Modify `test/domain/gameTableView.test.ts` and `test/domain/deliveryReadiness.test.ts`.

Steps:

- [ ] Add a Local boot test asserting `createInitialAppState()` is setup phase with four current names, zero pieces/resources/private cards, no pending trade/decision, and a canonical M1 seed.
- [ ] Add Local reducer tests for mode-bearing `START_NEW_GAME` fresh and same-map commands, including UI selection/notice reset; until T008 replaces the shared UI intent, map the existing `game.new` intent explicitly to `fresh` so no mode-less command remains.
- [ ] Add a repository guard test that searches `src/` and `worker/` and fails on any `createDemoGame` declaration, export, import, or call.
- [ ] Run `pnpm vitest run test/domain/gameTableView.test.ts test/domain/deliveryReadiness.test.ts`; expect RED because Local still constructs the prepared game and the production demo symbol exists.
- [ ] Create `test/fixtures/createScenarioGame.ts` from the prepared rule-test state, with `M0-STANDARD` and no production imports from `test/`.
- [ ] Mechanically replace every listed test import/use of `createDemoGame` with the test-only fixture; preserve each test's intended state assertions.
- [ ] Make Local `createInitialAppState()` call fresh `createSetupMatch(defaultMatchSeats, { kind: "fresh" }, context)` and map both restart intents to mode-bearing `START_NEW_GAME`.
- [ ] Give Local `nextMapSeed` a cryptographic source separate from its hidden `LocalRandomSource`.
- [ ] Delete `createDemoGame` from `src/domain/match/createMatch.ts` and remove its `src/domain/setup.ts` re-export.
- [ ] Run `rg -n "createDemoGame" src worker`; expect no matches.
- [ ] Run `pnpm vitest run test/domain test/online/projectionPrivacy.test.ts`; expect all migrated scenario and Local tests GREEN.
- [ ] Run `pnpm test` and `pnpm build`; expect GREEN.
- [ ] Commit `refactor: start local games in real setup`.

## Task 5 — T005: Protocol v2 and Seed-derived Online Projection

Requirements: RM-007, RM-018, RM-021, RM-023, RM-030, RM-033
Review boundary: wire and privacy projection only; Worker storage remains schema v1 until T006.

Files:

- Modify `src/online/protocol.ts`.
- Modify `src/online/view.ts`.
- Modify `src/online/projectRoomView.ts`.
- Modify `src/online/onlineGameProjection.ts`.
- Modify `src/online/onlineGameAdapter.ts` only enough to consume regenerated `boardData` and compile.
- Modify `src/online/useOnlineRoom.ts`.
- Modify `test/online/protocol.test.ts`.
- Modify `test/online/projectionPrivacy.test.ts`.
- Modify `test/online/onlineGameUi.test.ts`.
- Modify `test/e2e/frontend-recovery.spec.ts` fixtures that declare schema-1 snapshots.

Steps:

- [ ] Add protocol tests requiring schema version 2 and exact `room.restart` messages with `fresh`/`sameMap`.
- [ ] Add adversarial protocol cases containing `seed`, actor/seat/host IDs, invalid mode, unknown fields, and schema version 1; expect strict rejection or existing incompatible behavior.
- [ ] Add projection tests requiring public canonical `mapSeed`, private boolean `canRestartMatch`, no post-start public host identity, and no opponent secret regressions.
- [ ] Add projection mismatch tests that alter one stored terrain, number, port, edge, or seed and expect projection failure before serialization.
- [ ] Add browser parser tests proving it regenerates byte-equivalent board data and validates robber/building/road/setup/allowed-action targets against seed-specific IDs.
- [ ] Run `pnpm vitest run test/online/protocol.test.ts test/online/projectionPrivacy.test.ts test/online/onlineGameUi.test.ts`; expect RED on schema version, new message, seed, capability, and generated geometry.
- [ ] Set `PROTOCOL_SCHEMA_VERSION = 2`; add exact top-level `room.restart` parsing with mode only.
- [ ] Replace `PublicGameView.boardLayout` with branded `mapSeed`; add `PrivateSeatState.canRestartMatch`.
- [ ] In Worker-side projection, derive expected board from the stored seed and reject any full board mismatch before projecting dynamic public state.
- [ ] In browser-side parsing, parse the seed, regenerate board data, use its ID sets for every strict check, and return that data on `ParsedOnlineGameProjection`.
- [ ] Change the online adapter from `standardOnlineBoardGeometry` to the parsed projection's `boardData`; leave restart disabled until T008.
- [ ] Update reconnect/incompatible fixtures to expect schema 2 without adding mixed-schema tolerance.
- [ ] Rerun the focused command; expect all protocol/privacy/adapter tests GREEN.
- [ ] Run `pnpm test` and `pnpm build`; expect GREEN.
- [ ] Commit `feat: project seeded maps over protocol v2`.

## Task 6 — T006: Persisted Room Schema v2 and Safe Legacy Migration

Requirements: RM-027–RM-031, RM-033
Review boundary: storage validation/migration only; no restart command behavior.

Files:

- Modify `worker/room/roomTypes.ts`.
- Create `worker/room/roomMigration.ts`.
- Modify `worker/room/roomStore.ts`.
- Modify `worker/room/roomLifecycle.ts` for schema-2 lobby creation/start signature only.
- Create `test/worker/roomMigration.test.ts`.
- Modify existing Worker fixtures that construct persisted rooms.

Steps:

- [ ] Add a focused v2 test factory that builds valid lobby, playing, and finished records without adding helpers to the 1,911-line lifecycle suite.
- [ ] Add tests that new rooms write schema 2, lobbies omit match state, and playing/finished rooms require canonical supported `game.mapSeed` plus exact seed/board coherence.
- [ ] Add v1 lobby migration test preserving every field except `schemaVersion`.
- [ ] Add v1 playing and finished fixed-board migration tests preserving room version, timestamps, credentials, hands, deck, pieces, phase, logs, pending trade/auction, and scores while adding `M0-STANDARD`.
- [ ] Add corruption cases changing one terrain, number, vertex/edge reference, port type/position, or board count; assert `RoomSchemaError` and byte-equivalent raw storage after failure.
- [ ] Add malformed/unsupported v2 seed cases and ticket-cleanup-plus-migration coverage; assert at most one validated replacement write.
- [ ] Run `pnpm build:worker`; expect RED TypeScript errors after tests/types require schema 2 while production still writes schema 1.
- [ ] Run `pnpm exec vitest run --config vitest.worker.config.ts test/worker/roomMigration.test.ts`; expect RED on missing migration and v2 validation.
- [ ] Change `PersistedRoom.schemaVersion` to 2 and confine `PersistedRoomV1` to the migration boundary.
- [ ] Implement `migratePersistedRoomV1` for valid lobby or exact released fixed boards; construct fully before returning.
- [ ] Refactor `roomStore` read validation to dispatch on schema, validate the complete candidate v2 room, then persist migration/ticket cleanup once.
- [ ] Strengthen v2 game validation for canonical seed and exact generated board while preserving all existing room/ticket/auction semantics.
- [ ] Update room creation to schema 2 and initial online start to fresh seeded setup.
- [ ] Rerun the focused Worker test; expect GREEN.
- [ ] Run `pnpm test:worker` and `pnpm build:worker`; expect all Worker tests/build GREEN.
- [ ] Commit `feat: migrate rooms to seeded schema v2`.

## Task 7 — T007: Authoritative Host Restart and Concurrency

Requirements: RM-014–RM-016, RM-022–RM-026, RM-031, RM-033
Review boundary: room authority, atomicity, idempotency, and broadcast; no settings presentation.

Files:

- Modify `worker/crypto.ts`.
- Modify `worker/testing/e2eExecutionContext.ts`.
- Modify `worker/room/roomLifecycle.ts`.
- Modify `worker/room/commandPipeline.ts`.
- Modify `worker/room/RoomDurableObject.ts` only if dependency wiring changes.
- Create `test/worker/roomRestart.test.ts`.
- Modify `test/worker/roomWebSocket.test.ts` for retry/broadcast regression.
- Modify `test/worker/roomLifecycle.test.ts` only where existing fixtures require the new context field.

Steps:

- [ ] Add `restartRoom` unit/integration tests for host success during setup, normal play, pending robber/development decisions, pending player trade, sealed auction, and finished game.
- [ ] Assert both modes preserve room/seat/host/credential/player mapping and roster, clear every pending match/auction field, enter setup, and increment room version exactly once.
- [ ] Add non-host, unknown-seat, lobby, missing-match, and malformed-context cases; expect `COMMAND_NOT_ALLOWED`/safe rejection and no mutation.
- [ ] Add command-pipeline tests for duplicate command ID, stale expected version, two concurrent host restarts, and transaction retry; assert one committed reset/seed/version and retry-stable entropy.
- [ ] Add recipient tests asserting one complete caller-specific v2 snapshot per live seat and no broadcast if projection preflight fails.
- [ ] Run `pnpm exec vitest run --config vitest.worker.config.ts test/worker/roomRestart.test.ts test/worker/roomWebSocket.test.ts`; expect RED because `room.restart`, `restartRoom`, and separate prepared seed entropy are not wired.
- [ ] Add retry-stable cryptographic M1 seed preparation that is distinct from `BufferedCryptoRandomSource`; prepare both before entering the storage transaction.
- [ ] Update E2E execution context to derive a deterministic M1 seed separately from hidden dice/general draws for each room version.
- [ ] Implement host-only `restartRoom` using the shared `START_NEW_GAME` transition for `playing` and `finished`, then remove `pendingAuction` and refresh lifecycle/version/activity once.
- [ ] Dispatch parsed `room.restart` through the existing authenticated admission, rate, version, idempotency, projection-preflight, persistence, audit, and broadcast path.
- [ ] Ensure command type audit is `room.restart` and a client-provided seed cannot enter the transition.
- [ ] Rerun the focused Worker command; expect GREEN.
- [ ] Run `pnpm test:worker`, `pnpm test`, and `pnpm build:worker`; expect GREEN.
- [ ] Commit `feat: authorize atomic host restarts`.

## Task 8 — T008: Shared Seed, Copy, Restart, Confirmation, and i18n UI

Requirements: RM-018–RM-023, RM-032–RM-034
Review boundary: shared presentation/controller behavior and accessibility.

Files:

- Modify `src/ui/GameTable.tsx`.
- Modify `src/ui/UtilityDialog.tsx`.
- Modify `src/ui/i18n.ts`.
- Modify `src/styles/app.css`.
- Modify `src/app/localGameState.ts` if final view fields are not yet projected.
- Modify `src/online/onlineGameAdapter.ts`.
- Modify `test/domain/gameTableView.test.ts`.
- Modify `test/domain/localization.test.ts`.
- Modify `test/domain/productPolish.test.ts`.
- Modify `test/online/onlineGameUi.test.ts`.

Steps:

- [ ] Add shared view tests for `game.mapSeed`, `restart.enabled`, `restart.requiresConfirmation`, and mode-bearing `game.restart` intents.
- [ ] Add Settings render tests for selectable canonical seed, accessible Copy Seed label, New Random Map, Replay Current Map, and absent restart controls for non-host callers.
- [ ] Add clipboard success, missing API, rejected promise, and repeated-attempt tests; assert localized `aria-live` status and persistent selectable seed.
- [ ] Add confirmation tests: Online host must confirm or cancel each mode; cancellation sends nothing; Local controls dispatch correct modes without an authority claim.
- [ ] Add finished-room online tests showing host restart remains enabled while ordinary gameplay actions remain disabled.
- [ ] Add English/Simplified-Chinese dictionary completeness and default-English assertions for every new key.
- [ ] Run `pnpm vitest run test/domain/gameTableView.test.ts test/domain/localization.test.ts test/domain/productPolish.test.ts test/online/onlineGameUi.test.ts`; expect RED on missing view, controls, copy status, confirmation, and translations.
- [ ] Add `mapSeed` to the shared game view, replace `newGameEnabled`/`game.new` with typed restart policy/intent, and wire Local modes.
- [ ] Implement Settings seed display, copy behavior, inline confirmation state, focus-safe cancel/confirm controls, and `aria-live` feedback.
- [ ] Enable online restart only when connected in `playing`/`finished` and `privateState.canRestartMatch`; send exact `room.restart` with current expected version and no seed.
- [ ] Add bilingual text and contained responsive styles using current design tokens and minimum target sizes.
- [ ] Rerun the focused command; expect GREEN.
- [ ] Run `pnpm test`, `pnpm build`, and `pnpm smoke:ui`; expect GREEN.
- [ ] Manually inspect Settings at desktop/tablet/mobile widths in both languages before committing.
- [ ] Commit `feat: add seed and restart settings`.

## Task 9 — T009: Browser Convergence, Documentation, and Release Gates

Requirements: RM-011, RM-018–RM-035
Review boundary: end-to-end evidence and documentation; production behavior changes only for defects proven by these tests.

Files:

- Modify `test/e2e/frontend-recovery.spec.ts`.
- Modify `test/e2e/online-multiplayer.spec.ts`.
- Modify `README.md`.
- Modify `README.zh-CN.md`.
- Modify `docs/roadmap.md`.
- Modify `test/domain/deliveryReadiness.test.ts` and `test/domain/localization.test.ts` for current docs claims.
- Update `specs/003-seeded-random-maps/quickstart.md` if command/output details changed.
- Create `specs/003-seeded-random-maps/verification.md`.
- Create `specs/003-seeded-random-maps/handoff.md`.

Steps:

- [ ] Add Local Playwright assertions for immediate empty setup, canonical seed, same-map layout preservation, fresh-map seed/layout change, and no intermediate demo action.
- [ ] Add clipboard-denial browser coverage proving localized failure and manual seed selection remain available.
- [ ] Add three-isolated-context Online coverage: same initial seed/layout, host-only restart controls, confirmed same-map convergence, confirmed fresh-map convergence, and one room-version increment per command.
- [ ] Add or retain an adversarial non-host direct restart assertion with no state change; cover reconnect after a restart receiving the complete current setup.
- [ ] Run `pnpm test:e2e`; expect RED until the new browser assertions and any discovered integration gap are resolved.
- [ ] Fix only reproducible integration defects within the approved seed/restart scope, rerunning the smallest failing Playwright project after each change.
- [ ] Update English and Chinese READMEs with random maps, public seeds, real Local setup, host restart, M0 compatibility scope, and current production URL; keep English default behavior explicit.
- [ ] Update the roadmap so generalized standard-map randomization is complete rather than future work; do not rewrite historical specs 001/002.
- [ ] Run `pnpm vitest run test/domain/deliveryReadiness.test.ts test/domain/localization.test.ts`; expect documentation/localization tests GREEN.
- [ ] Run `rg -n "createDemoGame" src worker`; expect no matches.
- [ ] Run `rg -n "boardLayout.*standard-v1" src worker`; expect no active protocol/projection matches.
- [ ] Run `pnpm test`; record exact passed file/test counts in `verification.md`.
- [ ] Run `pnpm test:worker`; record exact passed file/test counts.
- [ ] Run `pnpm test:e2e`; record exact passed project/test counts.
- [ ] Run `pnpm build`, `pnpm build:worker`, `pnpm smoke:ui`, and `pnpm smoke:worker`; record successful outputs.
- [ ] Run `pnpm exec wrangler deploy --dry-run --config wrangler.jsonc`; record bundle/binding success without deploying.
- [ ] Run `git diff --check`; expect no whitespace errors.
- [ ] Complete the RM-001–RM-035 evidence table in `verification.md`; write `handoff.md` with branch, commits, migration note, deployment implications, known out-of-scope items, and exact next action.
- [ ] Request a whole-branch code review, resolve every confirmed finding with focused RED/GREEN evidence, and rerun affected plus full gates.
- [ ] Commit `docs: verify seeded random maps` only after all evidence is current.

## Requirement Coverage Matrix

| Requirement | Implemented/tested in |
| --- | --- |
| RM-001 | T002 topology invariant over 1,000 seeds |
| RM-002 | T002 terrain multiset invariant |
| RM-003 | T002 number/desert invariant |
| RM-004 | T002 red-token independent-set invariant |
| RM-005 | T002 coastal non-adjacent port invariant |
| RM-006 | T002 neutral M1 identity assertions |
| RM-007 | T001 canonical seed; T002 golden cross-runtime layout; T005 projection reconstruction |
| RM-008 | T002 bounded candidate/unranking construction and 1,000-seed completion |
| RM-009 | T001 64-bit canonical formatter and bounds |
| RM-010 | T003 separated map/hidden entropy tests |
| RM-011 | T003 fresh setup; T004 Local; T006 Online start; T007 Online fresh restart |
| RM-012 | T004 Local boot assertions |
| RM-013 | T003/T004 complete empty setup assertions |
| RM-014 | T003 same-map retention/reset matrix |
| RM-015 | T003 fresh-map retention/reset matrix |
| RM-016 | T003 snake-order restart assertions |
| RM-017 | T004 test-only fixture and repository guard |
| RM-018 | T005 public seed; T008 settings display |
| RM-019 | T008 accessible bilingual copy control/status |
| RM-020 | T008 Local fresh/replay controls |
| RM-021 | T005 caller capability/privacy; T008 participant/host UI |
| RM-022 | T007 any-phase authority; T008 explicit confirmation |
| RM-023 | T005 exact protocol rejects seed; T008 sends mode only |
| RM-024 | T007 latest authenticated host check |
| RM-025 | T007 existing ordering/version/idempotency/persistence/broadcast tests |
| RM-026 | T003 reset matrix; T007 pending auction/projection acknowledgements |
| RM-027 | T006 schema-v2 validation |
| RM-028 | T006 exact fixed-board migration/preservation |
| RM-029 | T001 strict seed parse; T005 protocol strictness; T006 corruption rejection |
| RM-030 | T005 schema-v2 seed/capability and incompatible path |
| RM-031 | T003 transition atomicity; T006 no-write migration; T007 no-broadcast restart failure |
| RM-032 | T008 unit UI; T009 clipboard-denial browser evidence |
| RM-033 | T001–T007 focused automated suites |
| RM-034 | T009 Local and three-context Online Playwright coverage |
| RM-035 | T009 full release gates, docs, review, verification, and handoff |
