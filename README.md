# Catan Imitation

[简体中文](README.zh-CN.md)

TypeScript, React, and Cloudflare Workers implementation of a Catan-like board-game table with an original Commerce Guild expansion.

## Current Scope

- Local Game for four-player hot-seat play and Online Game for anonymous private rooms with three or four seats.
- Every new game uses a randomized standard 19-hex map with the standard terrain, number-token, and port multisets.
- Local Game opens in a real empty setup with four players, no prebuilt pieces or resources, and snake-order settlement/road placement.
- A public canonical `M1-` seed lets every browser reconstruct the same terrain, numbers, ports, and stable geometry.
- Catan-like dice production, staged robber flow, build costs, scoring, and enforced turn progression.
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

## Seeded Maps and Restarts

Settings displays the canonical map seed to every Local or Online player and provides a localized copy action. The seed stays selectable as a manual copy fallback if clipboard permission is unavailable. `Replay Current Map` resets all gameplay and Commerce Guild state while retaining the seed and layout; `New Random Map` performs the same atomic reset with a new `M1-` seed and layout. Both paths return to a clean snake-order setup.

Only the Online host can restart, and each restart requires inline confirmation. Participants can inspect and copy the seed but cannot invoke a restart; the server independently enforces that authority and broadcasts one converged room version after an accepted command.

`M0-STANDARD` is migration-only compatibility for an exact legacy fixed-board room. It preserves the released legacy geometry and live gameplay references, is never generated for a new match, and unknown or altered legacy boards are rejected without a partial write.

## Cloudflare Deployment

Cloudflare Workers Builds deploys GitHub `main`. The Worker serves the SPA and room API from one origin, while a Durable Object owns each room's authoritative state and WebSocket connections.

This release upgrades room storage schema v2 and wire protocol v2 together. Deploy the Worker and SPA as one release: compatible v1 lobbies and exact legacy fixed-board rooms migrate automatically, while incompatible old clients follow the refresh/recovery path instead of receiving a partial projection.

```bash
pnpm build:worker
pnpm exec wrangler deploy
pnpm exec wrangler deploy --name catan-imitation-preview
```

This project deploys preview builds to the separate `catan-imitation-preview` Worker because version preview URLs are not suitable for its Durable Object binding. For recovery, switch traffic only to a previously verified schema-v2-compatible deployment. After any room has migrated to schema v2, never roll back to a schema-v1 binary; use a compatible v2 deployment or roll forward with a corrective release. GitHub Pages publishing has been retired so there is only one production host; the former Pages address now returns HTTP 404.

## Documentation Map

- [Feature spec](specs/001-catan-imitation/spec.md)
- [Implementation plan](specs/001-catan-imitation/plan.md)
- [Task list](specs/001-catan-imitation/tasks.md)
- [Quickstart](specs/001-catan-imitation/quickstart.md)
- [Online multiplayer quickstart](specs/002-cloudflare-online-multiplayer/quickstart.md)
- [Seeded random maps spec](specs/003-seeded-random-maps/spec.md)
- [Seeded random maps quickstart](specs/003-seeded-random-maps/quickstart.md)
- [Seeded random maps verification](specs/003-seeded-random-maps/verification.md)
- [Roadmap](docs/roadmap.md)
- [Project constitution](.specify/memory/constitution.md)

## Engineering Notes

Game rules live in pure TypeScript modules under `src/domain`. React components render state and dispatch typed commands through `src/app/gameReducer.ts`. In Online Game, the Cloudflare Worker and per-room Durable Object validate commands, persist short-lived room state, and return caller-specific projections.

The project intentionally excludes accounts, matchmaking, cross-device credential recovery, long-term saved games, AI players, non-standard board sizes/topologies, and exact proprietary artwork.
