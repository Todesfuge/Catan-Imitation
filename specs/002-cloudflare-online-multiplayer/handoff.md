# Cloudflare Online Multiplayer Handoff

Date: 2026-07-13
Scope: released Local/Online feature, OM-001 through OM-065
Production: `https://catan-imitation.catan-imitation.workers.dev/`

## Overview

- Local Game remains the four-player hot-seat experience and requires no Cloudflare room. Online Game provides anonymous private rooms for three or four players, the full current ruleset, and the Commerce Guild expansion.
- One Cloudflare Worker serves the Vite SPA, HTTP room API, WebSocket route, and Durable Object binding. Each room code maps to one SQLite-backed Durable Object.
- The room is authoritative: authenticated actorless commands enter the shared pure match transition, persist in version order, and produce a new caller-specific projection. Browsers never receive raw match state or execute online rules optimistically.
- The released T021 gate passed 307/307 main tests, 91/91 Worker tests, and 31/31 browser tests, plus `pnpm build`, `pnpm build:worker`, `pnpm smoke:worker`, Wrangler dry-run, documentation/link checks, and `git diff --check`. The requirement-by-requirement evidence is in `verification.md`.
- Acceptance uses an explicit evidence-substitution waiver: the complete three-context API/WebSocket/privacy/reconnect/stored-recovery/responsive suite ran against the locally combined Worker, while the real preview and production Workers supplied rendering, bilingual lobby, and room-creation evidence. This is not a remote three-browser run.
- Anonymous seat recovery is same-origin and credential-based. Clearing site storage or moving to another device loses the seat; there are no accounts or cross-device recovery.
- T023 now proves a true browser refresh: the active record contains only the normalized room code, startup resolves the existing room-keyed credential, requests a fresh one-time ticket, and restores the same seat's equal-or-newer complete private projection without create/join.
- Rooms expire after 24 hours without valid activity and no active connections. Active connections defer expiry; cleanup deletes the snapshot, credentials, and pending secret input.

## Technical Details

### Architecture and Boundaries

```text
Browser
  |-- Local Game --> local adapter --\
  |                                  > shared pure match transition
  `-- Online Game --> Worker/room ---/
                         |
                         |-- one Worker: SPA + HTTP + WebSocket routing
                         `-- one SQLite Durable Object per room
                               |-- authenticated ordered commands
                               |-- persisted versioned room snapshot
                               |-- caller-specific public/private projection
                               `-- presence, recovery, and expiry alarm
```

- `src/domain/match/applyMatchCommand.ts` is the gameplay authority shared by Local and Online modes. `src/app/gameReducer.ts` remains a thin local UI adapter and owns no networking, projection, dice, or rule execution.
- `worker/room/commandPipeline.ts` derives the actor from the authenticated seat, validates and deduplicates the command, checks the expected room version, executes the shared transition with server-owned randomness, persists, projects, and broadcasts.
- `src/online/projectRoomView.ts` is the projection boundary. It exposes public counts/state and only the caller's resources, development cards, and private choices. Opponent card/resource identities, hidden victory points, unresolved or losing bid values, credentials, tickets, token hashes, and raw persisted state stay server-side.
- Reconnect and page refresh resolve a room-code-only active pointer through the origin-local seat credential, exchange the token over HTTPS for a fresh single-use ticket, and replace client state with a complete current caller projection. Explicit connected-room exit clears the pointer; lobby leave continues to remove the credential. Presence derives from active sockets and is not game-rule state.
- Persisted connection tickets are capped at 8 outstanding per seat and 32 per room. The Durable Object also allows at most 10 authenticated issuance admissions per credential in a rolling two-second window, including store-level saturation rejections, and returns the existing stable HTTP 429 / `RATE_LIMITED` response before further ticket crypto/storage work. Invalid credentials do not allocate limiter entries.
- Pending sealed bids are persisted with the room and survive room-runtime recreation. Repository evidence covers Durable Object reconstruction/storage and the production alarm path; it does not claim a Cloudflare hibernation callback test that was not run.

### Verification and Production Evidence

- Production Worker: `https://catan-imitation.catan-imitation.workers.dev/`
- Accepted preview Worker: `https://catan-imitation-preview.catan-imitation.workers.dev/`
- Production version recorded at release: `9109402c-1f16-47cd-bbc2-254449afedd9`
- Workers Builds source: GitHub `main`; build `pnpm build:worker`; deploy `pnpm exec wrangler deploy`.
- Preview uses `pnpm build:worker`, then `pnpm exec wrangler deploy --name catan-imitation-preview` because a separate Worker is required for the Durable Object preview.
- GitHub Pages publishing is retired; the former Pages address returned HTTP 404 after production acceptance.
- T022 mapped all 65 requirements, and its whole-branch review then found two Important implementation gaps. T023 fixes refresh restoration and ticket issuance bounds with focused RED/GREEN evidence. Independent re-review, the fresh T022 full final gate, and branch-finishing options remain controller-owned.

### Rollback

Promote the last verified production version from Cloudflare Worker deployment/version history. Restoring the retired GitHub Pages workflow is not an online rollback because a static Pages deployment cannot provide the room API, WebSockets, or Durable Objects.

### Optional Enhancements

- Accounts or an explicit recovery mechanism if cross-device seat recovery becomes a product goal.
- Matchmaking, spectators, chat, timers, AI replacement players, or long-term history, all currently out of scope.
- A remote Cloudflare three-browser acceptance run and Cloudflare-environment hibernation callback coverage as stronger operational evidence; these are optional evidence improvements, not release defects under the approved waiver.
- Additional adversarial bid-interleaving and replacement-affordability tests beyond the passing requirement coverage.
