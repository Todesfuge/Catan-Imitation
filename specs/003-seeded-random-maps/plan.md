# Implementation Plan: Seeded Random Maps and Clean Local Start

Date: 2026-07-13
Branch: `codex/seeded-random-maps`
Specification: `specs/003-seeded-random-maps/spec.md`

> **Agentic worker note:** Execute `tasks.md` in order with test-first RED/GREEN evidence. Use a fresh review checkpoint after each task commit. Do not combine migration, authority, and UI work into one unreviewed change.

## Goal

Make every new Local and Online match use a balanced deterministic random standard map, enter Local directly into real snake-order setup, expose a copyable public seed, and let only the online host restart on a fresh or repeated map through the authoritative room pipeline. Remove the runtime prepared demo while preserving test scenarios in test-only code and safely migrate recognized v1 rooms.

## Architecture

The implementation adds one pure versioned `seed -> board` boundary in the domain. `GameState` owns the canonical public seed, while `MatchExecutionContext` exposes a separate seed source and hidden-random source. Local and Worker setup/restart paths call the same match creation and transition functions.

Online protocol v2 transmits the seed rather than redundant board arrays. Worker projection verifies stored board data against the shared generator; browser projection parses the seed, rebuilds the board, and validates every public/action reference against it. A top-level `room.restart` command remains actorless and seedless, and the room derives host permission from the authenticated seat.

Durable Object storage upgrades to schema v2. A bounded migration module accepts a v1 lobby or an exact released fixed-board room; live fixed rooms receive `M0-STANDARD`. Unknown or malformed boards fail before mutation.

## Technology Stack

- TypeScript 5.7 domain modules with no new dependency.
- React 18 shared game table and settings dialog.
- Vitest 2 main and Cloudflare Workers pools.
- Playwright 1.61 for Local and three-context Online convergence.
- Cloudflare Worker + SQLite-backed Durable Object storage.
- Existing English/Simplified-Chinese dictionary in `src/ui/i18n.ts`.

## Global Constraints

- Follow TDD: add focused failing behavior, run it and observe the expected failure, implement the smallest passing change, then rerun focused and broader gates.
- Do not add dependencies, services, routes, custom seed input, map editor, local persistence, or non-standard geometry.
- Do not use `Math.random()` or hidden match randomness inside public board reconstruction.
- Do not let public seed generation consume the hidden deck/dice stream.
- Do not use retry-until-valid board generation.
- Preserve strict exact-object wire validation and projection privacy.
- Do not mutate a stored v1 room until a complete v2 candidate passes validation.
- Do not expose host identity after start; expose only caller-specific `canRestartMatch`.
- Keep production `src/` and `worker/` free of `createDemoGame` and test imports.
- Keep new Worker migration/restart tests out of the 1,911-line lifecycle hotspot where a focused file is possible.
- English remains the default; every new visible string has Simplified Chinese.
- Do not commit generated Playwright reports, Wrangler state, build output, or dependency artifacts.

## Constitution Check

| Principle | Plan response |
| --- | --- |
| Playable core before decoration | Tasks deliver valid map/setup/restart behavior before settings polish. |
| Pure game rules, thin UI | Seed parsing, generation, setup, and restart semantics live in domain/room modules; React only presents and dispatches. |
| High cohesion, low coupling | `mapSeed.ts`, `randomBoard.ts`, and `roomMigration.ts` each own one boundary; the existing command pipeline remains orchestration. |
| Traceable delivery | Every RM requirement maps to a task and named evidence; final gates and handoff are explicit. |
| Time-boxed scope control | No dependency, custom entry, new geometry, account, matchmaking, or persistence expansion is introduced. |

No constitution exception is required.

## Responsibility and File Map

### Pure seed and board domain

- `src/domain/mapSeed.ts` (new): canonical M0/M1 parser/formatter and frozen seeded `RandomSource`.
- `src/domain/board.ts`: retain released fixed-board compatibility data; expose stable geometry/coastal ordering needed by generation.
- `src/domain/randomBoard.ts` (new): bounded M0/M1 board reconstruction, exact multisets, red-token selection, port selection.
- `src/domain/types.ts`: require `GameState.mapSeed`.
- `test/domain/mapSeed.test.ts` (new): parser, formatter, stream vectors, invalid values.
- `test/domain/randomBoard.test.ts` (new): 1,000-seed invariants, golden layouts, M0 compatibility, determinism.
- `test/domain/boardGeometry.test.ts`, `test/domain/portGameplay.test.ts`, `test/domain/production.test.ts`: move fixed-content assumptions to seed-aware geometry/content selectors.

### Match creation and Local composition

- `src/domain/match/types.ts`: `MapRestartMode`, `MatchMapSelection`, `nextMapSeed`, restart command mode.
- `src/domain/match/createMatch.ts`: seed-aware empty setup factory and independent deck shuffle; delete prepared demo factory.
- `src/domain/match/applyMatchCommand.ts`: fresh/same-map restart through shared setup creation.
- `src/domain/setup.ts`: remove the production demo export and keep only compatibility setup exports still used by production.
- `src/app/localGameState.ts`: fresh four-seat setup on mount, seed-aware Local view/controller.
- `src/app/gameReducer.ts`: reset UI selections after either restart mode.
- `test/fixtures/createScenarioGame.ts` (new): test-only prepared state.
- Existing scenario-heavy tests listed in Task 4: import the test fixture instead of production demo code.

### Online projection and protocol

- `src/online/view.ts`: public `mapSeed`, private `canRestartMatch`, no fixed `boardLayout`.
- `src/online/projectRoomView.ts`: verify seed/board coherence and project caller restart capability.
- `src/online/onlineGameProjection.ts`: parse canonical seed, regenerate topology/content, validate references, return `boardData`.
- `src/online/protocol.ts`: schema version 2 and strict `room.restart` parsing.
- `src/online/useOnlineRoom.ts`: expect schema 2 through the existing incompatible/reconnect path.
- `test/online/protocol.test.ts`, `test/online/projectionPrivacy.test.ts`: strict v2, regeneration, mismatch rejection, privacy.

### Storage and authoritative restart

- `worker/room/roomTypes.ts`: persisted schema version 2 and confined legacy type support.
- `worker/room/roomMigration.ts` (new): exact v1 lobby/fixed-board conversion.
- `worker/room/roomStore.ts`: version-dispatch validation and atomic migration persistence.
- `worker/room/roomLifecycle.ts`: fresh M1 lobby start and host-only `restartRoom` for playing/finished.
- `worker/crypto.ts`: retry-stable M1 seed preparation separate from hidden random preparation.
- `worker/testing/e2eExecutionContext.ts`: deterministic separate map-seed source.
- `worker/room/commandPipeline.ts`: dispatch `room.restart` through existing admission/version/idempotency/preflight/broadcast path.
- `worker/room/RoomDurableObject.ts`: supply the updated execution context without changing room routing.
- `test/worker/roomMigration.test.ts` (new): v1/v2 read/write and no-partial-write cases.
- `test/worker/roomRestart.test.ts` (new): authorization, phases, reset, duplicate/stale/concurrent behavior.
- `test/worker/roomWebSocket.test.ts`: retry-stable context and broadcast integration regression only.

### Shared UI and documentation

- `src/ui/GameTable.tsx`: seed in shared view and restart intents.
- `src/ui/UtilityDialog.tsx`: selectable seed, copy status, two restart modes, inline confirmation.
- `src/ui/i18n.ts`: English and Simplified-Chinese seed/restart/copy text.
- `src/styles/app.css`: contained responsive seed and confirmation styling using existing tokens.
- `src/online/onlineGameAdapter.ts`: generated board data, host capability, finished-room restart dispatch.
- `test/domain/gameTableView.test.ts`, `test/domain/localization.test.ts`, `test/domain/productPolish.test.ts`, `test/online/onlineGameUi.test.ts`: shared/local/online UI behavior and accessibility.
- `test/e2e/frontend-recovery.spec.ts`: Local direct setup, seed copy failure, fresh/same-map restart.
- `test/e2e/online-multiplayer.spec.ts`: three-context host restart convergence and non-host denial.
- `README.md`, `README.zh-CN.md`, `docs/roadmap.md`, `specs/003-seeded-random-maps/quickstart.md`: public behavior and verification.
- `specs/003-seeded-random-maps/verification.md` and `handoff.md` (created only after implementation): final evidence and delivery state.

## Key Data and Control Flows

### Fresh setup

```text
Local mount or online room.start
  -> createSetupMatch(seats, { kind: "fresh" }, context)
     -> context.nextMapSeed()                    public entropy channel
     -> createBoardDataForSeed(seed)             pure deterministic board
     -> shuffleDevelopmentDeck(context.random)   hidden entropy channel
     -> empty setup MatchState with game.mapSeed
```

### Same-map restart

```text
game.restart / room.restart(mode = sameMap)
  -> START_NEW_GAME(mode = sameMap)
     -> retain roster + current game.mapSeed only
     -> recreate board from seed
     -> independently reshuffle hidden deck
     -> reset game/guild/pending state to setup
```

### Online restart authority

```text
authenticated socket message
  -> exact protocol-v2 parse
  -> latest seat + duplicate/rate/version checks
  -> restartRoom requires latest hostSeatId
  -> shared transition
  -> clear sealed auction
  -> validate room + preflight every caller projection
  -> persist version + 1
  -> broadcast regenerated setup snapshots
```

### Storage migration

```text
read raw room
  -> schema 2: strict v2 validation
  -> schema 1 lobby: validate, construct v2 lobby
  -> schema 1 playing/finished:
       validate v1
       compare complete board/edges/ports with released fixture
       add M0-STANDARD only on exact match
  -> validate complete v2 candidate
  -> one storage put
```

## Verification Strategy

### Focused automated evidence

- Seed parsing/stream vectors and strict rejection.
- 1,000 M1 seeds for component counts, topology, red adjacency, coastal/non-adjacent ports, stable IDs, and termination.
- Golden M1/M0 layouts in main and Worker-compatible runtime.
- Match creation/restart retention-reset matrix and hidden-random isolation.
- Local initial setup with no scenario residue.
- Protocol exact keys, schema mismatch, no arbitrary seed, public seed and private capability.
- Projection rejects seed/board mismatch and retains opponent privacy.
- v1 lobby/fixed-room migration, corrupt board rejection, unsupported seed rejection, and no write on failure.
- Host/non-host, setup/playing/decision/auction/game-over restart, duplicate/stale/concurrent commands, retry stability, persistence, and broadcast.
- Settings copy success/failure, selectable text, bilingual strings, confirmation, and non-host visibility.

### Browser evidence

- Local entry immediately shows empty setup and one seed.
- Local same-map restart preserves public layout; fresh restart changes seed/layout.
- Three isolated Online contexts show the same seed.
- Only host sees enabled restart controls.
- Same-map and fresh restart each converge all three contexts to the same new setup/version.
- Non-host direct protocol attempt is denied without state change.
- Clipboard denial leaves the seed selectable and emits localized status.

### Final release gates

Run individually and record actual counts/output in `verification.md`:

```text
pnpm test
pnpm test:worker
pnpm test:e2e
pnpm build
pnpm build:worker
pnpm smoke:ui
pnpm smoke:worker
pnpm exec wrangler deploy --dry-run --config wrangler.jsonc
git diff --check
```

Also run focused documentation/localization tests and repository searches from Task 9.

## Review Checkpoints

1. Seed codec and generator compatibility before match integration.
2. Shared match and Local behavior before any online schema change.
3. Protocol/projection privacy before storage migration.
4. Migration no-partial-write review before restart authority.
5. Authoritative concurrency review before UI controls.
6. UI/accessibility review before browser convergence and final gates.

## Requirement Coverage Summary

| Requirements | Primary tasks |
| --- | --- |
| RM-001–RM-010 | T001–T002 |
| RM-011–RM-017 | T003–T004 |
| RM-018–RM-023 | T005, T008 |
| RM-024–RM-031 | T005–T007 |
| RM-032–RM-035 | T008–T009 |

The detailed one-to-one coverage matrix is in `tasks.md`.
