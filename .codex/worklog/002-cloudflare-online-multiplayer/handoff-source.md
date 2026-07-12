# Handoff Source: Cloudflare Online Multiplayer

Date: 2026-07-13
Current phase: T023 and the T022 controller gate verified; branch-finishing decision pending
Branch: `codex/online-multiplayer`

## Current State

- Production: `https://catan-imitation.catan-imitation.workers.dev/`
- Accepted preview: `https://catan-imitation-preview.catan-imitation.workers.dev/`
- GitHub `main` deploys through Workers Builds with `pnpm build:worker` and `pnpm exec wrangler deploy`.
- One Worker serves SPA/API/WebSocket traffic; one SQLite Durable Object owns each room.
- GitHub Pages publishing is retired and its former URL returned HTTP 404.
- OM-001 through OM-065 are mapped in `specs/002-cloudflare-online-multiplayer/verification.md`; T023 closes the refresh-recovery and ticket-availability gaps found by T022 whole-branch review.

## Architecture and Security Boundary

The shared pure match transition owns rules for both modes. The authenticated room pipeline derives the actor, orders and persists commands, and sends caller-specific projections. Raw state, opponent-private hands, hidden scores, losing or unresolved bid values, credentials, tickets, and token hashes never cross the projection boundary.

## Evidence

- Released T021 gate: main 307/307, Worker 91/91, browser 31/31, both builds, local Worker smoke, Wrangler dry-run, content/link checks, and diff check passed.
- Real preview/production evidence covers rendering, English-default/Chinese-switchable lobby, and room creation.
- The user-approved substitution combines that remote evidence with the local combined-Worker full three-context API/WebSocket/privacy/reconnect/stored-recovery/responsive suite. No remote three-browser run is claimed.
- T022 focused evidence and exact matrix/path checks are recorded in the T022 update packet and implementer report.
- T023 remediation evidence proves 45/45 focused client/lobby tests, 51/51 focused Worker lifecycle tests, and a real three-browser `page.reload()` restoring the same caller-private seat through a fresh ticket without create/join. Saturated authenticated admissions stop later ticket crypto/storage, and legacy-v1 expired excess is normalized before strict bounds.
- Independent T023 and repeated whole-branch reviews passed with no remaining findings. The fresh controller gate passed main 312/312, Worker 97/97, browser 31/31, both builds, Worker smoke, Wrangler dry-run, 65/65 matrix and 34/34 cited-path checks, 19 relative Markdown links, the 36-line reducer boundary check, and `git diff --check`.

## Limits and Rollback

- Same-origin retained storage is required for anonymous seat recovery. Clearing storage or changing devices loses the seat.
- Inactive rooms expire after 24 hours; active sockets defer expiry.
- Roll back by promoting the last verified Cloudflare Worker version. Pages is not a functional online rollback.
- Remote three-browser and Cloudflare hibernation-callback runs are optional evidence enhancements, not released requirement gaps.

## Next Actions

1. Present the finishing-branch merge/push/PR/keep options.
2. Execute the user's selected branch-finishing action.
