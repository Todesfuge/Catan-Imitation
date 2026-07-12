# Handoff Source: Cloudflare Online Multiplayer

Date: 2026-07-13
Current phase: T021 committed; T022 convergence next
Branch: `codex/online-multiplayer`

## Current State

- Production: `https://catan-imitation.catan-imitation.workers.dev/`
- Preview used for acceptance: `https://catan-imitation-preview.catan-imitation.workers.dev/`
- Cloudflare Workers Builds is connected to GitHub `main`.
- Build command: `pnpm build:worker`
- Deploy command: `pnpm exec wrangler deploy`
- Preview deployment: `pnpm build:worker`, then `pnpm exec wrangler deploy --name catan-imitation-preview`
- A separate preview Worker is required because version preview URLs are not suitable for this Durable Object Worker.
- GitHub Pages publishing is retired after production room-creation acceptance; the former Pages URL returns HTTP 404.

## Architecture

The Worker serves the React SPA and `/api/rooms` from one origin. One SQLite-backed Durable Object owns each room's authoritative state, serialized commands, WebSockets, alarms, and caller-specific projections. The browser retains an origin-local bearer credential and exchanges it for single-use connection tickets.

## Acceptance Evidence

- Pre-preview local gate: unit 307/307, Worker 91/91, browser 31/31, Worker build, local Worker smoke, Wrangler dry-run, and diff check passed.
- Real preview and production pages rendered the populated React root, English-default Local/Online selector, complete Online lobby, and complete Simplified Chinese lobby.
- The user confirmed six-character room creation in preview on 2026-07-12 and production on 2026-07-13.
- The local combined-Worker suite supplied full three-context API/WebSocket, authoritative play, privacy, reconnect, stored-state recovery, and responsive evidence. On 2026-07-13, the user explicitly approved combining it with real preview/production rendering, bilingual lobby, and room creation as T021 acceptance because of the controller network constraint. This does not represent a remote three-browser run.
- Fresh final T021 gate passed: unit 307/307, Worker 91/91, browser 31/31, production and Worker builds, local Worker smoke, Wrangler dry-run, link/content checks, and diff check.
- Independent T021 re-review approved the release with no Critical, Major, or Minor findings.

## Security and Privacy Boundaries

- Never record Cloudflare account identifiers, login details, seat bearer credentials, connection tickets, or room secrets.
- Anonymous rooms have three or four seats and no accounts or public matchmaking.
- Same-origin browser storage enables reconnect. Clearing site storage loses the seat; cross-device recovery is unavailable.
- Inactive rooms expire after 24 hours; active connections defer expiry.

## Rollback

Promote the last verified production version from Cloudflare deployment/version history. Restoring the retired Pages workflow would only restore a static host and would not provide the online room API.

## Next Actions

1. Run T022 requirement convergence and branch-finishing workflow.
