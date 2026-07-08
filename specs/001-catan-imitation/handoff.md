# Handoff: Catan Imitation MVP

Date: 2026-07-08
Scope: MVP implementation through T001-T026

## Overview

Catan Imitation is now a local hot-seat TypeScript browser prototype. It recreates a recognizable online Catan-style table layout and adds the requested statistics panel plus Commerce Guild expansion.

## Implemented

- Vite + React + TypeScript scaffold.
- Pure TypeScript domain modules for board data, setup, production, building, scoring, turns, statistics, and Commerce Guild.
- Desktop-first game table UI:
  - central hex board
  - left utility rail
  - right log/chat/bank/player rail
  - bottom action bar
  - statistics and commerce panels
- Dice production with robber blocking.
- Clickable hexes for robber movement.
- Build road, settlement, and city commands for demo-valid targets.
- Score calculation from settlements, cities, and Commerce Guild prize cards.
- Statistics modes for player query, dice query, and expected income matrix.
- Commerce Guild:
  - three rotating trade slots
  - once-per-turn trade limit
  - token transfer
  - gathering resource redemption capped at 4 per player
  - auction round resolution with blind-box outcomes
  - voucher-to-prize redemption

## Verification

Commands run successfully:

```bash
pnpm test
pnpm build
```

Latest results:

- 4 test files passed.
- 11 tests passed.
- Production build completed with Vite.

Browser smoke checks:

- Desktop `1280x720`: app renders in one viewport, action bar visible, 19 hexes, 4 player panels, statistics panel, and Commerce Guild panel present.
- Mobile `390x844`: no horizontal overflow, 19 hexes render, statistics and Commerce Guild content remain reachable by vertical scroll.

## Known Limits

- Multiplayer is local hot-seat only.
- Board geometry is fixed and demo-oriented; it does not yet enforce full Catan settlement distance and road connectivity rules.
- Development cards are represented minimally for Commerce Guild rewards.
- Longest road, largest army, maritime port trading, and AI players remain stretch tasks.
- Visual assets are original CSS shapes and labels rather than polished production art.

## Next Steps

- Add full Catan build legality: settlement distance, road adjacency, and port trades.
- Add development card deck timing and card-specific effects.
- Add richer setup placement flow.
- Add GitHub Actions for `pnpm test` and `pnpm build`.
- Push to `https://github.com/Todesfuge/Catan-Imitation` after deciding branch policy.

