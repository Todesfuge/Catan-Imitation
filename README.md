# Catan Imitation

[简体中文](README.zh-CN.md)

TypeScript, React, and Cloudflare Workers implementation of a Catan-like board-game table with an original Commerce Guild expansion.

## Current Scope

- Local Game for four-player hot-seat play and Online Game for anonymous private rooms with three or four seats.
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
pnpm test:worker
pnpm test:e2e
pnpm build
pnpm build:worker
pnpm smoke:worker
pnpm smoke:ui
```

The app is designed for `http://127.0.0.1:5173/` during local development.

## Play Online

[Open the production game](https://catan-imitation.catan-imitation.workers.dev/). The mode selector starts either Local Game or Online Game. English is the default interface language; Settings can switch the current browser session to Simplified Chinese.

Online rooms are private and anonymous. A host creates a six-character room code, and three or four players join by code before starting. There are no user accounts or public matchmaking. Each seat is protected by an origin-local bearer credential stored by the browser, so reopening the room on the same browser origin can reconnect to the latest server state. Clearing site storage loses that seat credential, and the anonymous first version does not support cross-device seat recovery. Inactive rooms expire after 24 hours; active connections defer expiry.

## Cloudflare Deployment

Cloudflare Workers Builds deploys GitHub `main`. The Worker serves the SPA and room API from one origin, while a Durable Object owns each room's authoritative state and WebSocket connections.

```bash
pnpm build:worker
pnpm exec wrangler deploy
pnpm exec wrangler deploy --name catan-imitation-preview
```

This project deploys preview builds to the separate `catan-imitation-preview` Worker because version preview URLs are not suitable for its Durable Object binding. Roll back production from the Cloudflare Worker deployment/version history by promoting the last verified version. GitHub Pages publishing has been retired so there is only one production host; the former Pages address now returns HTTP 404.

## Documentation Map

- [Feature spec](specs/001-catan-imitation/spec.md)
- [Implementation plan](specs/001-catan-imitation/plan.md)
- [Task list](specs/001-catan-imitation/tasks.md)
- [Quickstart](specs/001-catan-imitation/quickstart.md)
- [Online multiplayer quickstart](specs/002-cloudflare-online-multiplayer/quickstart.md)
- [Roadmap](docs/roadmap.md)
- [Project constitution](.specify/memory/constitution.md)

## Engineering Notes

Game rules live in pure TypeScript modules under `src/domain`. React components render state and dispatch typed commands through `src/app/gameReducer.ts`. In Online Game, the Cloudflare Worker and per-room Durable Object validate commands, persist short-lived room state, and return caller-specific projections.

The project intentionally excludes accounts, matchmaking, cross-device credential recovery, long-term saved games, AI players, generalized random boards, and exact proprietary artwork.
