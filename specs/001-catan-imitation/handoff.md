# Handoff: Catan Imitation

Date: 2026-07-13
Scope: Local game, Cloudflare online multiplayer, and T021 production release documentation

## Current State

Catan Imitation supports both a four-player local hot-seat game and anonymous three/four-seat private online rooms. The React client and pure TypeScript rules remain shared. Online rooms run through a same-origin Cloudflare Worker; one Durable Object serializes each room's commands, persistence, WebSockets, expiry, and caller-specific projections.

## Production Delivery

- Production: `https://catan-imitation.catan-imitation.workers.dev/`
- Preview accepted for T021 through the approved combined-evidence waiver: `https://catan-imitation-preview.catan-imitation.workers.dev/`
- Cloudflare Workers Builds is connected to GitHub `main`; build is `pnpm build:worker` and deploy is `pnpm exec wrangler deploy`.
- The real preview and production pages rendered the React root, English-default Local/Online selector, complete Online lobby, and complete Simplified Chinese lobby.
- The user confirmed six-character room creation in preview on 2026-07-12 and production on 2026-07-13.
- GitHub Pages publishing is retired after production acceptance, leaving one production host; the former Pages URL returns HTTP 404.
- Rollback uses the production Worker's Cloudflare deployment/version history to promote the last verified version.

## Verification

- Fresh pre-preview gate: `pnpm test` 307/307, `pnpm test:worker` 91/91, `pnpm test:e2e` 31/31, `pnpm build:worker`, `pnpm smoke:worker`, `pnpm exec wrangler deploy --dry-run`, and `git diff --check` passed.
- Fresh final T021 gate: `pnpm test` 307/307, `pnpm test:worker` 91/91, `pnpm test:e2e` 31/31, `pnpm build`, `pnpm build:worker`, `pnpm smoke:worker`, `pnpm exec wrangler deploy --dry-run`, link/content checks, and `git diff --check` passed.
- Independent T021 re-review approved the release with no Critical, Major, or Minor findings.
- The full online browser suite uses three independent contexts against the combined local Worker and covers private projections, authoritative play, reconnect, and stored-state recovery.
- Remote T021 evidence covers real rendering, both locales, the complete lobby, and user-accepted room creation. Because the controller network could not execute the full suite against `workers.dev`, the user explicitly approved the local combined-Worker three-context API/WebSocket/privacy/reconnect/stored-recovery/responsive suite as the remaining preview and production acceptance evidence. No remote three-browser run is claimed.

## Remaining Limits

- Online rooms are anonymous and private, with three or four seats; there are no accounts or public matchmaking.
- The origin-local bearer credential enables same-origin browser reconnect. Clearing site storage loses the seat, and cross-device recovery is unavailable.
- Inactive rooms expire after 24 hours; active connections defer expiry. Long-term saved games remain out of scope.
- AI players and randomized/generalized board generation remain out of scope.
- The prepared demo remains the initial portfolio view; New Game enters the complete setup flow.
- Locale persistence is intentionally session-scoped; authoritative online room state is held by the Durable Object.

## Next Action

Proceed to T022 convergence and branch finishing from the completed `docs: publish Cloudflare online multiplayer` release commit.
