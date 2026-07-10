# Catan Imitation

[简体中文](README.zh-CN.md)

TypeScript portfolio prototype for a Catan-like online board-game table with an original Commerce Guild expansion.

## Current Scope

- Local hot-seat browser prototype.
- Catan-like 19-hex board, dice production, staged robber flow, build costs, scoring, and enforced turn progression.
- All standard development-card effects with explicit player choices and one non-victory card per turn.
- Nine deterministic coastal ports with building-derived 4:1, 3:1, and 2:1 maritime ratios.
- Statistics panel:
  - player income by dice total
  - dice-total distribution across players
  - full expected income matrix
- Public multi-resource player offers that any eligible opponent can accept during the active player's action phase.
- English interface by default with a session-persistent Simplified Chinese option in Settings.
- Commerce Guild expansion:
  - three shared trade slots
  - once-per-turn resource-to-token trades
  - token transfer
  - gathering redemption phase
  - three-round blind-box auction flow
  - voucher-to-prize-card redemption

## Commands

```bash
pnpm install
pnpm dev -- --port 5173
pnpm test
pnpm test:e2e
pnpm build
pnpm build:pages
pnpm smoke:ui
```

The app is designed for `http://127.0.0.1:5173/` during local development.

## Deployment

GitHub Pages deployment target: [https://todesfuge.github.io/Catan-Imitation/](https://todesfuge.github.io/Catan-Imitation/)

The deployment workflow runs `pnpm build:pages`, which builds the Vite app with the `/Catan-Imitation/` base path and publishes the `dist` artifact from `main`.

## Documentation Map

- [Feature spec](specs/001-catan-imitation/spec.md)
- [Implementation plan](specs/001-catan-imitation/plan.md)
- [Task list](specs/001-catan-imitation/tasks.md)
- [Quickstart](specs/001-catan-imitation/quickstart.md)
- [Roadmap](docs/roadmap.md)
- [Project constitution](.specify/memory/constitution.md)

## Engineering Notes

Game rules live in pure TypeScript modules under `src/domain`. React components render state and dispatch typed commands through `src/app/gameReducer.ts`.

The first version intentionally excludes real-time multiplayer, accounts, persistence, and exact proprietary artwork.
