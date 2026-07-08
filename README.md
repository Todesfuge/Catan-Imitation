# Catan Imitation

TypeScript portfolio prototype for a Catan-like online board-game table with an original Commerce Guild expansion.

## Current Scope

- Local hot-seat browser prototype.
- Catan-like 19-hex board, dice production, robber blocking/movement, build costs, scoring, and turn progression.
- Statistics panel:
  - player income by dice total
  - dice-total distribution across players
  - full expected income matrix
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
pnpm build
```

The app is designed for `http://127.0.0.1:5173/` during local development.

## Documentation Map

- [Feature spec](specs/001-catan-imitation/spec.md)
- [Implementation plan](specs/001-catan-imitation/plan.md)
- [Task list](specs/001-catan-imitation/tasks.md)
- [Quickstart](specs/001-catan-imitation/quickstart.md)
- [Project constitution](.specify/memory/constitution.md)

## Engineering Notes

Game rules live in pure TypeScript modules under `src/domain`. React components render state and dispatch typed commands through `src/app/gameReducer.ts`.

The first version intentionally excludes real-time multiplayer, accounts, persistence, and exact proprietary artwork.

