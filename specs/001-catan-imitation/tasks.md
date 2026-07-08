# Tasks: Catan Imitation With Commerce Guild Expansion

Feature: 001-catan-imitation
Status: Draft for implementation

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
- [ ] U020 Add GitHub Actions CI.
- [ ] U021 Add deployment.
- [ ] U022 Add UI smoke tests.
- [ ] U023 Add PR and issue templates.
- [ ] U024 Add roadmap milestones.

Detailed acceptance criteria for U001-U024 live in [update-backlog.md](update-backlog.md).

## Independent Acceptance Slices

- Slice 1: App runs and shows recognizable table layout.
- Slice 2: Dice production changes resources and scores remain visible.
- Slice 3: Statistics panel answers all three requested queries.
- Slice 4: Commerce Guild loop works from trade slot to prize scoring.
- Slice 5: Tests and handoff docs support review.
