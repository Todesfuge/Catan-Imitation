# Implementation Plan: Gathering Pacing, Setup Grants, and Resource Iconography

Date: 2026-07-14
Branch: `codex/gathering-cooldowns-icons`
Specification: `specs/004-gathering-pacing-resource-icons/spec.md`

> **Agentic worker note:** Execute `tasks.md` in order with test-first RED/GREEN evidence. Use a review checkpoint after each task commit. Do not combine domain cooldown, storage migration, and visual replacement into one unreviewed change.

## Goal

Replace automatic/unrestricted Commerce Guild gatherings with one authoritative turn-based table cooldown, grant standard starting resources at each player's second setup settlement, and render operational resources through one accessible icon system across Local and Online play.

## Architecture

The Commerce Guild domain owns a single absolute-turn cooldown window and one shared eligibility blocker. Match orchestration supplies actor and pending-trade context, while Local and Worker adapters only inject trusted identity and render/project derived facts. Online wire/storage advance to schema v3 because strict projections and persisted guild state both change.

Setup awards remain inside the existing pure setup-settlement transition. Resource visuals use one new React presentation boundary backed by the already-installed Lucide package and existing semantic colors; `GameTable.tsx` consumes that boundary rather than owning another mapping.

## Technology Stack

- TypeScript 5.7 pure domain and strict object validation.
- React 18 server-rendered component tests and shared Local/Online game table.
- `lucide-react` 0.468.0 using existing dependency only.
- Vitest 2 main and Cloudflare Workers pools.
- Playwright 1.61 for Local/Online browser evidence.
- Cloudflare Durable Object storage and serialized room command pipeline.
- Existing English/Simplified-Chinese dictionary in `src/ui/i18n.ts`.

## Global Constraints

- Follow TDD for every production behavior: focused failing test, observed failure, minimal implementation, focused pass, then broader gates.
- Keep exactly one table cooldown; do not add player-keyed cooldown state, private cooldown projection, browser timers, Worker alarms, or wall-clock expiry.
- New/restarted match cooldown is `2n`; a successful gathering start resets it to `n`; the initiating current turn is excluded.
- Only the current active player in a clean post-roll action phase may start a ready gathering.
- Public `START_GATHERING` remains no-payload; Local/Worker trust boundaries supply `playerId`.
- Preserve strict exact-object protocol validation, projection privacy, command idempotency, expected-version checks, persistence-before-broadcast, and no-partial-write migration.
- Place second-settlement award, player credit, bank debit, and setup progression in one pure domain transition.
- Reuse `lucide-react`; do not add packages, remote assets, fonts, or per-panel resource maps.
- Natural-language rules, help, and game logs retain full resource names.
- Visible operational/state resource labels become icon plus quantity; localized names remain programmatically available.
- Board hexes show resource icon plus number only; desert shows no resource icon; visible terrain names/abbreviations are removed.
- English remains the default and every new visible/accessibility/error string has Simplified Chinese.
- Keep new focused tests out of the 1,913-line Worker lifecycle suite and other existing test hotspots where a dedicated file is practical.
- Do not commit build output, Playwright reports, Wrangler state, dependency artifacts, or private scratch records.

## Constitution Check

| Principle | Plan response |
| --- | --- |
| Playable core before decoration | Domain pacing and setup correctness land before icon polish. |
| Pure game rules, thin UI | Cooldown/blocker and setup grant stay in pure domain owners; React consumes derived facts. |
| High cohesion, low coupling | Commerce Guild, building, migration, protocol, and resource presentation each have one owner. |
| Traceable delivery | GP requirements map to task ids and final verification evidence. |
| Time-boxed scope control | One new production file and no dependency/service/route expansion. |

No constitution exception is required.

## Minimalism Decision

| Question | Decision |
| --- | --- |
| Lowest adequate rung | Reuse existing modules/dependency, then direct bounded changes. |
| New domain state | One `GatheringCooldownWindow`. |
| New production abstraction | One shared `ResourceBadge.tsx` boundary, justified by many real consumers. |
| Reused authority path | Existing `applyMatchCommand` plus Worker `trustedCommand` and serialized command pipeline. |
| Reused migration path | Existing `roomMigration.ts` and `roomStore.ts` version dispatch. |
| Reused presentation assets | Existing semantic resource colors and Lucide dependency. |
| Explicit non-additions | No personal timer, scheduler, service, package, route, generic listbox, or second icon map. |

## Boundary-First Gate

| Boundary | Existing owner | Facade risk | Planned net effect | Narrow proof |
| --- | --- | --- | --- | --- |
| Cooldown math/start rule | `commerceGuild.ts` | `applyMatchCommand.ts` must not gain formulas | Add one window/blocker; delete automatic trigger/metadata path | `gatheringCooldown.test.ts` |
| Match command composition | `applyMatchCommand.ts` | File is 788 lines and coordinates many rules | Replace auto-start branch with thin calls to Commerce Guild owner | `matchTransition.test.ts` |
| Setup grant | `building.ts` | Local/Worker adapters could duplicate the award | Extend existing settlement transition only; add no adapter path | `setupInteraction.test.ts` |
| Authenticated Online command | `commandPipeline.ts` trusted-command switch | File is a 619-line serialized integration facade | Change one actor-enrichment case; add no handler/runner | `gatheringAuthority.test.ts` |
| Storage migration/validation | `roomMigration.ts`, `roomStore.ts`, `roomValidation.ts` | Parallel current schemas would duplicate validation | Replace current v2 target with v3 and confine v1/v2 to migration | `gatheringMigration.test.ts` |
| Resource presentation | New bounded `ResourceBadge.tsx` | `GameTable.tsx` is 827 lines and already had a terrain map | Move the only icon map out; delete abbreviations/terrain map and reuse renderers | `resourcePresentation.test.ts` |
| Browser status | Existing Playwright files | Both suites are large integration hotspots | Add only cross-surface assertions; keep detailed logic in focused Vitest files | focused tests plus smallest Playwright project |

The plan adds no second runner, status shape, command pipeline, timer service, or schema parser. Large facades receive delegation/wiring changes only.

## Responsibility and File Map

### Commerce Guild domain and match composition

- `src/domain/expansion/commerceGuild.ts`: cooldown types/formulas, start blocker, start transition, complete-to-idle transition; delete automatic gathering metadata/trigger.
- `src/domain/match/types.ts`: require trusted `playerId` on domain `START_GATHERING`.
- `src/domain/match/createMatch.ts`: construct initial `2n` cooldown from actual seat count.
- `src/domain/match/applyMatchCommand.ts`: pass actor/pending-trade context, remove automatic trigger/log path, close complete gathering on accepted end turn.
- `src/app/actionAvailability.ts`: map the shared blocker to stable availability reasons including remaining turns.
- `src/app/localGameState.ts`: inject the active Local control id into the domain command and project the public cooldown.
- `src/ui/i18n.ts`: bilingual cooldown labels/reasons; remove automatic-start log localization.
- `test/domain/gatheringCooldown.test.ts` (new): deterministic three/four-player math, gating, atomic rejection, complete-to-idle, no auto start.
- Existing Commerce Guild/action/match tests: adapt constructors and protect prior redemption/auction behavior.

### Setup grant domain

- `src/domain/rules/building.ts`: derive and atomically apply second-settlement resource multiset.
- `test/domain/setupInteraction.test.ts`: snake-order grant timing and exact-once behavior.
- `test/domain/coreRulesBacklog.test.ts`: adjacent/duplicate/desert vectors and end-to-end setup totals.
- `test/domain/ruleIntegrity.test.ts`: insufficient-bank atomic rejection and invalid-state protection.

### Public online projection and authenticated command

- `src/online/protocol.ts`: protocol schema 3; retain exact no-payload `START_GATHERING`.
- `src/online/view.ts`: public `cooldownRemaining`; no private cooldown field.
- `src/online/allowedActions.ts`: preserve caller-specific authorization using shared facts.
- `src/online/projectRoomView.ts`: derive one public remaining value from domain state.
- `src/online/onlineGameProjection.ts`: strictly validate required public cooldown and updated reason code/params.
- `src/online/onlineGameAdapter.ts`: project cooldown into shared `GameTableView` and send no-payload intent.
- `src/online/useOnlineRoom.ts`: continue existing incompatible/reconnect behavior under protocol 3.
- `worker/room/commandPipeline.ts`: inject authenticated `playerId` for `START_GATHERING` without adding another command path.
- `test/online/protocol.test.ts`, `test/online/projectionPrivacy.test.ts`, `test/online/onlineGameUi.test.ts`, `test/online/onlineClient.test.ts`: strict v3/no-actor/public convergence/caller authorization.
- Existing schema-number fixtures in main and E2E tests: mechanically update to v3.

### Persisted room v3 migration

- `worker/room/roomTypes.ts`: current `PersistedRoom.schemaVersion` becomes 3; legacy shapes stay migration-local.
- `worker/room/roomMigration.ts`: chain valid v1 map migration through deterministic v2-to-v3 cooldown migration.
- `worker/room/roomValidation.ts`: require one valid cooldown window and reject obsolete auto metadata.
- `worker/room/roomStore.ts`: version dispatch, complete-candidate validation, one atomic replacement write.
- `worker/room/roomLifecycle.ts`: create new rooms as schema 3.
- `scripts/smoke-worker.mjs`: expect protocol/storage version 3.
- `test/worker/gatheringMigration.test.ts` (new): v2 lobby/idle/complete/redemption/auction baselines and atomic failure.
- `test/worker/gatheringAuthority.test.ts` (new): authenticated actor injection, stale/wrong-player/phase rejection, recipient convergence, reconnect.
- Existing Worker fixtures: update current-schema literals while retaining explicit legacy fixtures.

### Shared resource presentation and operational controls

- `src/ui/ResourceBadge.tsx` (new): only resource-to-icon map; icon, badge, and bundle rendering with localized semantics.
- `src/ui/resourceLabels.ts`: retain prose formatter; remove operational abbreviations after consumers migrate.
- `src/ui/ActionDock.tsx`: icon build costs and icon-backed maritime resource selection.
- `src/ui/DevelopmentCardPanel.tsx`: icon costs and resource decisions.
- `src/ui/TurnFlowPanel.tsx`: icon discard/resource decisions with current accessible input names.
- `src/ui/PlayerTradePanel.tsx`: icon bundle editors and icon-based pending offer/request display.
- `src/ui/CommercePanel.tsx`: icon trade slots/redemption/outcome and one cooldown badge.
- `src/ui/GameTable.tsx`: carry action costs/cooldown in shared view types; use shared icons for private hands, bank, statistics, board, and ports.
- `src/app/localGameState.ts`, `src/online/onlineGameAdapter.ts`: preserve cost/cooldown facts when adapting to `GameTableView`.
- `src/styles/app.css`: filled semantic badges, icon selection states, SVG placement, responsive containment, focus/disabled/ready states.
- `test/domain/resourcePresentation.test.ts` (new): mapping uniqueness, icon/quantity/accessibility, operational visible-text contract.
- Existing UI/localization tests: update abbreviation/text assumptions and add bilingual semantics.

### Browser evidence and public documentation

- `test/e2e/frontend-recovery.spec.ts`: Local setup grant, cooldown, icon/terrain/mobile/language behavior.
- `test/e2e/online-multiplayer.spec.ts`: two isolated caller cooldown convergence, authority, stale attempt, reconnect.
- `README.md`, `README.zh-CN.md`, `docs/roadmap.md`: current behavior and bilingual public documentation.
- `specs/004-gathering-pacing-resource-icons/verification.md` and `handoff.md`: created only after current evidence exists.

## Key Data and Control Flows

### New match cooldown

```text
createSetupMatch(seats)
  -> game.turn = 1
  -> createCommerceGuild(playerCount = seats.length, currentTurn = 1)
  -> gatheringCooldown { availableAtTurn: 1 + 2n, displayDuration: 2n }
  -> setup placements leave game.turn unchanged
  -> first formal turn still displays 2n
```

### Start gathering

```text
Local active control OR authenticated Online seat
  -> UI intent / exact no-payload wire command
  -> trusted boundary supplies playerId
  -> applyMatchCommand
     -> commerceGuild.getGatheringStartBlocker(...)
     -> require playing + action + current + no trade + idle + remaining 0
     -> startGuildGathering
        -> phase redemption
        -> window { target: turn + n + 1, cap: n }
  -> project same public remaining to all callers
  -> project caller-specific enabled/reason through existing allowed actions
```

### Cooldown progress

```text
initiator starts on turn t: remaining n
initiator END_TURN -> game.turn t+1: remaining remains n
each subsequent accepted END_TURN -> derived remaining decreases by one
after n subsequent player turns -> target reached, remaining 0
```

### Setup settlement award

```text
PLACE_SETUP_SETTLEMENT
  -> validate setup actor/stage/location
  -> second placement for this player?
     -> derive adjacent non-desert resource multiset
     -> preflight complete bank debit
  -> one returned state:
     building append + player credit + bank debit + stage road
```

### v2 persisted-room migration

```text
read raw room
  -> v3: strict validation
  -> v2 lobby: schema 3, no match
  -> v2 match:
       validate legacy room
       remove lastAutoGatheringRound
       idle/complete -> 2n window at current turn
       redemption/auction -> n window excluding current turn
  -> v1: existing fixed-map validation -> legacy v2 candidate -> v3 migration
  -> strict validate complete v3 candidate
  -> one storage put
```

### Resource rendering

```text
Resource + quantity + locale
  -> ResourceBadge shared mapping
     -> distinct Lucide silhouette
     -> existing semantic resource color
     -> visible formatted quantity
     -> localized accessible name/title
  -> operational panels / statistics / SVG board
```

Natural-language log/rule formatting bypasses `ResourceBadge` and continues using full localized words.

## Verification Strategy

### Focused domain evidence

- Three/four-player initial and post-gathering vectors.
- Initiating-turn exclusion and exact zero boundary.
- Current-player/action/phase/trade/cooldown blockers with unchanged rejected state.
- No automatic gathering over at least twelve four-player turns.
- Complete gathering returns to idle only on accepted end turn and retains last result.
- First settlement no grant; second settlement exact adjacent multiset; repeated resources; desert; exact once; atomic bank shortage.

### Online and migration evidence

- Exact v3 command rejects actor, target, timer, and unknown fields.
- Worker derives actor from authenticated seat.
- Stale/non-current/wrong-phase/cooled starts leave storage/version/broadcast unchanged.
- Same public remaining value across at least two caller projections; only qualified current caller is enabled.
- v2 lobby/idle/complete/redemption/auction deterministic migration.
- v1 fixed-map migration remains supported through the chain.
- Invalid legacy state produces no partial write.
- Reconnect/eviction reconstructs the same remaining value.

### Resource and accessibility evidence

- Five distinct icon component identities and semantic classes.
- Icon plus quantity on every named operational/state surface.
- Complete localized accessible names and tooltips in English/Chinese.
- No operational resource abbreviation remains.
- Board SVG has no visible terrain word/abbreviation nodes; desert has no resource icon.
- Resource-specific port shows icon plus ratio.
- Statistics remain scannable and semantically named.
- Keyboard/focus/disabled/selected states and mobile containment pass.
- Logs/rules retain natural-language resource names.

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

## Review Checkpoints

1. Cooldown math/blocker and removal of automatic trigger before any protocol change.
2. Setup grant atomicity before UI work.
3. Public v3 projection and no-payload authority before storage replacement.
4. Migration/no-partial-write and reconnect convergence before visual changes.
5. Shared resource mapping and operational controls before board SVG replacement.
6. Board/statistics/accessibility/mobile review before browser gates.
7. Whole-branch review and requirement convergence before completion claims.

## Known Transitional Constraint

The public protocol changes in T003 and the persisted room upgrade closes in T004. Main TypeScript/tests must remain green after T003; Worker build/release gates are not claimed until T004 completes the storage schema and fixture migration. No task may deploy the intermediate branch.
