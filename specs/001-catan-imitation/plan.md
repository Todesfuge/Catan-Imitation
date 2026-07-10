# Implementation Plan: Catan Imitation With Commerce Guild Expansion

Created: 2026-07-08
Workflow phase: Technical Plan
Last updated: 2026-07-10
Status: Frontend repair implemented and verified through U059

## Recommended Approach

Use Vite + React + TypeScript for a single-page local hot-seat prototype named Catan Imitation. Keep all game rules in pure TypeScript modules under `src/domain`, and make React a rendering and command-dispatch layer.

## GitHub Sync Target

- Remote repository: `https://github.com/Todesfuge/Catan-Imitation`
- Local remote name: `origin`
- Branch policy for implementation: keep work committed locally first, then push to GitHub after build/test evidence exists.

This approach best fits the two-hour challenge because it produces a playable browser demo quickly while still showing engineering discipline: typed state, pure reducers, testable logic, and clean UI/domain separation.

## Architecture

```text
src/
  App.tsx                         # React table, panels, and command wiring
  app/
    gameReducer.ts                # typed command reducer and domain orchestration
  domain/
    types.ts                      # shared domain types
    board.ts                      # fixed board topology and geometry data
    setup.ts                      # initial game creation and demo presets
    rules/
      production.ts               # dice/resource production and robber handling
      building.ts                 # build validation and costs
      scoring.ts                  # victory points
      turns.ts                    # player/round progression
      developmentCards.ts         # deck, purchase, knight, and Largest Army
      longestRoad.ts              # route calculation and award
      maritimeTrade.ts            # bank and port trade ratios
    stats/
      income.ts                   # player query, dice query, full matrix
    expansion/
      commerceGuild.ts            # trade slots, tokens, gathering, auction, prizes
  ui/
    boardGeometry.ts              # shared SVG board projection
  styles/
    app.css                       # full responsive product styling
```

## Data Flow

1. UI dispatches typed commands such as `ROLL_DICE`, `BUILD_SETTLEMENT`, `COMPLETE_TRADE_SLOT`, or `RESOLVE_AUCTION`.
2. `gameReducer` delegates rule decisions to domain modules.
3. Domain modules return updated immutable state plus log events.
4. UI panels render derived selectors such as score, available actions, income tables, and commerce status.
5. Tests call domain functions directly without React.

## UI Plan

- Board: CSS/SVG-rendered hex map with fixed axial coordinates and clickable vertices/edges.
- Right column: log/activity panel, bank resource row, and player panels.
- Bottom bar: active action, timer-like display, build buttons, development card button, end turn.
- Statistics panel: tabbed panel with player, dice, and matrix modes.
- Commerce panel: three trade slots, token transfer controls, gathering phase controls, auction rounds, blind-box result log.

## Two-Hour Execution Priority

### Phase A: Foundation and Docs

- Initialize project, TypeScript config, Vite/React scaffold, test runner.
- Add README and project docs pointing to Spec Kit artifacts.
- Build core domain types and fixed demo board.

### Phase B: Playable Core

- Render board and player panels.
- Implement local turn state, dice roll, production, resource updates, build costs, and scoring.
- Add basic robber blocking; full discard/steal polish is secondary.

### Phase C: Requested Differentiators

- Implement statistics selectors and panel.
- Implement Commerce Guild domain module and UI.
- Add deterministic tests for production, stats, and expansion.

### Phase D: Polish and Handoff

- Improve visual layout to match screenshot density.
- Add smoke-check instructions.
- Record verification evidence and known limitations.

## Testing Strategy

- Unit tests:
  - production from dice total with settlements/cities and robber
  - player income query
  - dice income query
  - full expected matrix totals
  - trade slot once-per-turn limit and refresh
  - guild redemption cap
  - auction tie resolution
  - voucher to prize conversion and score contribution
- Build/type check:
  - `pnpm build`
  - `pnpm test`
- Manual smoke:
  - open app
  - place/build or use demo preset
  - roll dice and observe resource changes
  - inspect stats panel before and after robber movement
  - complete one trade slot
  - trigger gathering, redeem resources, run three auctions, redeem prize

## Risks and Mitigations

- Risk: board interaction consumes too much time.
  - Mitigation: use fixed geometry and demo presets; favor clickable nodes over drag-and-drop.
- Risk: rules become tangled in React components.
  - Mitigation: write domain modules first and keep UI dispatch-only.
- Risk: commerce expansion UI is too broad.
  - Mitigation: represent each phase as a compact state machine and log every transition.
- Risk: visual fidelity lags behind rules.
  - Mitigation: match layout proportions and information hierarchy first; use original simple icons/colors.

## Constitution Check

- Playable core prioritized before decorative completeness.
- Domain logic is planned as pure TypeScript.
- UI and rules boundaries are explicit.
- Verification commands and smoke checks are defined.
- Two-hour exclusions are explicit.

## Current Update Plan: Core Rule Integrity Hardening

### Scope

Implement CR-001 through CR-018 from `spec.md`: strict turn sequencing, player-selected seven-roll discards, staged robber resolution, normal settlement road connectivity, correct Longest Road ownership, and Commerce Guild bank conservation. Development-card completeness, playable port placement, online multiplayer, persistence, and unrelated UI refactoring remain outside this update.

### Boundary Decision

- `src/domain/rules/turnFlow.ts` becomes the single owner of turn-phase transitions, turn-owned command authorization, seven-roll discard progress, robber placement, victim eligibility, and phase resumption.
- `src/app/gameReducer.ts` remains a thin command router. It generates dice/random values, delegates to domain functions, composes logs, and updates view-only state; it does not duplicate transition rules.
- `src/ui/TurnFlowPanel.tsx` owns the new hot-seat discard and robber-victim controls so the existing `App.tsx` catch-all does not absorb another stateful workflow.
- Existing owner modules retain their responsibilities: `building.ts` validates placement, `longestRoad.ts` calculates/awards routes, and `commerceGuild.ts` owns guild resource movement.
- No generic event engine, service layer, resource repository, or new dependency will be introduced.

### Planned File Map

```text
src/domain/types.ts                       # typed turn/discard/robber state
src/domain/rules/turnFlow.ts              # new turn-flow owner module
src/domain/rules/production.ts            # production plus discard/steal primitives
src/domain/rules/developmentCards.ts      # knight consumption without direct free-form robber movement
src/domain/rules/building.ts              # normal settlement-to-road requirement
src/domain/rules/longestRoad.ts           # complete award transition rules
src/domain/expansion/commerceGuild.ts     # local bank-transfer and integer validation helpers
src/app/gameReducer.ts                    # command orchestration and logs
src/ui/TurnFlowPanel.tsx                  # discard and victim-selection UI
src/App.tsx                               # phase-aware wiring and action availability
src/styles/app.css                        # compact turn-flow panel styling
test/domain/turnFlow.test.ts              # CR-001 through CR-009
test/domain/ruleIntegrity.test.ts          # CR-010 through CR-013
test/domain/commerceGuildIntegrity.test.ts # CR-014 through CR-018
```

### State and Data Flow

1. A new game or completed setup starts in `awaitingRoll`.
2. `ROLL_DICE` is accepted once in `awaitingRoll`. A non-seven roll applies production and enters `action`.
3. A seven records exact discard obligations. Players with obligations submit validated resource maps; each accepted discard returns cards to the bank.
4. After all obligations clear, the active player enters `awaitingRobberPlacement`, chooses a different hex, then enters `awaitingRobberVictim` only when eligible opponents with cards exist.
5. Victim selection steals one random resource and resumes `action`. Knight play uses the same robber flow but resumes either `awaitingRoll` or `action` according to its origin.
6. Turn-owned commands call one shared authorization gate before invoking their existing domain function. `END_TURN` is legal only from `action`, advances the active player, resets turn flow, and clears the previous dice display.
7. Road or settlement changes are followed by Longest Road recomputation before score/winner evaluation.
8. Commerce Guild resource operations calculate a validated transfer, check bank/player availability, and return one immutable game/guild result. Blind-box outcomes store and describe the quantity actually awarded.

### Error Handling

- Reject unknown players, wrong phases, wrong active player, repeated rolls, incomplete/invalid discards, same-hex robber moves, ineligible victims, disconnected settlements, unavailable bank resources, and non-finite/fractional quantities before producing updated state.
- Preserve the existing reducer-to-toast path for recoverable local errors.
- Keep random choice injectable in domain functions so failure and success cases remain deterministic in tests.

### Test Strategy

- Red-green TDD for each task group: turn authorization, seven/robber flow, settlement/Longest Road, then Commerce bank accounting.
- Focused commands:
  - `pnpm test -- test/domain/turnFlow.test.ts`
  - `pnpm test -- test/domain/ruleIntegrity.test.ts`
  - `pnpm test -- test/domain/commerceGuildIntegrity.test.ts`
- Regression gate: `pnpm test`.
- Delivery gate: `pnpm build`, `pnpm build:pages`, and `pnpm smoke:ui`.
- Manual quickstart: verify pre-roll controls, player-selected discards, robber placement/victim selection, and post-resolution action recovery.

### Minimalism and Constitution Check

- Rung: direct changes to existing owner modules plus one required domain boundary and one bounded UI component.
- No dependency, framework, generic state-machine library, or speculative configuration is added.
- Pure rules remain under `src/domain`; React renders state and dispatches typed commands.
- The reducer and `App.tsx` gain orchestration/wiring only, not duplicated business rules.
- Every CR requirement maps to a focused test before its implementation task can be completed.

## Current Update Plan: P2 Development Cards and Playable Ports

### Scope

Implement CR-019 through CR-030 from `spec.md`: the remaining standard development-card effects, one-card-per-turn enforcement, deterministic standard ports, port ownership and ratios, explicit effect controls, and SVG port presentation. Networking, persistence, generalized effect engines, randomized board generation, and unrelated UI redesign remain outside this update.

### Boundary Decision

- Extend the existing typed turn-flow state with one discriminated `PendingDevelopmentEffect`; do not introduce a second state machine or generic card framework.
- `developmentCards.ts` owns card validation, consumption, Year of Plenty and Monopoly transfers, and effect-start rules.
- `building.ts` exposes one cost-free road-placement path that reuses normal road legality; Longest Road and winner orchestration remains in the reducer.
- `board.ts` owns deterministic standard port data derived from coastal topology. `maritimeTrade.ts` continues to calculate ownership and ratios from current buildings.
- A bounded `DevelopmentCardPanel.tsx` owns card/effect selection UI. `App.tsx` only renders board targets, ratios, and dispatch wiring.
- Existing shared SVG projection helpers remain the source for board endpoint and port connector coordinates.

### Planned File Map

```text
src/domain/types.ts                         # pending development effect and per-turn card flag
src/domain/board.ts                         # deterministic nine-port coastal plan
src/domain/setup.ts                         # demo/setup games receive standard ports
src/domain/rules/developmentCards.ts        # all standard card effects and validation
src/domain/rules/building.ts                # free road placement with shared legality
src/domain/rules/turnFlow.ts                # development-effect phase/resume transitions
src/domain/rules/maritimeTrade.ts           # verified best-ratio lookup
src/app/gameReducer.ts                      # typed card/effect commands and winner orchestration
src/ui/DevelopmentCardPanel.tsx             # explicit card/resource choices
src/ui/boardGeometry.ts                     # port label/connector projection helper
src/App.tsx                                 # clickable Road Building targets and ratio display
src/styles/app.css                          # card panel, port markers, responsive states
test/domain/developmentCardEffects.test.ts  # CR-019 through CR-025
test/domain/portGameplay.test.ts             # CR-026 through CR-030 domain/geometry coverage
test/domain/productPolish.test.ts            # visible controls and port rendering
scripts/smoke-ui.mjs                         # built-bundle P2 contracts
```

### State and Data Flow

1. The active player selects a playable non-victory card during `awaitingRoll` or `action`. Validation checks ownership, purchase turn, and the current turn's shared card-play limit before consuming it.
2. A Knight enters the existing robber flow. Other cards enter `awaitingDevelopmentEffect` with a typed pending effect and the origin phase as `resumePhase`.
3. Road Building recomputes legal candidate edges after each free placement, recalculates Longest Road and winner state, and finishes after two roads or when none remain.
4. Year of Plenty transfers one selected available bank card per choice and finishes after two selections or when bank stock is empty.
5. Monopoly resolves after one resource choice by transferring that resource from all opponents to the active player.
6. Effect completion restores the recorded origin phase while retaining the one-card-per-turn flag. Ending the turn resets that flag for the next player.
7. Standard board creation identifies coastal edges, assigns nine deterministic two-vertex ports, and stores them in every standard game. Maritime ratios remain derived from buildings at those endpoints.
8. The UI reads pending effect state, legal road candidates, owned-card counts, and per-resource trade ratios; all changes still pass through typed reducer commands.

### Error Handling

- Reject wrong players, wrong phases, same-turn cards, a second non-victory card, mismatched card kinds, illegal road edges, unavailable bank resources, and invalid resource choices before returning updated state.
- Preserve the reducer-to-toast recovery path and immutable caller-owned inputs.
- End Road Building or Year of Plenty automatically only when the domain proves no legal target remains; do not auto-select on the player's behalf.

### Test Strategy

- Red-green TDD in two slices: development-card effects first, then port topology/gameplay/UI.
- Focused commands:
  - `pnpm exec vitest run test/domain/developmentCardEffects.test.ts`
  - `pnpm exec vitest run test/domain/portGameplay.test.ts test/domain/productPolish.test.ts`
- Review each slice before marking its implementation task complete.
- Final delivery gate: `pnpm test`, `pnpm build`, `pnpm build:pages`, `pnpm smoke:ui`, rendered desktop/mobile inspection, and `git diff --check`.
- After convergence, update handoff/worklog records and create one commit containing CR-001 through CR-030 work as requested.

### Minimalism and Constitution Check

- Rung: direct extensions to existing owner modules plus one bounded UI component.
- No dependency, generic effect engine, port-ownership cache, or randomized board generator is added.
- Game rules remain pure TypeScript and React remains a state renderer/command dispatcher.
- Every P2 requirement maps to a focused test before implementation.

## Current Update Plan: Frontend Completeness and Recovery

### Scope

Implement CR-031 through CR-042 in priority order: recoverable command execution first; shared action availability and explicit choices second; setup, game-over, and Commerce Guild completion third; accessibility and responsive repair fourth; browser regression coverage and visual convergence last. Networking, persistence, AI players, randomized boards, and a global state-machine rewrite remain out of scope.

### Boundary Decision

- Keep existing domain rule modules authoritative and throwing on invalid direct calls. Split `gameReducer.ts` into an exported safe reducer boundary and one internal command executor so React receives unchanged state plus a notice instead of an exception.
- Add one bounded application selector for availability, reasons, costs/ratios, and legal targets. It composes existing domain functions and does not reimplement rules.
- Extract the current action bar, Commerce Guild panel, board target overlay, and utility modal from `App.tsx`. `App.tsx` retains shell composition and short-lived interaction-mode wiring only.
- Use a discriminated UI interaction mode for road, settlement, city, maritime, and setup choices. Game legality and committed state remain in domain/reducer state.
- Reuse `createSetupGame`, setup placement rules, board projection helpers, and the existing Commerce Guild accounting functions.
- Use the native dialog platform behavior for focus containment, Escape, and restoration rather than adding a component framework.
- Add `@playwright/test` as the only new dependency because the reproduced failure occurs specifically across the React/browser reducer boundary and cannot be proven by server rendering or bundle text inspection.

### Planned File Map

```text
src/app/gameReducer.ts                    # safe command boundary, new-game/setup commands
src/app/actionAvailability.ts             # composed UI availability and legal-target selector
src/domain/rules/building.ts              # reusable legal settlement/city/setup target queries
src/ui/ActionDock.tsx                     # action modes, costs, reasons, explicit maritime choices
src/ui/BoardActionTargets.tsx             # normal and setup SVG edge/vertex/building targets
src/ui/CommercePanel.tsx                  # valid recipients and per-player gathering redemption
src/ui/UtilityDialog.tsx                  # native dialog and New Game control
src/App.tsx                               # shell composition and interaction-mode wiring
src/styles/app.css                        # disabled/touch/focus/live/responsive/board polish
test/domain/frontendRecovery.test.ts      # CR-031-CR-037 reducer/selector regression tests
test/domain/productPolish.test.ts         # CR-038-CR-041 source/render contracts
test/e2e/frontend-recovery.spec.ts        # CR-031/033-042 real browser flows
playwright.config.ts                      # local/CI web-server and viewport configuration
.github/workflows/ci.yml                  # Playwright browser install and test command
scripts/smoke-ui.mjs                      # stable built-bundle contracts
```

### State and Data Flow

1. `gameReducer` invokes the internal command executor. Success returns the next application state with no notice; a caught rule error returns the original gameplay/guild data with a normalized notice.
2. `actionAvailability` derives all visible action states from the current game, active player, bank, ports, guild state, and reusable domain target queries.
3. Selecting an enabled action changes only the local interaction mode. The board overlay renders its legal targets; selecting one dispatches the typed command and clears the mode after success or phase/turn change.
4. Maritime selection stays local until both resources form a legal trade, then dispatches the existing command with the explicit pair.
5. New Game replaces demo state with `createSetupGame`, resets Commerce Guild and UI selection data, and exposes setup targets until the existing snake-order domain flow reaches normal play.
6. Commerce controls derive valid recipients and the selected gathering participant from current players, resetting local selections whenever their source state becomes invalid.
7. Dialog, notice, log, labels, and selected-mode semantics expose the same visible state to keyboard and assistive-technology users.

### Error Handling

- Catch only expected command/rule errors at the reducer boundary; do not use an Error Boundary to hide them.
- Preserve all caller-owned gameplay and guild structures after rejection and keep the notice outside rule calculations.
- Disable known-invalid actions before dispatch while retaining reducer validation as the final authority.
- Reserve an Error Boundary for unknown rendering faults only if a separate reproduced need appears; it is not part of this update.

### Test Strategy

- U047-U048: reproduce and fix the blank-root command failure with a focused reducer test, then confirm it in Playwright.
- U049-U051: write availability/target tests before the selector and explicit ActionDock/board/maritime UI.
- U052-U053: write setup/new-game/game-over tests before reducer and target integration.
- U054-U055: write Commerce, accessibility, guidance, and responsive tests before component/CSS changes.
- U056: add Playwright configuration and critical flows; confirm each new browser test fails for the expected pre-fix reason before its production slice.
- Final gate: `pnpm test`, `pnpm test:e2e`, `pnpm build`, `pnpm build:pages`, `pnpm smoke:ui`, rendered 1280/768/390 review, and `git diff --check`.

### Minimalism and Constitution Check

- Rung: reuse existing domain rules and native dialog behavior, then add direct bounded application/UI modules where the current monolith cannot safely absorb more responsibility.
- One justified dependency is added for a reproduced browser-only regression and approved responsive interaction coverage.
- No generic event bus, form framework, UI kit, state-machine library, or duplicated rule engine is introduced.
- `App.tsx` must lose responsibilities overall; it may not gain new rule or Commerce Guild business logic.
