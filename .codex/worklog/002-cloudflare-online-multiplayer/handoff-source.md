# Handoff Source: Cloudflare Online Multiplayer

Date: 2026-07-13
Current phase: T022 evidence mapping and external handoff complete; controller terminal gates pending
Branch: `codex/online-multiplayer`

## Current State

- Production: `https://catan-imitation.catan-imitation.workers.dev/`
- Accepted preview: `https://catan-imitation-preview.catan-imitation.workers.dev/`
- GitHub `main` deploys through Workers Builds with `pnpm build:worker` and `pnpm exec wrangler deploy`.
- One Worker serves SPA/API/WebSocket traffic; one SQLite Durable Object owns each room.
- GitHub Pages publishing is retired and its former URL returned HTTP 404.
- OM-001 through OM-065 are mapped in `specs/002-cloudflare-online-multiplayer/verification.md`; no implementation gap was found.

## Architecture and Security Boundary

The shared pure match transition owns rules for both modes. The authenticated room pipeline derives the actor, orders and persists commands, and sends caller-specific projections. Raw state, opponent-private hands, hidden scores, losing or unresolved bid values, credentials, tickets, and token hashes never cross the projection boundary.

## Evidence

- Released T021 gate: main 307/307, Worker 91/91, browser 31/31, both builds, local Worker smoke, Wrangler dry-run, content/link checks, and diff check passed.
- Real preview/production evidence covers rendering, English-default/Chinese-switchable lobby, and room creation.
- The user-approved substitution combines that remote evidence with the local combined-Worker full three-context API/WebSocket/privacy/reconnect/stored-recovery/responsive suite. No remote three-browser run is claimed.
- T022 focused evidence and exact matrix/path checks are recorded in the T022 update packet and implementer report.

## Limits and Rollback

- Same-origin retained storage is required for anonymous seat recovery. Clearing storage or changing devices loses the seat.
- Inactive rooms expire after 24 hours; active sockets defer expiry.
- Roll back by promoting the last verified Cloudflare Worker version. Pages is not a functional online rollback.
- Remote three-browser and Cloudflare hibernation-callback runs are optional evidence enhancements, not released requirement gaps.

## Next Actions

1. Independent review of domain boundaries, privacy, Durable Object correctness, recovery, accessibility, and avoidable complexity.
2. Resolve any Critical/High findings and rerun focused tests.
3. Controller fresh full gate.
4. Finishing-branch merge/push/PR decision.
