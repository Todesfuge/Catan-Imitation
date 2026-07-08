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

- [ ] S001 Longest road calculation.
- [ ] S002 Largest army and fuller development card timing.
- [ ] S003 Maritime trade UI using ports.
- [ ] S004 Simple bot action suggestions for non-human players.
- [ ] S005 Responsive mobile layout.

## Independent Acceptance Slices

- Slice 1: App runs and shows recognizable table layout.
- Slice 2: Dice production changes resources and scores remain visible.
- Slice 3: Statistics panel answers all three requested queries.
- Slice 4: Commerce Guild loop works from trade slot to prize scoring.
- Slice 5: Tests and handoff docs support review.
