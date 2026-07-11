# Research: Cloudflare Online Multiplayer

Date: 2026-07-11

## R1: One Cloudflare Worker for SPA and Backend

Decision: deploy the Vite `dist` directory and Worker code as one Wrangler deployment. Route `/api/*` and WebSocket requests through the Worker first; use single-page-application fallback for other non-asset paths.

Reason: this gives the approved single-origin architecture without migrating to a second frontend framework or maintaining CORS between GitHub Pages and Workers.

Source: Cloudflare Workers Static Assets documentation, including assets binding and SPA fallback: <https://developers.cloudflare.com/workers/static-assets/>

Rejected:

- Keep GitHub Pages as production: rejected because the user selected eventual full Cloudflare migration now.
- Add the Cloudflare Vite plugin: rejected because its current release requires a Vite major upgrade and the existing `dist` binding already solves deployment.

## R2: One SQLite-backed Durable Object per Room

Decision: map each normalized room code to one Durable Object name and use the SQLite backend declared through `new_sqlite_classes` migration `v1`.

Reason: a room needs serialized coordination, storage, WebSockets, and alarms. Cloudflare recommends SQLite for new Durable Object classes and makes it available on the Free plan.

Sources:

- <https://developers.cloudflare.com/durable-objects/>
- <https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/>

Rejected:

- D1 plus polling: introduces separate coordination and does not give a single serialized room owner.
- KV: eventual-consistency semantics and an unnecessary extra service.
- Client authority with WebSocket relay: violates privacy and authoritative-rule requirements.

## R3: Hibernatable WebSockets

Decision: use `acceptWebSocket`, serialized attachments, `webSocketMessage`, and `webSocketClose`. Do not use standard `ws.accept()` or timer-based in-memory connection management.

Reason: Hibernation preserves connections while allowing the Durable Object instance to leave memory. Important state must therefore live in storage, while reconstructable connection identity can live in the attachment.

Sources:

- <https://developers.cloudflare.com/durable-objects/best-practices/websockets/>
- <https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/>

## R4: Workers Runtime Tests Without Toolchain Upgrade

Decision: add `@cloudflare/vitest-pool-workers@0.8.70` alongside current Vitest 2.1 and add `wrangler@4.110.0` directly.

Reason: Cloudflare recommends the Workers Vitest integration and provides Durable Object eviction helpers. The current test-pool release requires Vitest 4, which in turn requires Vite 6 or newer. Version `0.8.70` declares Vitest `2.0.x - 3.2.x`, so it adds Workers tests without cascading Vite/Vitest major upgrades.

Sources:

- <https://developers.cloudflare.com/workers/testing/vitest-integration/>
- <https://developers.cloudflare.com/durable-objects/examples/testing-with-durable-objects/>
- npm registry metadata checked on 2026-07-11.

Rejected:

- Upgrade Vite and Vitest as part of multiplayer: unrelated risk and violates minimal implementation.
- Hand-roll Miniflare setup: duplicates the supported integration and increases maintenance.

## R5: Full Snapshots Instead of Patches or Event Sourcing

Decision: after each accepted command, send a newly projected complete view to each seat.

Reason: the current match state is small enough, and complete seat-specific snapshots simplify privacy review, reconnect, version conflict, and schema compatibility.

Rejected:

- JSON Patch: introduces patch ordering and partial-state recovery failure modes.
- Full event sourcing: unnecessary persistence and migration scope for 24-hour rooms.

## R6: Anonymous Seat Token and One-time Socket Ticket

Decision: return a 32-byte random seat token once, store only its SHA-256 hash, and exchange it over HTTPS for a 30-second one-time WebSocket ticket.

Reason: browsers cannot set a normal Authorization header on a WebSocket constructor. A short-lived ticket avoids placing the durable credential in the URL.

Rejected:

- Invitation code as identity: permits seat impersonation.
- Durable seat token in query parameters: leaks through URLs and infrastructure logs.
- Accounts/OAuth: explicitly outside first-version scope.

## R7: No-bid Auction Semantics

Decision: complete the auction immediately if nobody owns a token when it opens. If bidding is possible but every submitted bid is zero, advance one round without a winner, payment, or random reward.

Root cause: `openGuildAuction` currently enters `auction` unconditionally, while `pickAuctionWinner` rejects a bid map with no positive value and the UI has no skip transition. The state machine therefore has no legal exit for all-zero players.

Rejected:

- Add only a UI close button: bypasses the domain state machine and leaves online/local behavior inconsistent.
- Automatically spend a token or choose a winner: changes player strategy and may create resources/cards without a valid bid.
