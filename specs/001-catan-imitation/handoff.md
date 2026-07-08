# Handoff: Catan Imitation MVP

Date: 2026-07-08
Scope: MVP implementation through T001-T026, plus U001-U024 core, classic-system, Commerce Guild, product-polish, and delivery-automation updates

## Overview

Catan Imitation is now a local hot-seat TypeScript browser prototype. It recreates a recognizable online Catan-style table layout and adds the requested statistics panel plus Commerce Guild expansion.

## Implemented

- Vite + React + TypeScript scaffold.
- Pure TypeScript domain modules for board data, setup, production, building, scoring, turns, statistics, development cards, longest road, maritime trade, and Commerce Guild.
- Desktop-first game table UI:
  - central hex board
  - left utility rail
  - right log/activity/bank/player rail
  - bottom action bar
  - statistics and commerce panels
- Connected utility rail actions:
  - settings modal
  - rulebook modal
  - project info modal
  - browser fullscreen request with recoverable fallback
- Action-bar phase guidance and recoverable toast errors.
- Improved board inspectability with terrain badges, readable terrain names, number-token pips, robber marker, settlements, and cities.
- Activity summary replacing the earlier nonfunctional chat affordance.
- Mobile/tablet layout hardening for stacked panels and compact two-column controls.
- Dice production with robber blocking.
- Setup placement phase with settlement-road pairs in snake order.
- Clickable hexes for robber movement.
- Build road, settlement, and city commands with occupied-location, settlement-distance, and road-connectivity checks.
- Bank-aware production and build-cost accounting, including short-bank production caps.
- 7-roll handling for over-limit discards, robber movement, and optional stealing from adjacent opponents.
- Game-over state and winner id once the active player reaches the target score.
- Development card deck purchase flow, hidden card ownership, knight play timing, and Largest Army scoring.
- Longest Road calculation and scoring, including branch and opponent-building breaks.
- Maritime trade with default 4:1, owned generic 3:1, and owned resource-specific 2:1 ratios.
- Score calculation from settlements, cities, development victory points, Largest Army, Longest Road, and Commerce Guild prize cards.
- Statistics modes for player query, dice query, and expected income matrix.
- Commerce Guild:
  - three rotating trade slots
  - once-per-turn trade limit
  - token transfer
  - gathering resource redemption capped at 4 per player
  - automatic gathering trigger every six completed rounds
  - auction validation with player-name errors and visible result summaries
  - auction round resolution with blind-box outcomes
  - development-card rewards drawn from the shared deck
  - voucher-to-prize redemption
- Delivery automation:
  - GitHub Actions CI for install, tests, production build, and UI smoke
  - GitHub Pages deployment workflow using `pnpm build:pages` for `https://todesfuge.github.io/Catan-Imitation/`
  - stable `pnpm smoke:ui` preview smoke command
  - PR, bug report, and feature request templates
  - milestone roadmap in `docs/roadmap.md`

## Verification

Commands run successfully:

```bash
pnpm test
pnpm build
pnpm build:pages
pnpm smoke:ui
```

Latest results:

- 9 test files passed.
- 31 tests passed.
- Production build completed with Vite.
- UI smoke command completed against the built Vite preview.

Browser smoke checks:

- Desktop `1280x720`: app renders, no horizontal overflow, utility labels present, 19 hexes, 19 terrain badges, 18 dice-pip groups, Activity panel, phase guidance, statistics panel, and Commerce Guild panel present.
- Utility modal: Settings opens a visible dialog with active player, target score, round, and guild phase; close control is present.
- Mobile `390x844`: no horizontal overflow, 19 hexes render, Activity and phase guidance remain visible.
- Tablet `768x1024`: no horizontal overflow, 19 hexes render, Activity and phase guidance remain visible.

## Known Limits

- Multiplayer is local hot-seat only.
- Board geometry is fixed and demo-oriented; follow-up work is still needed for true shared intersections across neighboring hexes.
- Commerce Guild UI controls are functional but still compact; deeper visual polish and browser-level click-flow automation remain follow-up work.
- AI players remain out of scope.
- Visual assets are original CSS shapes and labels rather than polished production art.

## Next Steps

- Follow the future milestones in [Roadmap](../../docs/roadmap.md).
- Enable GitHub Pages for the repository if the Pages environment is not already active.
