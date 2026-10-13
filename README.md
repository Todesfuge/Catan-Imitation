# Catan Imitation

[简体中文](README.zh-CN.md) · [Play online](https://catan-imitation.catan-imitation.workers.dev/)

A browser board game built with TypeScript, React, Vite, and Cloudflare Workers. The base game follows Catan-style rules. The original Commerce Guild expansion adds token trading, resource redemption, and sealed auctions.

## Features

- Local Game supports four players sharing one browser. Online Game supports three or four players in an anonymous private room.
- Each new game starts with an empty board and snake-order setup. Every player's second setup settlement grants resources from adjacent producing hexes.
- The standard 19-hex map is randomized. A public `M1-` map seed reproduces its layout. Settings provides seed copying and confirmed same-map or new-map restarts. Only the Online host can restart.
- Base rules include resource production, robber resolution, building, development cards, maritime trade, player trade, scoring, and a default target of 10 points.
- The Commerce Guild provides three trade slots, tokens, a table-wide gathering cooldown, resource redemption, three sealed auction rounds, vouchers, and prize cards.
- The game includes an in-game rulebook, income statistics, and accessible resource icons.
- The interface defaults to English. Settings provides Simplified Chinese. The responsive web interface supports desktop, tablet, and mobile browsers.

## Technology

| Layer | Implementation |
| --- | --- |
| Frontend | React, TypeScript, Vite, and responsive CSS |
| Game rules | Shared TypeScript modules for Local and Online play |
| Backend | Cloudflare Worker with HTTP room endpoints and WebSockets |
| Database | SQLite-backed Durable Objects; one object stores each room through the storage API |
| Hosting | One Worker serves the frontend and backend from the same origin |

The Online server validates player commands and stores the authoritative room state. Each player receives a separate view that protects opponents' hands and sealed bids. Local Game runs in browser memory and does not use the Online database.

## Quick start

Use Node.js 22 or newer and pnpm 11.7.0, as declared in [package.json](package.json).

```bash
pnpm install --frozen-lockfile
pnpm dev -- --port 5173
```

Open [http://127.0.0.1:5173/](http://127.0.0.1:5173/) for frontend development and Local Game. To develop Online Game with the frontend and backend on one origin, stop that server and run:

```bash
pnpm dev:worker
```

Open [http://127.0.0.1:8787/](http://127.0.0.1:8787/). Local development does not require Cloudflare account credentials.

## Verification

```bash
pnpm test
pnpm build:worker
pnpm test:worker
pnpm test:e2e
pnpm smoke:ui
```

These commands cover domain and client tests, frontend and Worker type checks, Worker runtime tests, browser interactions, and the built frontend. See the [development guide](docs/development.md) for test setup and the additional Worker smoke check.

## Limits

- Online rooms use a six-character code. There are no accounts, public matchmaking, or spectator seats.
- Seat credentials are stored for the current browser and site origin. Refreshing or reopening can restore the seat. Clearing site data loses the credential. Cross-device recovery is unavailable.
- Inactive rooms expire after 24 hours. Active connections defer expiry. Room persistence is temporary and does not provide long-term saved games.
- Local Game is shared-screen play. It does not provide private hands or refresh recovery.
- AI players and non-standard board sizes are outside the current scope.

## Documentation

The detailed guides are in Simplified Chinese.

| Guide | Contents |
| --- | --- |
| [User guide](docs/user-guide.md) | Starting a game, base rules, Commerce Guild, and connection recovery |
| [Architecture](docs/architecture.md) | Module boundaries, command processing, database storage, privacy, and room API |
| [Development](docs/development.md) | Installation, local servers, builds, tests, and repository structure |
| [Deployment](docs/deployment.md) | Cloudflare configuration, preview, production verification, and compatible rollback |
