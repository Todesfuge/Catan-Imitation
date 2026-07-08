# Implementation Plan: Catan Imitation With Commerce Guild Expansion

Created: 2026-07-08
Workflow phase: Technical Plan

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
  domain/
    types.ts              # shared domain types
    board.ts              # fixed board geometry, ports, vertices, edges
    setup.ts              # initial game creation and demo presets
    rules/
      production.ts       # dice/resource production and robber blocking
      building.ts         # build validation and costs
      scoring.ts          # victory points
      turns.ts            # phase and turn progression
    stats/
      income.ts           # player query, dice query, full matrix
    expansion/
      commerceGuild.ts    # trade slots, tokens, gathering, auction, prizes
    random.ts             # injectable random helpers
  app/
    gameReducer.ts        # command reducer wrapping domain rules
    useGame.ts            # React hook/state adapter
  ui/
    Board/
    Panels/
    Actions/
    Stats/
    CommerceGuild/
  styles/
    tokens.css
    app.css
```

## Data Flow

1. UI dispatches typed commands such as `ROLL_DICE`, `BUILD_SETTLEMENT`, `COMPLETE_TRADE_SLOT`, or `PLACE_AUCTION_BID`.
2. `gameReducer` delegates rule decisions to domain modules.
3. Domain modules return updated immutable state plus log events.
4. UI panels render derived selectors such as score, available actions, income tables, and commerce status.
5. Tests call domain functions directly without React.

## UI Plan

- Board: CSS/SVG-rendered hex map with fixed axial coordinates and clickable vertices/edges.
- Right column: log/help panel, chat header/input shell, bank resource row, player panels.
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
  - `npm run build`
  - `npm test` or `npm run test`
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
