# Tasks: Catan Imitation With Commerce Guild Expansion

Feature: 001-catan-imitation
Status: Implemented and verified through U046

## MVP Task List

- [x] T001 Create Vite + React + TypeScript project files.
- [x] T002 Add README with project purpose, run commands, and doc map.
- [x] T003 Add domain resource/player/board/game-state types in `src/domain/types.ts`.
- [x] T004 Add fixed standard board geometry and demo board data in `src/domain/board.ts`.
- [x] T005 Add initial game factory and demo preset in `src/domain/setup.ts`.
- [x] T006 Add dice production logic in `src/domain/rules/production.ts`.
- [x] T007 Add building cost and validation logic in `src/domain/rules/building.ts`.
- [x] T008 Add score calculation in `src/domain/rules/scoring.ts`.
- [x] T009 Add turn progression reducer in `src/app/gameReducer.ts`.
- [x] T010 Render desktop table layout with board, right rail, and bottom action bar.
- [x] T011 Render players, bank resources, log, and active turn state.
- [x] T012 Implement roll dice command and visible resource updates.
- [x] T013 Implement build road/settlement/city commands for demo-valid targets.
- [x] T014 Implement robber placement/blocking MVP.
- [x] T015 Add statistics selectors in `src/domain/stats/income.ts`.
- [x] T016 Add statistics panel with player, dice, and full matrix modes.
- [x] T017 Add Commerce Guild domain state machine in `src/domain/expansion/commerceGuild.ts`.
- [x] T018 Add trade slot UI with once-per-turn usage and slot refresh.
- [x] T019 Add token transfer UI and log events.
- [x] T020 Add guild gathering UI with resource redemption cap.
- [x] T021 Add three-round auction UI and blind-box resolution.
- [x] T022 Add voucher-to-prize redemption and score integration.
- [x] T023 Add unit tests for production and stats.
- [x] T024 Add unit tests for Commerce Guild transitions.
- [x] T025 Run build/test verification and record evidence.
- [x] T026 Add curated handoff note with implemented scope, limitations, and next steps.

## Stretch Tasks

- [x] U001 Add full setup placement flow.
- [x] U002 Enforce settlement distance and occupied-vertex legality.
- [x] U003 Enforce road connectivity and ownership legality.
- [x] U004 Implement full 7-roll robber flow.
- [x] U005 Add bank resource accounting and exhaustion handling.
- [x] U006 Implement game-over and winner flow.
- [x] U007 Implement development card deck and purchase flow.
- [x] U008 Implement knight cards and Largest Army.
- [x] U009 Implement Longest Road.
- [x] U010 Implement maritime trade and port benefits.
- [x] U011 Auto-trigger Commerce Guild gatherings by interval.
- [x] U012 Improve auction validation and result display.
- [x] U013 Integrate Commerce Guild development-card rewards with the real card deck.
- [x] U014 Improve token transfer UX and log naming.
- [x] U015 Connect left utility rail actions.
- [x] U016 Add guided phase prompts and error recovery.
- [x] U017 Improve board visual fidelity and inspectability.
- [x] U018 Add real local chat or remove chat affordance.
- [x] U019 Harden mobile layout.
- [x] U020 Add GitHub Actions CI.
- [x] U021 Add deployment.
- [x] U022 Add UI smoke tests.
- [x] U023 Add PR and issue templates.
- [x] U024 Add roadmap milestones.
- [x] U025 Normalize board topology to shared Catan vertices and edges.
- [x] U026 Separate board hexes visually and render road edges.
- [x] U027 Replace CSS-positioned board tiles with shared SVG board geometry.

## Core Rule Integrity Tasks

- [x] U028 Add failing active-player and dice-sequencing tests in `test/domain/turnFlow.test.ts` for CR-001 through CR-004.
- [x] U029 Add the typed turn state and shared authorization/phase gates in `src/domain/types.ts`, `src/domain/rules/turnFlow.ts`, `src/domain/setup.ts`, and `src/app/gameReducer.ts` until U028 passes.
- [x] U030 Add failing player-selected discard, robber placement, victim selection, random steal, and knight-resume tests in `test/domain/turnFlow.test.ts` for CR-005 through CR-009.
- [x] U031 Implement the staged seven/robber/knight flow in `src/domain/rules/turnFlow.ts`, `src/domain/rules/production.ts`, `src/domain/rules/developmentCards.ts`, and `src/app/gameReducer.ts` until U030 passes.
- [x] U032 Add phase-aware discard and robber controls in `src/ui/TurnFlowPanel.tsx`, `src/App.tsx`, and `src/styles/app.css`, with product assertions covering the new controls and disabled pre-roll actions.
- [x] U033 Add failing settlement-connectivity and Longest Road transition tests in `test/domain/ruleIntegrity.test.ts` for CR-010 through CR-013.
- [x] U034 Implement normal settlement road connectivity and complete Longest Road recomputation in `src/domain/rules/building.ts`, `src/domain/rules/longestRoad.ts`, and `src/app/gameReducer.ts` until U033 passes.
- [x] U035 Add failing Commerce Guild resource-conservation, short-bank, and integer-validation tests in `test/domain/commerceGuildIntegrity.test.ts` for CR-014 through CR-018.
- [x] U036 Implement local Commerce Guild bank-transfer and numeric-validation helpers in `src/domain/expansion/commerceGuild.ts`, preserving deterministic blind-box results, until U035 passes.
- [x] U037 Run focused integration and product checks for the complete CR-001 through CR-018 command flow; update `scripts/smoke-ui.mjs` only where the new visible workflow requires it.
- [x] U038 Run full test/build/Pages/smoke verification, update handoff and private worklog records, and record any remaining risks without marking deferred P2 work complete.

## P2 Completion Tasks

- [x] U039 Add failing development-card effect tests in `test/domain/developmentCardEffects.test.ts` for CR-019 through CR-025, including shared per-turn limits, purchase-turn rejection, sequential Road Building, Year of Plenty bank transfers, Monopoly, phase restoration, and atomic failure.
- [x] U040 Implement typed pending development effects and all standard card rules in `src/domain/types.ts`, `src/domain/rules/turnFlow.ts`, `src/domain/rules/developmentCards.ts`, `src/domain/rules/building.ts`, and `src/app/gameReducer.ts` until U039 passes.
- [x] U041 Add explicit development-card and pending-effect controls in `src/ui/DevelopmentCardPanel.tsx`, `src/App.tsx`, and `src/styles/app.css`, with product tests for card counts, legal road targets, resource choices, paused actions, and phase guidance.
- [x] U042 Add failing deterministic port topology, ownership, ratio, geometry, and presentation tests in `test/domain/portGameplay.test.ts` and `test/domain/productPolish.test.ts` for CR-026 through CR-030.
- [x] U043 Generate nine standard coastal ports and wire them into setup/demo games in `src/domain/board.ts`, `src/domain/setup.ts`, `src/domain/rules/maritimeTrade.ts`, and `src/ui/boardGeometry.ts` until U042 domain and geometry tests pass.
- [x] U044 Render SVG port labels/connectors and effective per-resource maritime ratios in `src/App.tsx` and `src/styles/app.css`; extend `scripts/smoke-ui.mjs` for the visible P2 contracts.
- [x] U045 Run focused integration, implementation review, and artifact convergence for CR-019 through CR-030 without marking networking, persistence, or generalized board generation complete.
- [x] U046 Run the complete test/build/Pages/smoke/render/diff gate, refresh handoff and private worklog records, then create one commit containing the existing CR-001 through CR-018 changes and the completed P2 work.

Detailed acceptance criteria for U001-U046 live in [update-backlog.md](update-backlog.md).

## Independent Acceptance Slices

- Slice 1: App runs and shows recognizable table layout.
- Slice 2: Dice production changes resources and scores remain visible.
- Slice 3: Statistics panel answers all three requested queries.
- Slice 4: Commerce Guild loop works from trade slot to prize scoring.
- Slice 5: Tests and handoff docs support review.
