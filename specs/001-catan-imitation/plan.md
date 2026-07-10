# Implementation Plan: Catan Imitation With Commerce Guild Expansion

Created: 2026-07-08
Workflow phase: Technical Plan
Last updated: 2026-07-10
Status: Implemented and verified through U046

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
