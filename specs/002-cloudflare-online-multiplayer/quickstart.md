# Quickstart: Cloudflare Online Multiplayer Development

This quickstart describes the implemented local, preview, and production workflow for the Cloudflare-hosted game.

## Prerequisites

- Node.js 22 or newer.
- Corepack with the repository-pinned pnpm version.
- A Cloudflare account for preview/production deployment only; local tests require no account credentials.

## Install

```powershell
corepack enable
pnpm install
```

Cloudflare credentials and account IDs must not be committed to the repository. Interactive local login uses:

```powershell
pnpm exec wrangler login
```

## Local Combined Application

```powershell
pnpm dev:worker
```

Expected local address: `http://127.0.0.1:8787/`.

The command serves the Vite SPA and `/api/rooms` from one origin. Local Game must remain usable even when no room exists.

## Focused Verification

```powershell
pnpm test
pnpm test:worker
pnpm build
pnpm build:worker
pnpm smoke:worker
```

Expected outcomes:

- Existing domain/UI tests pass.
- Workers-runtime room tests pass with isolated local storage.
- TypeScript compiles both React and Worker projects.
- `dist` and Worker code form a valid Wrangler upload.
- Smoke test creates a room and loads the SPA from the combined preview.

## Browser Verification

```powershell
pnpm test:e2e
```

The online suite opens three independent browser contexts against the combined local Worker, joins one private room, starts a game, checks per-seat privacy, exercises one authoritative turn and sealed bid, disconnects one context, and verifies reconnection.

## Preview Upload

```powershell
pnpm build:worker
pnpm exec wrangler deploy --name catan-imitation-preview
```

This project uses the separate `catan-imitation-preview` Worker because version preview URLs are not suitable for its Durable Object binding. The deployed preview URL is:

- `https://catan-imitation-preview.catan-imitation.workers.dev/`

Verify:

- SPA fallback and static assets.
- Room create/join and WebSocket upgrade.
- Three-seat privacy.
- Refresh reconnect.
- Durable Object recovery after an idle/eviction interval.
- Local Game remains playable.
- English-default and Simplified Chinese lobby copy.
- Desktop, tablet, and mobile responsive widths.

For T021, the real preview rendered the React root, English-default Local/Online selector, complete Online lobby, and complete Simplified Chinese lobby. The user created a room and confirmed its six-character code. The full three-context API/WebSocket, privacy, reconnect, stored-state recovery, and responsive suite ran against the combined Worker locally. Because the controller network could not run that suite against `workers.dev`, the user explicitly approved this combined evidence as the preview acceptance substitute on 2026-07-13. This does not claim a separate remote three-browser run.

## Production Deployment

Production is deployed from GitHub `main` through Cloudflare Workers Builds after preview acceptance:

- Production URL: `https://catan-imitation.catan-imitation.workers.dev/`
- Build command: `pnpm build:worker`
- Deploy command: `pnpm exec wrangler deploy`

The real production page rendered the React root, English-default Local/Online selector, complete Online lobby, and complete Simplified Chinese lobby. On 2026-07-13, the user confirmed Workers Builds was connected to GitHub `main` and production room creation returned a six-character code. The same explicit evidence substitution covers the repeated production smoke/privacy acceptance without claiming a remote three-browser run.

GitHub Pages publishing is retired after this production acceptance, leaving Cloudflare Workers as the single production host. The controller verified the former Pages URL returns HTTP 404.

## Anonymous Room Model

- Rooms have three or four seats and are joined by a private six-character code.
- There are no accounts or public matchmaking.
- Each seat uses a bearer credential stored only for the current browser origin.
- Refreshing or reopening on the same origin can reconnect to the latest Durable Object state.
- Clearing site storage loses the credential; cross-device seat recovery is not available.
- Inactive rooms expire after 24 hours, while active connections defer expiry.

## Rollback

Use the production Worker's Cloudflare deployment/version history to promote the last verified version. Do not record account identifiers, login details, bearer credentials, connection tickets, or room secrets in release evidence.

## Required Final Gate

```powershell
pnpm test
pnpm test:worker
pnpm test:e2e
pnpm build
pnpm build:worker
pnpm smoke:worker
pnpm exec wrangler deploy --dry-run
git diff --check
```

Store verification output in the feature update record before claiming completion.
