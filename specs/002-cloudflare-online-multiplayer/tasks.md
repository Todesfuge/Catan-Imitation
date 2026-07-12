# Tasks: Cloudflare Online Multiplayer

Feature: `002-cloudflare-online-multiplayer`
Source specification: `spec.md`
Technical plan: `plan.md`
Status: T022 and T023 complete; merged into local `main` with post-merge verification

## Execution Rules

- Use red-green-refactor for every task that changes production behavior.
- Run the focused command listed under the task before and after implementation; record the initial expected failure and final pass.
- Do not add networking, projection, persistence, or protocol logic to `src/app/gameReducer.ts`.
- Do not send raw `MatchState`, `PersistedRoom`, opponent resources/cards, or unresolved/losing bid values to React.
- Do not start a later phase until the preceding phase exit gate passes.
- Check a task only after its focused verification and relevant regression slice both pass.
- Create one reviewable commit per task unless two adjacent documentation-only tasks are explicitly combined.

## Phase A: Shared Correctness Boundary

### Task 1 (T001) — Correct no-token and all-pass Commerce Guild auctions

Requirements: OM-038 through OM-043

Files:

- Create: `test/domain/auctionNoBid.test.ts`
- Modify: `src/domain/expansion/commerceGuild.ts`
- Modify: `src/app/gameReducer.ts`
- Modify: `src/ui/i18n.ts`

Steps:

- [x] Write failing tests proving `openGuildAuction` completes immediately when all player token counts are zero, an all-zero bid map advances exactly one eligible round without reward/random calls, and round three completes gathering.
- [x] Run `pnpm vitest run test/domain/auctionNoBid.test.ts`; expect failures showing the current positive-bid deadlock.
- [x] Introduce an explicit no-bid auction result/transition in the Commerce Guild owner and update the local command adapter/log keys without adding a UI-only escape path.
- [x] Replace the existing test expectation that all-zero bids throw with the new state-transition expectation.
- [x] Run `pnpm vitest run test/domain/auctionNoBid.test.ts test/domain/commerceGuild.test.ts test/domain/commerceGuildIntegrity.test.ts test/domain/commerceGuildPolish.test.ts`; expect all pass.
- [x] Commit with `fix: allow Commerce Guild auctions to end without bids`.

### Task 2 (T002) — Define synchronized match state and execution context

Requirements: OM-022, OM-023, OM-030

Files:

- Create: `src/domain/match/types.ts`
- Create: `src/domain/match/random.ts`
- Create: `test/domain/matchTransition.test.ts`
- Modify: `src/app/gameReducer.ts`

Steps:

- [x] Write failing type/runtime tests for `MatchState`, `MatchExecutionContext`, deterministic log IDs, deterministic dice values, and exclusion of `selectedDiceTotal`, `selectedPlayerId`, and `notice` from synchronized state.
- [x] Run `pnpm vitest run test/domain/matchTransition.test.ts`; expect module-not-found/type failures.
- [x] Add the match types and `RandomSource.nextInt(maxExclusive)` with cryptographic Worker implementation deferred to T009/T013 and a deterministic test implementation.
- [x] Move `DiceRoll` and synchronized fields to `MatchState`; keep a temporary local adapter shape in `gameReducer.ts` so existing callers compile.
- [x] Run `pnpm vitest run test/domain/matchTransition.test.ts test/domain/gameplay.test.ts`; expect all pass.
- [x] Commit with `refactor: define shared match execution state`.

### Task 3 (T003) — Extract the authoritative match command dispatcher

Requirements: OM-022 through OM-030

Files:

- Create: `src/domain/match/applyMatchCommand.ts`
- Create: `src/app/localGameState.ts`
- Modify: `src/domain/match/types.ts`
- Modify: `src/app/gameReducer.ts`
- Modify: `test/domain/matchTransition.test.ts`
- Modify: tests that import `unsafeExecuteGameCommandForTests`

Steps:

- [x] Extend failing parity tests to cover setup, roll, seven/robber, build, development cards, maritime trade, player trade, turn end, guild actions, winner state, and recoverable rule errors through `applyMatchCommand`.
- [x] Run `pnpm vitest run test/domain/matchTransition.test.ts`; expect missing-dispatcher failures.
- [x] Move the gameplay switch, winner/log orchestration, and injected randomness into `applyMatchCommand`; remove UI commands and caught-notice behavior from the shared command union.
- [x] Move local composition into `localGameState.ts` and convert `gameReducer` into a local adapter that maps synchronized commands to the shared dispatcher and handles only UI selections and recoverable notices.
- [x] Delete `unsafeExecuteGameCommandForTests` after its callers migrate to the shared public transition.
- [x] Run `pnpm test`; expect all existing and new domain tests pass.
- [x] Confirm `rg -n "Math\.random|case \"BUILD_|case \"ROLL_DICE" src/app/gameReducer.ts` finds no rule/random ownership.
- [x] Commit with `refactor: share authoritative match command execution`.

### Task 4 (T004) — Support deterministic three/four-player match creation

Requirements: OM-003 through OM-007, OM-024

Files:

- Create: `src/domain/match/createMatch.ts`
- Modify: `src/domain/setup.ts`
- Modify: `src/app/localGameState.ts`
- Modify: `test/domain/matchTransition.test.ts`
- Modify: `test/domain/setupInteraction.test.ts`

Steps:

- [x] Write failing tests for three-player and four-player snake setup orders, unique stable player IDs/colors, caller nicknames, injected deterministic development-deck shuffling, and rejection of other counts.
- [x] Run `pnpm vitest run test/domain/matchTransition.test.ts test/domain/setupInteraction.test.ts`; expect failures for fixed four-player setup.
- [x] Add `createSetupMatch(seats, context)` and make the current local defaults call it; keep board/ports fixed and shuffle the development deck through the injected random source.
- [x] Run the focused tests and `pnpm test`; expect all pass.
- [x] Commit with `feat: create matches from three or four seats`.

Phase A exit gate:

- [x] Run `pnpm test` and `pnpm build`; record pass evidence.
- [x] Review `gameReducer.ts` responsibility: it must have lost business execution and gained no network behavior.

## Phase B: Privacy-safe Contract

### Task 5 (T005) — Define and validate the online protocol

Requirements: OM-012, OM-025 through OM-029, OM-044, OM-052 through OM-059

Files:

- Create: `src/online/protocol.ts`
- Create: `test/online/protocol.test.ts`

Steps:

- [x] Write failing tests for every HTTP/WebSocket discriminant in `contracts/protocol.md`, 16 KiB limits, UUID command IDs, non-negative whole bids, absent actor identity, unknown message rejection, and every stable error code.
- [x] Run `pnpm vitest run test/online/protocol.test.ts`; expect module-not-found failures.
- [x] Implement narrow parsers and TypeScript unions without adding a runtime schema dependency.
- [x] Ensure parsed online gameplay commands cannot contain `playerId`, dice values, random functions, full bid maps, or unknown fields.
- [x] Run `pnpm vitest run test/online/protocol.test.ts`; expect all pass.
- [x] Commit with `feat: define bounded online room protocol`.

### Task 6 (T006) — Define public/private room projections

Requirements: OM-031 through OM-037, OM-044, OM-048 through OM-050

Files:

- Create: `src/online/view.ts`
- Create: `src/online/projectRoomView.ts`
- Create: `test/online/projectionPrivacy.test.ts`

Steps:

- [x] Write adversarial failing tests that JSON-serialize each opponent projection and search for resource maps, development-card kinds/IDs, hidden victory points, raw deck contents, unresolved bids, losing bids, token hashes, tickets, and private errors.
- [x] Add failing positive tests for own resources/cards/bid and public counts/board/bank/trades/logs.
- [x] Run `pnpm vitest run test/online/projectionPrivacy.test.ts`; expect missing-projection failures.
- [x] Implement newly allocated public/private view types and privacy-safe structured log projection; never cast a raw `GameState` to a view.
- [x] Redact blind-box development-card kinds from every non-recipient projection.
- [x] Run the focused suite; expect all privacy assertions pass.
- [x] Commit with `feat: project private room views per seat`.

### Task 7 (T007) — Project caller-specific allowed actions

Requirements: OM-021, OM-033, OM-034, OM-046, OM-048 through OM-050

Files:

- Create: `src/online/allowedActions.ts`
- Modify: `src/online/view.ts`
- Modify: `src/online/projectRoomView.ts`
- Modify: `test/online/projectionPrivacy.test.ts`
- Modify: `src/app/actionAvailability.ts`

Steps:

- [x] Write failing tests for active/non-active seats, offline required decisions, setup targets, robber/seven choices, development effects, public trade, Commerce Guild redemption, and sealed-bid availability using only the authenticated seat's view.
- [x] Run `pnpm vitest run test/online/projectionPrivacy.test.ts`; expect missing allowed-action failures.
- [x] Extract reusable pure availability facts from `actionAvailability.ts` where they do not require React `AppState`; build an online allowed-action projection without copying rule legality.
- [x] Ensure disabled reasons use stable codes/parameters rather than English-only rule strings.
- [x] Run `pnpm vitest run test/online/projectionPrivacy.test.ts test/domain/actionAvailability.test.ts`; expect all pass.
- [x] Commit with `feat: expose authoritative online action availability`.

Phase B exit gate:

- [x] Run `pnpm vitest run test/online test/domain/actionAvailability.test.ts` and serialize representative views for all four seats.
- [x] Perform a focused privacy review; no raw authoritative type may cross the projection boundary.

## Phase C: Cloudflare Room Runtime

### Task 8 (T008) — Add the combined Worker build and runtime test harness

Requirements: OM-060 through OM-063

Files:

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `wrangler.jsonc`
- Create: `tsconfig.worker.json`
- Create: `worker-configuration.d.ts` through the checked-in `wrangler types` output
- Create: `worker/env.ts`
- Create: `worker/index.ts`
- Create: `vitest.config.ts`
- Create: `vitest.worker.config.ts`
- Modify: `tsconfig.app.json`
- Create: `test/worker/workerSmoke.test.ts`

Steps:

- [x] Add a failing Workers-runtime smoke test expecting `/api/health` JSON and SPA asset fallback from one Worker.
- [x] Add pinned `wrangler@4.110.0` and `@cloudflare/vitest-pool-workers@0.8.70`, then add `test:worker`, `build:worker`, `dev:worker`, and `smoke:worker` scripts.
- [x] Configure the `ROOMS` Durable Object binding, `v1` `new_sqlite_classes` migration, `dist` assets, SPA fallback, and `/api/*` worker-first routing.
- [x] Generate binding/runtime types with `pnpm exec wrangler types worker-configuration.d.ts`, exclude `test/worker` from `tsconfig.app.json`, and include Worker code/tests in their own TypeScript project.
- [x] Implement only health/static routing needed by the smoke test; leave room behavior to later tasks.
- [x] Run `pnpm test:worker`, `pnpm build:worker`, and `pnpm exec wrangler deploy --dry-run`; expect all pass.
- [x] Commit with `build: add Cloudflare Worker runtime`.

### Task 9 (T009) — Implement credentials, tickets, bounded HTTP, and origin checks

Requirements: OM-008 through OM-014, OM-054 through OM-058

Files:

- Create: `worker/crypto.ts`
- Create: `worker/http.ts`
- Create: `test/worker/security.test.ts`
- Modify: `worker/index.ts`

Steps:

- [x] Write failing Workers-runtime tests for 32-byte seat tokens, SHA-256 hashes, single-use 30-second tickets, bearer parsing, 16 KiB bodies, same-origin/loopback policy, safe JSON errors, and secret-free logs/responses.
- [x] Run `pnpm test:worker -- test/worker/security.test.ts`; expect missing-helper failures.
- [x] Implement cryptographic helpers with Workers `crypto`, constant-time hash comparison where practical, and bounded HTTP/origin helpers.
- [x] Run the focused Worker suite; expect all pass.
- [x] Commit with `feat: secure anonymous room credentials`.

### Task 10 (T010) — Implement the persisted room model and lobby lifecycle

Requirements: OM-003 through OM-007, OM-015, OM-016, OM-020, OM-052, OM-059

Files:

- Create: `worker/room/roomTypes.ts`
- Create: `worker/room/roomStore.ts`
- Create: `worker/room/roomLifecycle.ts`
- Create: `test/worker/roomLifecycle.test.ts`

Steps:

- [x] Write failing tests for room-code alphabet/normalization, collision-safe create, unique normalized nicknames, 1–20 character validation, join order, 4-seat cap, ready toggles, host-only start, three/four-seat start, host transfer, voluntary lobby leave, post-start lock, schema rejection, and version increments.
- [x] Run the focused Worker suite; expect missing-room failures.
- [x] Implement pure room lifecycle transitions and a store that validates schema version, persists one room record, removes expired tickets, and schedules `expiresAt`.
- [x] Ensure match start calls `createSetupMatch` with the locked seat order and stores token hashes only.
- [x] Run `pnpm test:worker -- test/worker/roomLifecycle.test.ts`; expect all pass.
- [x] Commit with `feat: persist online room lobbies`.

### Task 11 (T011) — Add HTTP room routes and one-time WebSocket upgrade

Requirements: OM-003 through OM-014, OM-017 through OM-020

Files:

- Create: `worker/room/RoomDurableObject.ts`
- Modify: `worker/index.ts`
- Modify: `worker/room/roomStore.ts`
- Modify: `test/worker/roomLifecycle.test.ts`

Steps:

- [x] Add failing integration tests for health/create/join/delete/ticket endpoints, eight-attempt room-code collision retry, status/error mappings, ticket consumption, invalid/expired tickets, WebSocket attachments, multi-tab presence, and snapshot on connect.
- [x] Run the focused Worker suite; expect route/upgrade failures.
- [x] Route normalized room codes with `ROOMS.getByName`, implement the thin Durable Object fetch adapter, call `ctx.acceptWebSocket`, and serialize only `seatId`, `connectionId`, and time.
- [x] Broadcast presence from `ctx.getWebSockets()` without persisting it or incrementing room version.
- [x] Run the focused suite; expect all pass.
- [x] Commit with `feat: connect authenticated room sockets`.

### Task 12 (T012) — Implement expiry alarms and recovery in a fresh Durable Object instance

Requirements: OM-016 through OM-021, OM-042, OM-052, OM-059

Files:

- Modify: `worker/room/roomStore.ts`
- Modify: `worker/room/RoomDurableObject.ts`
- Modify: `test/worker/roomLifecycle.test.ts`

Steps:

- [x] Add tests proving lobby/match/tickets/pending bids recover in a fresh Durable Object instance over the same persisted storage and proving through the production alarm handler that connected rooms defer expiry, disconnected rooms delete at 24 hours, and expired rooms return `ROOM_EXPIRED`; this test environment exercised neither a Workers eviction helper nor a Cloudflare hibernation callback.
- [x] Run the focused Worker suite; expect recovery/alarm failures.
- [x] Implement constructor-safe loading, alarm scheduling/deletion, open-socket deferral, and terminal expiry broadcasts without timer-based in-memory state.
- [x] Run the focused suite; expect all pass.
- [x] Commit with `feat: recover and expire durable game rooms`.

### Task 13 (T013) — Implement the authoritative command pipeline

Requirements: OM-022 through OM-030, OM-044 through OM-047, OM-052 through OM-058

Files:

- Create: `worker/room/commandPipeline.ts`
- Create: `test/worker/roomWebSocket.test.ts`
- Modify: `worker/crypto.ts`
- Modify: `worker/room/RoomDurableObject.ts`
- Modify: `worker/room/roomTypes.ts`

Steps:

- [x] Write failing socket tests for protocol validation, actor derivation, server dice/random ownership, accepted version increments, persist-before-broadcast, per-seat projections, duplicate command IDs, 64-ID eviction, stale-version snapshot, rule-error isolation, 10-per-2-second throttle, and no partial write on internal failure.
- [x] Run `pnpm test:worker -- test/worker/roomWebSocket.test.ts`; expect missing-pipeline failures.
- [x] Implement the ordered authenticate/parse/deduplicate/version/execute/persist/project/broadcast pipeline and Workers cryptographic `RandomSource`.
- [x] Map online actorless commands to trusted shared commands using the seat's `playerId`.
- [x] Run the focused Worker suite plus `pnpm test`; expect all pass.
- [x] Commit with `feat: execute authoritative room commands`.

### Task 14 (T014) — Implement persisted sealed bidding

Requirements: OM-035 through OM-043, OM-050, OM-052, OM-053

Files:

- Modify: `worker/room/commandPipeline.ts`
- Modify: `worker/room/roomTypes.ts`
- Modify: `src/online/projectRoomView.ts`
- Modify: `test/worker/roomWebSocket.test.ts`
- Modify: `test/online/projectionPrivacy.test.ts`

Steps:

- [x] Write failing tests for per-seat zero/positive bids, replacement before completion, token affordability, submitted-seat status, own-bid visibility, hidden opponent/losing values, persistence across eviction, all-zero round advancement, positive resolution, bid clearing, and development-card outcome redaction.
- [x] Run the two focused suites; expect sealed-bid failures.
- [x] Implement bid persistence and resolve only when every locked seat has submitted; call the shared corrected auction transition once and clear bid state before projection.
- [x] Run `pnpm test:worker -- test/worker/roomWebSocket.test.ts` and `pnpm vitest run test/online/projectionPrivacy.test.ts`; expect all pass.
- [x] Commit with `feat: add private Commerce Guild bidding`.

Phase C exit gate:

- [x] Run `pnpm test`, `pnpm test:worker`, `pnpm build:worker`, and `pnpm exec wrangler deploy --dry-run`.
- [x] Review eviction evidence, secret-free logs, raw-state imports, and all HTTP/WebSocket error paths.

## Phase D: Online React Experience

### Task 15 (T015) — Extract a shared game-table view boundary

Requirements: OM-001, OM-002, OM-024, OM-031, OM-046, OM-048, OM-051

Files:

- Create: `src/ui/GameTable.tsx`
- Modify: `src/app/localGameState.ts`
- Modify: `src/App.tsx`
- Modify: `src/ui/ActionDock.tsx`
- Modify: `src/ui/BoardActionTargets.tsx`
- Modify: `src/ui/CommercePanel.tsx`
- Modify: `src/ui/DevelopmentCardPanel.tsx`
- Modify: `src/ui/PlayerTradePanel.tsx`
- Modify: `src/ui/TradeHubPanel.tsx`
- Modify: `src/ui/TurnFlowPanel.tsx`
- Create: `test/domain/gameTableView.test.ts`

Steps:

- [x] Write failing component/source-contract tests proving the table consumes an explicit view plus dispatch interface and does not require raw online `PersistedRoom` or Worker imports.
- [x] Run the focused test; expect the shared table boundary to be absent.
- [x] Extract the current rendered table without changing local behavior; provide a local adapter that supplies full local view and shared match/UI dispatch.
- [x] Keep strategic legality outside presentational components and preserve all accessibility labels/interactions.
- [x] Run `pnpm test` and `pnpm test:e2e`; expect existing Local Game behavior pass.
- [x] Commit with `refactor: share the game table presentation`.

### Task 16 (T016) — Add online session persistence and reconnect transport

Requirements: OM-009, OM-012 through OM-014, OM-019 through OM-021, OM-044 through OM-047

Files:

- Create: `src/online/sessionStorage.ts`
- Create: `src/online/onlineReducer.ts`
- Create: `src/online/useOnlineRoom.ts`
- Create: `test/online/onlineClient.test.ts`

Steps:

- [x] Write failing tests for origin-local token keys, invalid storage fallback, create/join/ticket calls, complete snapshot replacement, duplicate/out-of-order server messages, 1/2/4/8/15-second capped reconnect schedule, disabled offline dispatch, expired/incompatible terminal states, and multi-tab token reuse.
- [x] Run `pnpm vitest run test/online/onlineClient.test.ts`; expect missing-client failures.
- [x] Implement the session store, pure online reducer, and transport hook with injectable fetch/WebSocket/scheduler test dependencies.
- [x] Ensure the hook never applies game commands locally or stores the seat token in URLs/logs/state snapshots.
- [x] Run the focused test; expect all pass.
- [x] Commit with `feat: reconnect anonymous online seats`.

### Task 17 (T017) — Add Local/Online entry and room lobby

Requirements: OM-001 through OM-007, OM-045, OM-049, OM-051

Files:

- Create: `src/app/AppRouter.tsx`
- Create: `src/online/OnlineLobby.tsx`
- Modify: `src/App.tsx`
- Modify: `src/main.tsx`
- Modify: `src/ui/i18n.ts`
- Modify: `src/styles/app.css`
- Create: `test/online/onlineLobbyUi.test.ts`

Steps:

- [x] Write failing UI tests for Local/Online selection, create/join validation, room code display/copy, seat order, ready status, host start, host-only controls, online/offline badges, leave lobby, English default, and Chinese translations.
- [x] Run `pnpm vitest run test/online/onlineLobbyUi.test.ts`; expect missing UI failures.
- [x] Implement the dependency-free mode router and lobby using `useOnlineRoom`; keep Local Game available without any network call.
- [x] Add responsive lobby styling and at least 44-pixel interactive targets.
- [x] Run the focused test and `pnpm test`; expect all pass.
- [x] Commit with `feat: add private online room lobby`.

### Task 18 (T018) — Adapt the full table to caller-specific online views

Requirements: OM-021, OM-031 through OM-037, OM-045 through OM-051

Files:

- Create: `src/online/OnlineGame.tsx`
- Modify: `src/ui/GameTable.tsx`
- Modify: action/trade/development/commerce components touched in T015
- Modify: `src/ui/i18n.ts`
- Modify: `src/styles/app.css`
- Create: `test/online/onlineGameUi.test.ts`

Steps:

- [x] Write failing UI tests for own private hand, opponent counts, hidden VP/cards, server allowed actions, disabled offline controls, active/waiting player labels, robber/seven choices, development effects, maritime/public trades, Commerce Guild redemption, own sealed bid, others' submitted status, sanitized blind-box result, and game over.
- [x] Run `pnpm vitest run test/online/onlineGameUi.test.ts`; expect missing online adapter failures.
- [x] Implement `OnlineGame` as a projection/command adapter; do not synthesize fake opponent resources or run authoritative reducers in the browser.
- [x] Add bilingual connection, wait, room, protocol, privacy, all-pass, and no-token auction copy.
- [x] Verify 1280, 768, and 390 width containment in focused browser tests.
- [x] Run the focused UI suite, `pnpm test`, and current E2E suite; expect all pass.
- [x] Commit with `feat: play full matches from private online seats`.

Phase D exit gate:

- [x] Run `pnpm test`, `pnpm test:worker`, and `pnpm test:e2e`.
- [x] Manually compare Local Game before/after and inspect all four seat projections at desktop and mobile widths.

## Phase E: Browser Convergence and Deployment

### Task 19 (T019) — Add three-context online browser coverage

Requirements: all user stories; OM-001 through OM-051

Files:

- Create: `test/e2e/online-multiplayer.spec.ts`
- Modify: `playwright.config.ts`
- Modify: `package.json`
- Create: `scripts/smoke-worker.mjs`

Steps:

- [x] Add a failing Playwright suite that runs against `pnpm dev:worker`, opens three isolated contexts, creates/joins/readies/starts, verifies per-seat privacy, completes setup, rolls/builds/trades/ends turn, exercises seven/robber and Commerce Guild sealed/no-bid paths, disconnects one context, and reconnects it from stored token.
- [x] Run the online spec; expect failures until all routes/UI paths are wired.
- [x] Add only deterministic test hooks at the Worker execution-context boundary; production clients must not be able to choose randomness.
- [x] Run `pnpm test:e2e`; expect existing local and new online suites pass at desktop and mobile widths.
- [x] Commit with `test: cover online multiplayer in real browsers`.

### Task 20 (T020) — Add production security, observability, and combined smoke gates

Requirements: OM-054 through OM-063

Files:

- Modify: `worker/index.ts`
- Modify: `worker/http.ts`
- Modify: `worker/room/commandPipeline.ts`
- Modify: `wrangler.jsonc`
- Modify: `package.json`
- Create: `test/worker/securityHeaders.test.ts`
- Modify: `scripts/smoke-worker.mjs`

Steps:

- [x] Write failing tests for strict CSP, same-origin connect policy, safe cache headers, safe structured logs, generic internal errors, rate-limit responses, SPA fallback, health, room creation, and WebSocket upgrade in combined preview.
- [x] Run focused Worker/security tests; expect missing-header/log/smoke failures.
- [x] Implement security headers and safe structured log records without adding third-party telemetry.
- [x] Implement `smoke:worker` against Wrangler local dev and make it fail on an empty React root or non-upgrading room socket.
- [x] Run `pnpm test:worker`, `pnpm build:worker`, `pnpm smoke:worker`, and `pnpm exec wrangler deploy --dry-run`; expect all pass.
- [x] Commit with `chore: harden Cloudflare multiplayer delivery`.

### Task 21 (T021) — Verify preview, document production, and retire duplicate hosting

Requirements: OM-064, OM-065

Files:

- Modify after preview acceptance: `README.md`
- Modify after preview acceptance: `README.zh-CN.md`
- Modify after production acceptance: `.github/workflows/pages.yml`
- Modify: `specs/002-cloudflare-online-multiplayer/quickstart.md`
- Modify: `specs/001-catan-imitation/handoff.md`
- Create: `.codex/worklog/002-cloudflare-online-multiplayer/updates/<timestamp>-cloudflare-release.md`
- Create or modify: `.codex/worklog/002-cloudflare-online-multiplayer/ledger.md`
- Create or modify: `.codex/worklog/002-cloudflare-online-multiplayer/handoff-source.md`

Steps:

- [x] Run the full local release gate before uploading a preview.
- [x] Upload a Cloudflare preview and manually verify static assets, API, WebSocket, three seats, refresh reconnect, stored-state recovery, privacy, Local Game, English/Chinese, and responsive widths.
- [x] Record the preview URL and evidence in the update packet without storing credentials.
- [x] Configure Workers Builds for GitHub `main`, deploy production, and repeat the production smoke/privacy checks.
- [x] Update both READMEs and quickstart with the verified production URL and anonymous-seat limitations.
- [x] Disable/remove GitHub Pages publishing only after production passes; retain the workflow change in the same reviewed release commit.
- [x] Run link/content tests, `git diff --check`, and the full release gate again.
- [x] Commit with `docs: publish Cloudflare online multiplayer`.

### Task 22 (T022) — Converge, review, and finish the feature

Requirements: all OM-001 through OM-065

Files:

- Modify: `specs/002-cloudflare-online-multiplayer/tasks.md`
- Modify: `specs/002-cloudflare-online-multiplayer/checklists/requirements.md`
- Modify: `specs/002-cloudflare-online-multiplayer/spec.md`
- Modify: feature worklog and external handoff artifacts

Steps:

- [x] Map every OM requirement to passing automated or manual evidence and append any missing convergence tasks without renumbering prior tasks.
- [x] Run independent implementation review for domain boundaries, privacy, Durable Object correctness, client recovery, accessibility, and avoidable complexity.
- [x] Resolve all critical/high findings and rerun affected focused tests.
- [x] Run the final gate: `pnpm test`, `pnpm test:worker`, `pnpm test:e2e`, `pnpm build`, `pnpm build:worker`, `pnpm smoke:worker`, `pnpm exec wrangler deploy --dry-run`, and `git diff --check`.
- [x] Update task/checklist/spec status only after fresh evidence exists.
- [x] Prepare the external handoff with production URL, architecture, verification, known anonymous-seat limitation, rollback, and remaining optional enhancements.
- [x] Use the finishing-branch workflow to offer merge/push/PR options; the user selected a local merge to `main`.

### Task 23 (T023) — Restore refreshed seats and bound connection tickets

Requirements: OM-009, OM-012, OM-014, OM-019, OM-047, OM-054, OM-056

Files:

- Modify: `src/online/sessionStorage.ts`, `src/app/AppRouter.tsx`, `src/online/OnlineLobby.tsx`
- Modify: `worker/room/roomStore.ts`, `worker/room/RoomDurableObject.ts`, `worker/crypto.ts`
- Modify: focused client, lobby, Worker, and production-UI reload tests
- Modify: T022 verification, handoff, worklog, and progress records

Steps:

- [x] Reproduce actual page-refresh session loss and unbounded ticket issuance with focused failing tests.
- [x] Persist only an active normalized room-code pointer and reconstruct the retained seat through the existing credential/transport.
- [x] Enforce 8 outstanding tickets per seat, 32 per room, and 10 authenticated issuance admissions per credential in a rolling two-second window.
- [x] Delete the unused direct crypto random-source factory.
- [x] Run focused client/lobby/Worker tests and the real three-browser `page.reload()` scenario.
- [x] Remediate saturated-store admission accounting and schema-v1 expired-ticket read normalization from independent review.
- [x] Obtain independent review and leave the T022 terminal final gate to the controller.

## Requirement Coverage Map

| Requirements | Primary tasks |
|---|---|
| OM-001–OM-002 | T015, T017, T018, T019 |
| OM-003–OM-007 | T004, T010, T011, T017 |
| OM-008–OM-014 | T009, T011, T016, T023 |
| OM-015–OM-021 | T010, T011, T012, T016, T018, T023 |
| OM-022–OM-024 | T002, T003, T004, T015 |
| OM-025–OM-030 | T002, T003, T005, T013 |
| OM-031–OM-037 | T006, T007, T014, T018 |
| OM-038–OM-043 | T001, T014, T018, T019 |
| OM-044–OM-051 | T005–T007, T016–T019, T023 |
| OM-052–OM-059 | T005, T008–T014, T020, T023 |
| OM-060–OM-063 | T008, T020, T021 |
| OM-064–OM-065 | T021, T022 |

All 65 requirements have at least one implementation owner and one verification path. The minimum playable online slice is T001 through T018; final review convergence now includes T023, while T022 retains the independent-review/final-gate/finishing ownership.
