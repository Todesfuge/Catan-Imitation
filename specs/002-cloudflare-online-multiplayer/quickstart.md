# Quickstart: Cloudflare Online Multiplayer Development

This quickstart describes the intended development workflow after the implementation tasks add the Worker files and scripts.

## Prerequisites

- Node.js 20 or newer.
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
pnpm exec wrangler versions upload
```

Use the preview URL printed by Wrangler. Verify:

- SPA fallback and static assets.
- Room create/join and WebSocket upgrade.
- Three-seat privacy.
- Refresh reconnect.
- Durable Object recovery after an idle/eviction interval.
- Local Game remains playable.

## Production Deployment

Production is deployed from GitHub `main` through Cloudflare Workers Builds after preview acceptance. The repository build command is `pnpm build:worker`, and the deploy command is `pnpm exec wrangler deploy`.

Do not disable the GitHub Pages workflow until the Cloudflare production address has passed the full release gate and both READMEs have been updated.

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
