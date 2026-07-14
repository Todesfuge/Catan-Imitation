# Tasks: Gathering Pacing, Setup Grants, and Resource Iconography

Date: 2026-07-14
Branch: `codex/gathering-cooldowns-icons`
Plan: `specs/004-gathering-pacing-resource-icons/plan.md`

Execution rule: complete tasks in order. For every production change, observe the focused test fail for the intended reason before implementation, then record focused and broader GREEN evidence before checking the task complete.

## Task 1 — T001: Authoritative table cooldown and gathering eligibility

Requirements: GP-001–GP-014, GP-044, GP-046
Review boundary: pure Commerce Guild cooldown/eligibility and shared Local match integration; no online schema migration or resource icon work.

Files:

- Create `test/domain/gatheringCooldown.test.ts`.
- Modify `src/domain/expansion/commerceGuild.ts`.
- Modify `src/domain/match/types.ts`.
- Modify `src/domain/match/createMatch.ts`.
- Modify `src/domain/match/applyMatchCommand.ts`.
- Modify `src/domain/types.ts`.
- Modify `src/app/actionAvailability.ts`.
- Modify `src/app/localGameState.ts`.
- Modify `src/ui/GameTable.tsx` only for the shared cooldown view field.
- Modify `src/ui/i18n.ts` for cooldown/reason text and obsolete automatic-start text removal.
- Modify `test/domain/actionAvailability.test.ts`.
- Modify `test/domain/matchTransition.test.ts`.
- Modify `test/domain/commerceGuild.test.ts`.
- Modify `test/domain/commerceGuildIntegrity.test.ts`.
- Modify `test/domain/commerceGuildPolish.test.ts`.
- Modify `test/domain/auctionNoBid.test.ts` where guild construction changes.
- Modify `test/fixtures/createScenarioGame.ts` where guild construction changes.

Interfaces:

- Produces `GatheringCooldownWindow { availableAtTurn, displayDuration }`.
- Produces `createInitialGatheringCooldown(currentTurn, playerCount)`.
- Produces `createPostGatheringCooldown(currentTurn, playerCount)`.
- Produces `getGatheringCooldownRemaining(window, currentTurn)`.
- Produces one shared gathering-start blocker used by domain transition and action availability.
- Changes domain command to `{ type: "START_GATHERING"; playerId: PlayerId }`.
- Adds `GameTableView.guild.gathering.cooldownRemaining` for later UI tasks.

Steps:

- [x] Add deterministic tests for three-player initial `6` and four-player initial `8`, proving fresh-map and same-map restart both reset the baseline and setup settlement/road transitions leave the value unchanged.
- [x] Add post-start vectors for `n = 3` and `n = 4`: start turn shows `n`, initiator end turn still shows `n`, each subsequent accepted end turn decrements once, and the `n`th subsequent turn reaches zero.
- [x] Add blocker tests for non-playing state, unresolved turn decision/roll, non-current player, pending player trade, non-idle gathering, and nonzero table cooldown; include overlapping blockers to prove the approved highest-priority reason and assert every rejected command leaves the input state structurally unchanged.
- [x] Add a success test proving the current player in a clean action phase starts redemption, replaces the prior cooldown window, and writes one start log entry.
- [x] Add a twenty-eight-turn four-player regression crossing the old six-round boundary and proving no automatic gathering starts or automatic-start log appears.
- [x] Add a complete-phase test proving the phase stays `complete` until an accepted `END_TURN`, then becomes `idle` without clearing the cooldown or last auction result.
- [x] Run `pnpm vitest run test/domain/gatheringCooldown.test.ts test/domain/actionAvailability.test.ts test/domain/matchTransition.test.ts`; expect RED on missing cooldown types/helpers, missing actor, unrestricted start, and automatic trigger behavior.
- [x] Add the window type and pure initial/post/remaining helpers in `commerceGuild.ts`; validate player count/current turn as finite safe integers and keep one table window only.
- [x] Change `createCommerceGuild` to receive current turn and player count explicitly, initialize `2n`, and update all listed constructors/fixtures without adding a legacy overload.
- [x] Add the shared blocker with stable priority and make `startGuildGathering` validate it before entering redemption and assigning the post-gathering `n` window.
- [x] Add a Commerce Guild helper that changes `complete` to `idle` while retaining the last auction result and cooldown.
- [x] Delete `maybeStartGuildGathering`, `lastAutoGatheringRound`, the automatic-start log key, and every production call/branch that references them.
- [x] Require `playerId` on domain `START_GATHERING`; in Local control dispatch, inject the current active controlled player rather than accepting an intent actor.
- [x] In `applyMatchCommand`, pass `pendingPlayerTrade !== undefined` to the shared blocker/start transition and close a complete gathering only in the accepted end-turn transition.
- [x] Map blockers in `actionAvailability.ts`, including `GATHERING_COOLDOWN` with `{ remainingTurns }`; use the same derived remaining value for the Local view.
- [x] Add English and Simplified-Chinese cooldown/ready/disabled strings and delete obsolete automatic-start translations.
- [x] Rerun the focused command; expect all focused tests GREEN.
- [x] Run `pnpm vitest run test/domain/commerceGuild.test.ts test/domain/commerceGuildIntegrity.test.ts test/domain/commerceGuildPolish.test.ts test/domain/auctionNoBid.test.ts`; expect all existing guild behavior GREEN.
- [x] Run `pnpm test` and `pnpm build`; expect all main tests and app TypeScript/build GREEN.
- [x] Review the diff to confirm `applyMatchCommand.ts`, React, and Worker facades contain no cooldown formula and no player-keyed cooldown state exists.
- [x] Commit `feat: pace Commerce Guild gatherings`.

## Task 2 — T002: Atomic second-settlement starting resources

Requirements: GP-025–GP-031, GP-046
Review boundary: setup settlement domain transition only; no cooldown, protocol, or presentation changes.

Files:

- Modify `src/domain/rules/building.ts`.
- Modify `test/domain/setupInteraction.test.ts`.
- Modify `test/domain/coreRulesBacklog.test.ts`.
- Modify `test/domain/ruleIntegrity.test.ts`.
- Modify `test/domain/matchTransition.test.ts` only if command-level atomicity needs an assertion.

Interfaces:

- Consumes existing `GameState.board[*].vertexIds/resource`, player resources, bank resources, and setup order.
- Keeps `placeSetupSettlement(game, playerId, vertexId): GameState` as the single public transition.
- Adds no UI/Worker award path and no persisted grant marker.

Steps:

- [x] Add a first-placement test proving player and bank resource maps remain unchanged after the first setup settlement.
- [x] Add a second-placement test that selects a legal vertex adjacent to producing hexes and asserts one card per adjacent hex with an equal bank debit.
- [x] Add a vector where two adjacent hexes share a resource and assert both cards are granted.
- [x] Add a desert-adjacent vector and assert the desert contributes zero while other adjacent hexes still contribute.
- [x] Add exact-once assertions proving the paired setup road, the next player's placement, projection, and setup completion do not repeat the grant.
- [x] Add an insufficient-bank test with a cloned before-state; expect the complete settlement command to throw and buildings, hand, bank, setup stage/index, pending settlement, and active player to remain byte-equivalent.
- [x] Run `pnpm vitest run test/domain/setupInteraction.test.ts test/domain/coreRulesBacklog.test.ts test/domain/ruleIntegrity.test.ts`; expect RED because second settlements currently award nothing.
- [x] In `placeSetupSettlement`, determine second placement before mutation, derive the adjacent resource multiset, and preflight the complete bank debit.
- [x] Apply player credit, bank debit, settlement append, pending settlement, and stage change in the same returned state; keep first placement unchanged and do not modify road placement.
- [x] Rerun the focused command; expect all grant and existing setup tests GREEN.
- [x] Run `pnpm vitest run test/domain/matchTransition.test.ts test/domain/production.test.ts test/domain/portGameplay.test.ts`; expect setup command, resource conservation, and board adjacency regressions GREEN.
- [x] Run `pnpm test` and `pnpm build`; expect all main tests and app build GREEN.
- [x] Review the diff to confirm no award code exists in Local, Online, Worker, projection, or road transitions.
- [x] Commit `feat: grant second-settlement resources`.

## Task 3 — T003: Protocol-v3 public cooldown and authenticated actor boundary

Requirements: GP-015–GP-019, GP-024, GP-044, GP-046–GP-047
Review boundary: wire/projection/caller authorization; persisted room replacement is T004.

Files:

- Modify `src/online/protocol.ts`.
- Modify `src/online/view.ts`.
- Modify `src/online/allowedActions.ts`.
- Modify `src/online/projectRoomView.ts`.
- Modify `src/online/onlineGameProjection.ts`.
- Modify `src/online/onlineGameAdapter.ts`.
- Modify `src/online/useOnlineRoom.ts` only where current protocol fixtures/handling require it.
- Modify `worker/room/commandPipeline.ts` only at the existing `trustedCommand` boundary.
- Modify `test/online/protocol.test.ts`.
- Modify `test/online/projectionPrivacy.test.ts`.
- Modify `test/online/onlineGameUi.test.ts`.
- Modify `test/online/onlineClient.test.ts`.
- Modify `test/online/onlineLobbyUi.test.ts` where versioned fixtures compile.
- Modify `test/e2e/frontend-recovery.spec.ts` and `test/e2e/online-multiplayer.spec.ts` mechanically for typed schema-v3 fixtures; behavioral browser assertions remain T007.
- Modify `test/domain/deliveryReadiness.test.ts` where the expected protocol constant is asserted.

Interfaces:

- Public command remains `{ type: "START_GATHERING" }` with exact keys.
- Public guild projection adds required `cooldownRemaining: number` under `gathering`.
- `PrivateSeatState` gains no cooldown field.
- Worker `trustedCommand` produces domain `{ type: "START_GATHERING", playerId }`.

Steps:

- [x] Add protocol tests requiring schema version 3 and exact no-payload `START_GATHERING`.
- [x] Add adversarial command tests containing `playerId`, `seatId`, `availableAtTurn`, `remainingTurns`, and unknown fields; expect strict rejection.
- [x] Add projection tests requiring one public non-negative `cooldownRemaining`, rejecting missing/negative/fractional/too-large/internal-target fields.
- [x] Add two-caller projection tests proving the public remaining value is identical while only the qualified current caller receives enabled `startGathering`.
- [x] Add privacy tests proving `availableAtTurn`, `displayDuration`, and any player-keyed cooldown map are absent from public/private snapshots.
- [x] Add adapter tests proving the shared `GameTableView` receives the public value and dispatches a no-actor intent.
- [x] Run `pnpm vitest run test/online/protocol.test.ts test/online/projectionPrivacy.test.ts test/online/onlineGameUi.test.ts test/online/onlineClient.test.ts`; expect RED on schema version, projection shape, actor enrichment, and parser validation.
- [x] Set `PROTOCOL_SCHEMA_VERSION = 3` and retain exact `START_GATHERING` command parsing with no payload.
- [x] Add `cooldownRemaining` to public view/projector/parser/adapter, deriving it once from the Commerce Guild helper and validating the exact public shape.
- [x] Keep caller-specific availability in `allowedActions` and validate `GATHERING_COOLDOWN.params.remainingTurns` without adding private timer data.
- [x] Change only `trustedCommand` so `START_GATHERING` receives the authenticated seat's player id; keep `OPEN_AUCTION` behavior unchanged and do not add a parallel handler.
- [x] Mechanically update all listed main/E2E typed protocol fixtures to version 3 while retaining explicit version-2 incompatibility cases.
- [x] Rerun the focused command; expect all protocol/projection/client tests GREEN.
- [x] Run `pnpm test` and `pnpm build`; expect main TypeScript/tests/build GREEN.
- [x] Inspect recipient projections to confirm same room version yields one public cooldown and distinct authorization only through existing allowed actions.
- [x] Commit `feat: project gathering cooldown over protocol v3`.

## Task 4 — T004: Persisted schema-v3 migration and online atomicity

Requirements: GP-018–GP-024, GP-046–GP-048
Review boundary: storage validation/migration/Worker command transaction; no resource presentation.

Files:

- Modify `worker/room/roomTypes.ts`.
- Modify `worker/room/roomMigration.ts`.
- Modify `worker/room/roomValidation.ts`.
- Modify `worker/room/roomStore.ts`.
- Modify `worker/room/roomLifecycle.ts`.
- Modify `worker/room/RoomDurableObject.ts` only if a schema literal or validation call requires it.
- Modify `scripts/smoke-worker.mjs`.
- Create `test/worker/gatheringMigration.test.ts`.
- Create `test/worker/gatheringAuthority.test.ts`.
- Modify `test/worker/roomMigration.test.ts` for current-v3 and explicit legacy-v1/v2 fixtures.
- Modify `test/worker/roomLifecycle.test.ts` mechanically for current-schema fixtures only.
- Modify `test/worker/roomRestart.test.ts` mechanically for current-schema fixtures only.
- Modify `test/worker/roomWebSocket.test.ts` for protocol-v3 snapshots and reconnect regression.
- Modify `test/worker/workerSmoke.test.ts` for current version.

Interfaces:

- Current `PersistedRoom.schemaVersion` becomes literal `3`.
- Migration boundary accepts recognized v1/v2 and returns a fully validated v3 room.
- Current guild validation requires `gatheringCooldown` and rejects `lastAutoGatheringRound`.
- Existing serialized command pipeline remains the only persistence/broadcast path.

Steps:

- [x] Add v2 lobby migration proving no `matchState` or cooldown is fabricated and every non-schema field is preserved.
- [x] Add v2 idle and complete match migrations proving `2n` windows anchored at `game.turn`, removal of `lastAutoGatheringRound`, and preservation of last auction result.
- [x] Add v2 redemption and auction migrations proving live phase/redemptions/results/sealed bids remain intact and an `n` window excluding the current turn is established.
- [x] Add three- and four-player migration vectors, reconnect-after-migration, and storage-eviction reconstruction of the same public remaining value.
- [x] Add invalid v2 cases for malformed turn/player count/cooldown-adjacent data; assert migration failure leaves raw storage byte-equivalent and emits no snapshot.
- [x] Add a v1 fixed-map regression proving the existing map-seed migration chains into a valid v3 cooldown state; retain corrupt-v1 rejection.
- [x] Add authenticated start tests: current caller success, non-current caller rejection, unresolved phase, pending trade, nonzero cooldown, stale version, duplicate command id, and direct actor-field protocol rejection.
- [x] For every rejected command, assert no storage mutation, room-version increment, accepted-command record, or recipient broadcast; for success, assert one persisted version and converged recipient snapshots.
- [x] Run `pnpm exec vitest run --config vitest.worker.config.ts test/worker/gatheringMigration.test.ts test/worker/gatheringAuthority.test.ts`; expect RED on schema literal, migration, validation, and transaction behavior.
- [x] Change current room/lifecycle creation to schema 3 and confine legacy v1/v2 types to `roomMigration.ts`.
- [x] Reuse Commerce Guild initial/post window helpers in migration; do not duplicate formulas in Worker code.
- [x] Refactor room-store version dispatch to validate legacy input, construct the entire v3 candidate, validate current schema, and perform one replacement write.
- [x] Require exact current guild keys including `gatheringCooldown`; reject obsolete automatic metadata and impossible window values.
- [x] Update current Worker fixtures/smoke expectations to 3 while retaining explicit legacy test fixtures at their original versions.
- [x] Rerun the two focused Worker files; expect GREEN.
- [x] Run `pnpm test:worker` and `pnpm build:worker`; expect every Worker test and Worker TypeScript check GREEN.
- [x] Run `pnpm test`, `pnpm build`, and `pnpm smoke:worker`; expect main regression, app build, and Worker smoke GREEN.
- [x] Review migration for one complete-candidate write and command flow for persistence-before-broadcast; confirm no business formula was added to Worker facades.
- [x] Commit `feat: migrate gathering state to schema v3`.

## Task 5 — T005: Shared resource badges and operational controls

Requirements: GP-032–GP-033, GP-038–GP-045
Review boundary: one resource presentation boundary plus action/trade/Commerce decision surfaces; board/statistics replacement is T006.

Files:

- Create `src/ui/ResourceBadge.tsx`.
- Modify `src/ui/resourceLabels.ts`.
- Modify `src/ui/ActionDock.tsx`.
- Modify `src/ui/DevelopmentCardPanel.tsx`.
- Modify `src/ui/TurnFlowPanel.tsx`.
- Modify `src/ui/PlayerTradePanel.tsx`.
- Modify `src/ui/CommercePanel.tsx`.
- Modify `src/ui/GameTable.tsx` for action-cost/cooldown view contracts.
- Modify `src/app/localGameState.ts` to retain action costs in the shared view.
- Modify `src/online/onlineGameAdapter.ts` to retain action costs in the shared view.
- Modify `src/ui/i18n.ts` for cooldown badge, ready state, icon/bundle, and generic resource-card outcome accessibility text.
- Modify `src/styles/app.css`.
- Create `test/domain/resourcePresentation.test.ts`.
- Modify `test/domain/playerTradeUi.test.ts`.
- Modify `test/domain/productPolish.test.ts`.
- Modify `test/domain/frontendAccessibility.test.ts`.
- Modify `test/domain/gameTableView.test.ts`.
- Modify `test/domain/localization.test.ts`.
- Modify `test/online/onlineGameUi.test.ts` where shared view costs/cooldown render.

Interfaces:

- Produces the only `Record<Resource, LucideIcon>` mapping: `Trees`, `BrickWall`, `Cloud`, `Wheat`, `Gem`.
- Produces `ResourceIcon`, `ResourceBadge`, and `ResourceBundle` from the same file/mapping.
- Preserves visible quantity and localized accessible name/title.
- Extends shared action view entries for road/settlement/city/development-card costs instead of recomputing costs in React.

Steps:

- [x] Add component tests proving five distinct icon identities/classes, semantic resource classes, visible integer/decimal/zero quantities, and localized English/Chinese accessible names.
- [x] Add a repository guard proving only `ResourceBadge.tsx` declares a resource-to-icon map and no new icon/dependency asset is introduced.
- [x] Add operational render tests for build/development costs, maritime choices, trade bundles, Commerce slots/redemption, discard/development decisions, generic sealed-auction resource count, and one cooldown badge.
- [x] Add keyboard/accessibility assertions for icon-backed resource selection: programmatic group/option names, `aria-pressed` state, focusable buttons, input labels, disabled reasons, and ready state not conveyed by color alone.
- [x] Run `pnpm vitest run test/domain/resourcePresentation.test.ts test/domain/playerTradeUi.test.ts test/domain/productPolish.test.ts test/domain/frontendAccessibility.test.ts test/domain/gameTableView.test.ts`; expect RED on missing component, missing action costs, visible abbreviations/words, and dual-purpose native resource selects.
- [x] Implement `ResourceBadge.tsx` with the approved icons, existing semantic color classes, shared quantity formatting, localized `aria-label`/`title`, and no remote asset or second map.
- [x] Preserve cost maps through Local/Online adapters and render icon bundles alongside road, settlement, city, and development-card actions.
- [x] Replace maritime resource `<select>` elements with two fixed keyboard-operable icon button groups; retain player/non-resource native selects.
- [x] Replace player-trade editor labels and pending offer/request visible strings with structured icon bundles while retaining a complete localized accessible summary.
- [x] Replace Commerce trade-slot costs and redemption buttons with resource badges; show sealed public resource-card count with a generic pictogram without exposing resource composition.
- [x] Replace discard/year-of-plenty/monopoly resource controls and development-card costs with shared icons while preserving existing localized input/action names.
- [x] Add one compact Commerce Guild table-cooldown badge and localized ready/remaining text; keep the Start button's highest-priority disabled reason linked with `aria-describedby`.
- [x] Add filled badge, selection, focus, ready, disabled, compact, and responsive styles using existing tokens/resource colors.
- [x] Rerun the focused command; expect all operational and accessibility tests GREEN.
- [x] Run `pnpm vitest run test/domain/localization.test.ts test/online/onlineGameUi.test.ts`; expect bilingual/shared Online presentation GREEN.
- [x] Run `pnpm test`, `pnpm build`, and `pnpm smoke:ui`; expect main regression/build/UI smoke GREEN.
- [x] Review source for duplicate icon maps, native resource options, visible operational abbreviations, and resource-name loss from the accessibility tree.
- [x] Commit `feat: render resources with shared badges`.

## Task 6 — T006: Board, ports, inventory, and statistics icon convergence

Requirements: GP-033–GP-041, GP-043, GP-045–GP-047
Review boundary: shared GameTable visual convergence, SVG/accessibility/responsive behavior; no new domain/protocol state.

Files:

- Modify `src/ui/GameTable.tsx`.
- Modify `src/ui/resourceLabels.ts` to remove unused abbreviation exports.
- Modify `src/styles/app.css`.
- Modify `test/domain/resourcePresentation.test.ts`.
- Modify `test/domain/productPolish.test.ts`.
- Modify `test/domain/frontendAccessibility.test.ts`.
- Modify `test/domain/gameTableView.test.ts`.
- Modify `test/domain/stats.test.ts`.
- Modify `test/domain/localization.test.ts` only if rendered accessible strings add keys.

Interfaces:

- Consumes `ResourceIcon`, `ResourceBadge`, and `ResourceBundle`; declares no icon map in `GameTable.tsx`.
- Removes `terrainMarks` and visible `.terrain-icon`/`.hex-resource` nodes.
- Keeps localized terrain/resource semantics on enclosing SVG groups.

Steps:

- [x] Add render tests proving private hands and bank render five icon-plus-quantity badges, including semantically named zero values.
- [x] Add statistics tests proving player/dice resource bundles and matrix headers use shared icons with accessible names and preserve decimal quantities.
- [x] Add board SVG tests proving every non-desert hex has its produced-resource icon, desert has none, dice tokens remain, and no visible terrain name/abbreviation text node exists.
- [x] Add port tests proving generic ports show only `3:1`, resource ports show `2:1` plus the correct icon, and enclosing groups retain localized accessible labels.
- [x] Add English/Chinese and narrow-layout assertions proving no horizontal overflow contract regression and no resource meaning depends on color or table position.
- [x] Add English/Chinese regression assertions proving rulebook/help text and natural-language game logs still contain complete resource names after operational abbreviations are removed.
- [x] Run `pnpm vitest run test/domain/resourcePresentation.test.ts test/domain/productPolish.test.ts test/domain/frontendAccessibility.test.ts test/domain/gameTableView.test.ts test/domain/stats.test.ts`; expect RED on remaining text/abbreviations and missing SVG icons.
- [x] Replace player private resource strips and bank stock with `ResourceBadge`, retaining all five zero quantities where inventory state matters.
- [x] Replace player/dice statistic bundle strings and matrix word headers with shared bundle/icon rendering; retain `stats.noGain` prose for an empty bundle.
- [x] Delete `terrainMarks`; on each non-desert hex render the shared resource icon at the former label area and retain the number token/robber visuals.
- [x] Render resource-specific ports with ratio text plus the shared icon; keep generic ports ratio-only and retain localized group labels/tooltips.
- [x] Remove obsolete terrain text/icon and abbreviation CSS; add nested SVG icon sizing/contrast rules and responsive containment.
- [x] Delete `resourceShortLabels` after repository search confirms no production consumer remains; keep full-name prose formatting for logs/rules.
- [x] Rerun the focused command; expect all GameTable, statistics, SVG, and accessibility tests GREEN.
- [x] Run `rg -n "resourceShortLabels|terrainMarks|className=\"terrain-icon\"|className=\"hex-resource\"" src`; expect no matches.
- [x] Run `pnpm test`, `pnpm build`, and `pnpm smoke:ui`; expect main regression/build/UI smoke GREEN.
- [x] Inspect desktop/tablet/mobile Local renders in both languages before commit; record any reproducible defect for T007 browser coverage.
- [x] Commit `feat: use resource icons across the game table`.

## Task 7 — T007: Browser convergence, documentation, review, and release gates

Requirements: GP-001–GP-048
Review boundary: end-to-end evidence, public documentation, convergence, and delivery records; production changes only for defects reproduced by these gates.

Files:

- Modify `test/e2e/frontend-recovery.spec.ts`.
- Modify `test/e2e/online-multiplayer.spec.ts`.
- Modify `README.md`.
- Modify `README.zh-CN.md`.
- Modify `docs/roadmap.md`.
- Modify `test/domain/deliveryReadiness.test.ts` and `test/domain/localization.test.ts` for current documentation claims.
- Update `specs/004-gathering-pacing-resource-icons/quickstart.md` only if verified commands differ.
- Create `specs/004-gathering-pacing-resource-icons/verification.md` from current command output.
- Create `specs/004-gathering-pacing-resource-icons/handoff.md` from completed artifacts/evidence.

Steps:

- [x] Add Local browser coverage that completes setup and proves first settlement no grant, second settlement exact adjacent grant, equal bank debit, and no repeat on the paired road.
- [x] Add supported three/four-player browser cooldown vectors: four-player Local and three-player Online, proving initial `2n`, start availability only in clean action phase, post-start `n`, initiating-turn exclusion, and zero boundary without adding a test-only Local roster.
- [x] Add Local desktop/mobile checks in English and Chinese for one cooldown badge, filled resource badges, keyboard resource selection, scrollable statistics/log panels, and no horizontal overflow.
- [x] Add board browser assertions for icon-only produced resources/ports, retained dice/robber visuals, no visible terrain word/abbreviation, and complete accessible labels.
- [x] Add two-isolated-context Online coverage proving identical public remaining values, current-caller-only start, no actor in sent command, one accepted version increment, stale/non-current rejection, and reconnect convergence.
- [x] Add or retain adversarial WebSocket coverage sending `playerId`/timer fields; assert protocol rejection and unchanged room version/snapshot.
- [x] Run the smallest affected Playwright project after each new assertion; observe RED until the relevant integration behavior is present, then fix only reproducible in-scope defects.
- [x] Update English and Chinese READMEs with manual gathering pacing, second-settlement starting resources, accessible resource icons, default-English/switchable-Chinese behavior, and protocol/storage v3 deployment note.
- [x] Update the roadmap to mark these behaviors complete without rewriting historical specs 001–003.
- [x] Run `pnpm vitest run test/domain/deliveryReadiness.test.ts test/domain/localization.test.ts`; expect documentation and bilingual claims GREEN.
- [x] Run `pnpm test`; record exact passed file/test counts in `verification.md`.
- [x] Run `pnpm test:worker`; record exact passed file/test counts.
- [x] Run `pnpm test:e2e`; record exact passed project/test counts.
- [x] Run `pnpm build` and `pnpm build:worker`; record both successful outputs.
- [x] Run `pnpm smoke:ui` and `pnpm smoke:worker`; record both successful outputs.
- [x] Run `pnpm exec wrangler deploy --dry-run --config wrangler.jsonc`; record bundle/binding success without deploying.
- [x] Run repository guards for obsolete auto gathering, personal/player-keyed cooldown state, resource abbreviations, duplicate icon maps, and visible terrain text; record zero unexpected matches.
- [x] Run `git diff --check`; expect no whitespace errors.
- [x] Complete the GP-001–GP-048 evidence table in `verification.md` and write `handoff.md` with branch, commits, schema migration/deployment implications, verified behavior, known out-of-scope items, and exact next action.
- [x] Request a whole-branch code review; resolve every confirmed finding with focused RED/GREEN evidence and rerun affected plus full gates.
- [x] Run artifact convergence against the final `spec.md`, `plan.md`, and `tasks.md`; append rather than renumber any newly discovered implementation task.
- [x] Commit `docs: verify gathering pacing and resource icons` only after every recorded command is current.

## Requirement Coverage Matrix

| Requirement | Implemented/tested in |
| --- | --- |
| GP-001–GP-002 | T001 cooldown definition, new/restart vectors, setup exclusion |
| GP-003–GP-005 | T001 shared blocker/domain authority; T003/T004 caller authority |
| GP-006–GP-010 | T001 absolute target/cap vectors and authoritative turn math |
| GP-011–GP-014 | T001 auto-trigger deletion, complete-to-idle, restart, atomic reasons |
| GP-015–GP-017 | T003 no-payload protocol, trusted actor, public/caller projection |
| GP-018–GP-024 | T003 strict v3 projection; T004 persisted migration/serialized pipeline |
| GP-025–GP-031 | T002 second-settlement atomic shared domain grant |
| GP-032 | T005 one installed-dependency icon mapping |
| GP-033–GP-035 | T005 operational/trade foundations; T006 statistics and port surfaces |
| GP-036–GP-037 | T006 non-desert icon/desert behavior and visible terrain removal |
| GP-038–GP-041 | T005/T006 accessibility, silhouettes, prose preservation, no dependency/duplicate map |
| GP-042–GP-045 | T001 data/reasons; T005 one badge and bilingual accessible experience |
| GP-046 | T001–T006 focused domain/main/Worker/UI evidence |
| GP-047 | T003 projection tests; T007 Local/Online isolated browser evidence |
| GP-048 | T007 full release gates, review, convergence, verification, and handoff |

## MVP and Execution Order

- Behavioral MVP: T001 + T002. The rules become correct before protocol or visual work.
- Online-compatible increment: T003 + T004. Do not deploy after T003 alone.
- Presentation increment: T005 + T006.
- Release-ready feature: T007 after all prior tasks are verified.
