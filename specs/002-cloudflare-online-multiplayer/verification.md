# Verification Matrix: Cloudflare Online Multiplayer

Date: 2026-07-13
Scope: all 65 numbered online-multiplayer requirements
Release: `https://catan-imitation.catan-imitation.workers.dev/`

## Evidence Rules

- Automated evidence names the repository test file and the command that executes it.
- `pnpm test` includes the `test/domain/` and `test/online/` suites; `pnpm test:worker` includes `test/worker/`; `pnpm test:e2e` includes `test/e2e/`.
- Browser evidence in `test/e2e/online-multiplayer.spec.ts` runs three isolated browser contexts against the locally combined Worker. It is not described as a remote three-browser run.
- T021 production acceptance uses the user-approved substitution recorded in `.codex/worklog/002-cloudflare-online-multiplayer/updates/2026-07-12-cloudflare-release.md`: the complete local combined-Worker three-context API/WebSocket/privacy/reconnect/stored-recovery/responsive suite, plus real preview/production rendering, bilingual lobby, and room creation.
- Counts below are the released T021 gate: main 307/307, Worker 91/91, browser 31/31. The T022 controller owns the fresh terminal full gate.

## Mode and Lobby

| ID | Requirement summary | Concrete evidence | Result |
|---|---|---|---|
| OM-001 | Local and Online are peer entry points. | `test/online/onlineLobbyUi.test.ts` (peer entry and zero online work for Local); `test/e2e/frontend-recovery.spec.ts` (mode entry); `pnpm test`; `pnpm test:e2e`. | Pass |
| OM-002 | Local remains playable without a room/network. | `test/online/onlineLobbyUi.test.ts` (Local performs zero online work); `test/domain/gameTableView.test.ts` (local adapter); `test/e2e/frontend-recovery.spec.ts` (Local mode entry and full local flows); `pnpm test`; `pnpm test:e2e`. | Pass |
| OM-003 | Create allocates a host and unambiguous six-character code. | `test/worker/roomLifecycle.test.ts` (code generation and versioned host seat); `test/e2e/online-multiplayer.spec.ts` (real-browser room create); `pnpm test:worker`; `pnpm test:e2e`. Real preview/production six-character room creation is recorded in the T021 release update. | Pass |
| OM-004 | Nicknames are trimmed, 1-20 characters, and case-insensitively unique. | `test/worker/roomLifecycle.test.ts` (normalization, code-point bounds, duplicate rejection); `test/online/onlineLobbyUi.test.ts` (visible normalization); `pnpm test:worker`; `pnpm test`. | Pass |
| OM-005 | Three/four-seat lobby supports ready, leave, and connected-host transfer. | `test/worker/roomLifecycle.test.ts` (ready, four-seat cap, leave, connected host transfer); `test/online/onlineLobbyUi.test.ts` (seat order, ready, leave, presence); `pnpm test:worker`; `pnpm test`. | Pass |
| OM-006 | Only an all-ready three/four-seat host may start. | `test/worker/roomLifecycle.test.ts` (host-only start invariant); `test/online/onlineLobbyUi.test.ts` (host start control); `test/e2e/online-multiplayer.spec.ts` (three-browser ready/start); `pnpm test:worker`; `pnpm test`; `pnpm test:e2e`. | Pass |
| OM-007 | Start locks the roster against leave/replacement/join. | `test/worker/roomLifecycle.test.ts` (post-start join, ready, leave, repeat-start rejection); `pnpm test:worker`. | Pass |

## Anonymous Seat Identity

| ID | Requirement summary | Concrete evidence | Result |
|---|---|---|---|
| OM-008 | Seat creation returns public ID and high-entropy secret token. | `test/worker/security.test.ts` (exactly 32 random token bytes); `test/worker/roomLifecycle.test.ts` (host seat creation and route shapes); `pnpm test:worker`. | Pass |
| OM-009 | Origin-local room-keyed token storage; storage loss/cross-device recovery unsupported. | `test/online/onlineClient.test.ts` (origin-local namespace, multi-tab reuse, storage fallback); README files and `quickstart.md` state the limitation; `pnpm test`; `pnpm exec vitest run test/domain/deliveryReadiness.test.ts`. | Pass |
| OM-010 | Persistence stores only a one-way token hash. | `test/worker/security.test.ts` (SHA-256 base64url hashing); `test/worker/roomLifecycle.test.ts` (no plaintext credential in persisted host); `pnpm test:worker`. | Pass |
| OM-011 | Room code locates but never authenticates a seat. | `test/worker/roomLifecycle.test.ts` (Bearer-protected delete/ticket and authenticated upgrades); `test/worker/roomWebSocket.test.ts` (latest persisted-seat revalidation); `pnpm test:worker`. | Pass |
| OM-012 | HTTPS token exchange yields a single-use approximately 30-second ticket. | `test/worker/security.test.ts` (exact 30-second ticket expiry); `test/worker/roomLifecycle.test.ts` (ticket consumption/invalid expiry); `test/domain/smokeWorkerTicket.test.ts`; `pnpm test:worker`; `pnpm test`. | Pass |
| OM-013 | Long-lived tokens never enter URLs, logs, broadcasts, or visible errors. | `test/online/onlineClient.test.ts` (Authorization-header-only exchange and credential redaction); `test/worker/security.test.ts` (safe errors); `test/worker/roomWebSocket.test.ts` (bounded safe audit fields); `pnpm test`; `pnpm test:worker`. | Pass |
| OM-014 | Multiple tabs may share a seat without duplicate transitions. | `test/online/onlineClient.test.ts` (multi-tab token reuse); `test/worker/roomLifecycle.test.ts` (multi-socket presence); `test/worker/roomWebSocket.test.ts` (command deduplication); `pnpm test`; `pnpm test:worker`. | Pass |

## Room Lifecycle and Recovery

| ID | Requirement summary | Concrete evidence | Result |
|---|---|---|---|
| OM-015 | Room lifecycle is separate from core game phase. | `test/domain/matchTransition.test.ts` (synchronized match fields); `test/worker/roomLifecycle.test.ts` (lifecycle/game consistency); source boundary `src/domain/match/types.ts` and `worker/room/roomTypes.ts`; `pnpm test`; `pnpm test:worker`. | Pass |
| OM-016 | Valid commands/connections/reconnections refresh activity. | `test/worker/roomLifecycle.test.ts` (successful activity refresh, route/connect lifecycle); `test/worker/roomWebSocket.test.ts` (accepted mutation pipeline); `pnpm test:worker`. | Pass |
| OM-017 | No-connection rooms expire after 24 hours; active sockets defer cleanup. | `test/worker/roomLifecycle.test.ts` (production alarm deletion, open-socket deferral, final-socket expiry restoration); `pnpm test:worker`. | Pass |
| OM-018 | Expiry removes snapshot, credentials, and pending secrets. | `test/worker/roomLifecycle.test.ts` (inactive-room deletion leaves only secret-free tombstone); `pnpm test:worker`. | Pass |
| OM-019 | Reconnect returns a complete caller projection and version. | `test/online/onlineClient.test.ts` (complete snapshot replacement and fresh-ticket reconnect); `test/e2e/online-multiplayer.spec.ts` (same-seat reconnect); `pnpm test`; `pnpm test:e2e`. | Pass |
| OM-020 | Presence derives from sockets, not game-rule state. | `test/worker/roomLifecycle.test.ts` (multi-tab presence and no persisted presence); `test/online/onlineClient.test.ts` (unversioned presence does not mutate game objects); `pnpm test:worker`; `pnpm test`. | Pass |
| OM-021 | Non-required offline seats do not block; required decisions wait. | `test/online/projectionPrivacy.test.ts` (offline required-player structure and caller decision gating); `test/online/onlineGameUi.test.ts` (wait/presence state); `test/e2e/online-multiplayer.spec.ts` (disconnect/reconnect during play); `pnpm test`; `pnpm test:e2e`. | Pass |

## Authoritative Commands

| ID | Requirement summary | Concrete evidence | Result |
|---|---|---|---|
| OM-022 | Shared pure MatchState transition owns synchronized gameplay. | `test/domain/matchTransition.test.ts` (setup, dice, build, cards, trades, Guild through shared dispatcher); source owner `src/domain/match/applyMatchCommand.ts`; `pnpm test`. | Pass |
| OM-023 | Browser-only selections, locale, panels, and notices stay out of persisted match state. | `test/domain/matchTransition.test.ts` (only synchronized fields); `test/domain/gameTableView.test.ts` (presentation/adapter boundary); `pnpm test`. | Pass |
| OM-024 | Local and Online use the same transition owner. | `test/domain/matchTransition.test.ts` (shared dispatcher); `test/domain/gameTableView.test.ts` (local and caller-only adapters); `test/worker/roomWebSocket.test.ts` (actorless commands mapped into shared commands); `pnpm test`; `pnpm test:worker`. | Pass |
| OM-025 | Commands carry ID, expected version, type, and bounded payload. | `test/online/protocol.test.ts` (canonical IDs, versions, discriminants, bounded payloads); `test/worker/roomWebSocket.test.ts` (protocol-first rejection); `pnpm test`; `pnpm test:worker`. | Pass |
| OM-026 | Client cannot specify actor; room derives actor from authenticated seat. | `test/online/protocol.test.ts` (actor-bearing/extra-field rejection); `test/worker/roomWebSocket.test.ts` (trusted actor derivation); `pnpm test`; `pnpm test:worker`. | Pass |
| OM-027 | Pipeline order is validate/auth/dedupe/version/execute/persist/project/broadcast. | `test/worker/roomWebSocket.test.ts` (protocol-first parsing, dedupe, version checks, persist-before-broadcast, projection preflight); `pnpm test:worker`. | Pass |
| OM-028 | Accepted command IDs are idempotent. | `test/worker/roomWebSocket.test.ts` (dedupe before version comparison, bounded 64-ID window); `test/e2e/online-multiplayer.spec.ts` (authoritative multi-browser flow); `pnpm test:worker`; `pnpm test:e2e`. | Pass |
| OM-029 | Stale versions return latest caller projection without applying. | `test/worker/roomWebSocket.test.ts` (stale-version caller snapshot/no mutation); `test/online/onlineClient.test.ts` (version-conflict snapshot replacement); `pnpm test:worker`; `pnpm test`. | Pass |
| OM-030 | Randomness is injectable in tests and cryptographic/server-owned online. | `test/domain/matchTransition.test.ts` (injected dice/theft/deck/blind-box randomness); `test/worker/roomWebSocket.test.ts` (server-owned context and retry-stable entropy); `test/worker/security.test.ts` (Workers crypto); `pnpm test`; `pnpm test:worker`. | Pass |

## State Projection and Privacy

| ID | Requirement summary | Concrete evidence | Result |
|---|---|---|---|
| OM-031 | Raw MatchState is never sent to a browser. | `test/online/projectionPrivacy.test.ts` (fresh allocations/no raw references and adversarial serialization); `test/domain/gameTableView.test.ts` (raw authoritative owners excluded); `pnpm test`. | Pass |
| OM-032 | Accepted transitions emit full caller-specific versioned projections with acknowledgement. | `test/worker/roomWebSocket.test.ts` (per-seat projection after accepted mutation); `test/online/onlineClient.test.ts` (complete snapshot replacement); `pnpm test:worker`; `pnpm test`. | Pass |
| OM-033 | Public projection includes only approved public state. | `test/online/projectionPrivacy.test.ts` (board, bank, counts, trade, Guild result, safe logs); `pnpm test`. | Pass |
| OM-034 | Private projection contains only the authenticated seat's hand/choices. | `test/online/projectionPrivacy.test.ts` (caller private hand, decision, own bid); `test/online/onlineGameUi.test.ts` (four-caller isolation); `pnpm test`. | Pass |
| OM-035 | Opponent hands, hidden VP, bid values, and private errors are non-inferable. | `test/online/projectionPrivacy.test.ts` (adversarial serialized privacy, hidden VP); `test/worker/roomWebSocket.test.ts` (safe audit/error fields); `pnpm test`; `pnpm test:worker`. | Pass |
| OM-036 | Bid status may be public; amounts remain private except winning result. | `test/online/projectionPrivacy.test.ts` (submitted IDs, own amount, no losing values); `test/worker/roomWebSocket.test.ts` (winning amount only); `pnpm test`; `pnpm test:worker`. | Pass |
| OM-037 | Blind-box card type appears only to its recipient. | `test/online/projectionPrivacy.test.ts` (four-caller blind-box isolation); `test/worker/roomWebSocket.test.ts` (loser redaction); `test/online/onlineGameUi.test.ts` (generic public result); `pnpm test`; `pnpm test:worker`. | Pass |

## Commerce Guild Auction Progress

| ID | Requirement summary | Concrete evidence | Result |
|---|---|---|---|
| OM-038 | Zero-token auction completes immediately with structured public log. | `test/domain/auctionNoBid.test.ts` (immediate completion and log); `test/e2e/online-multiplayer.spec.ts` (real no-token flow); `pnpm test`; `pnpm test:e2e`. | Pass |
| OM-039 | Each seat submits/replaces one bounded sealed whole-number bid; zero is pass. | `test/online/protocol.test.ts` (whole non-negative bid); `test/worker/roomWebSocket.test.ts` (persist/replace/affordability); `pnpm test`; `pnpm test:worker`. | Pass |
| OM-040 | At least one positive bid uses existing winner/reward behavior. | `test/worker/roomWebSocket.test.ts` (concurrent positive final bids resolve once); `test/domain/commerceGuild.test.ts`; `pnpm test:worker`; `pnpm test`. | Pass |
| OM-041 | All-zero rounds advance without payment/randomness and round three completes. | `test/domain/auctionNoBid.test.ts` (all-pass advancement and completion); `test/worker/roomWebSocket.test.ts` (all-zero persisted round); `pnpm test`; `pnpm test:worker`. | Pass |
| OM-042 | Pending bids persist across runtime recreation and clear on resolution/expiry. | `test/worker/roomWebSocket.test.ts` (restore and clear on resolution); `test/worker/roomLifecycle.test.ts` (recovery and expiry deletion). This is restart/runtime-recreation evidence, not a claimed Cloudflare hibernation callback test; `pnpm test:worker`. | Pass |
| OM-043 | Corrected no-bid transitions are shared by Local and Online. | `test/domain/auctionNoBid.test.ts` (domain owner); `test/domain/gameTableView.test.ts` (local sealed-bid adapter); `test/worker/roomWebSocket.test.ts` (online sealed-bid pipeline); `pnpm test`; `pnpm test:worker`. | Pass |

## Client Protocol and Experience

| ID | Requirement summary | Concrete evidence | Result |
|---|---|---|---|
| OM-044 | Full projections are used; no JSON Patch/event sourcing. | `test/online/onlineClient.test.ts` (complete snapshot replacement); `test/worker/roomWebSocket.test.ts` (full projection broadcasts); protocol contract `specs/002-cloudflare-online-multiplayer/contracts/protocol.md`; `pnpm test`; `pnpm test:worker`. | Pass |
| OM-045 | UI exposes all six connection states. | `test/online/onlineLobbyUi.test.ts` (connecting, connected, reconnecting, offline, expired, incompatible); `test/online/onlineGameUi.test.ts`; `pnpm test`. | Pass |
| OM-046 | Offline controls are disabled with no optimistic gameplay mutation. | `test/online/onlineClient.test.ts` (offline dispatch rejection/no local command application); `test/online/onlineGameUi.test.ts` (all commands disabled while disconnected); `pnpm test`. | Pass |
| OM-047 | Reconnect uses capped backoff and a fresh one-time ticket. | `test/online/onlineClient.test.ts` (1/2/4/8/15-second schedule and fresh ticket per socket); `test/e2e/online-multiplayer.spec.ts` (same-seat reconnect); `pnpm test`; `pnpm test:e2e`. | Pass |
| OM-048 | Online table reuses bounded panels and shows only caller private hand. | `test/domain/gameTableView.test.ts` (shared presentation boundary); `test/online/onlineGameUi.test.ts` (caller-only hand); `test/e2e/frontend-recovery.spec.ts` (online table containment); `pnpm test`; `pnpm test:e2e`. | Pass |
| OM-049 | Room code, connection, presence, and awaited player remain visible. | `test/online/onlineLobbyUi.test.ts` (code/presence/connection); `test/online/onlineGameUi.test.ts` (room/wait state); `pnpm test`. | Pass |
| OM-050 | Secret-bid UI shows own bid and only others' submission status. | `test/online/onlineGameUi.test.ts` (sealed-bid privacy copy/view); `test/online/projectionPrivacy.test.ts`; `test/e2e/online-multiplayer.spec.ts`; `pnpm test`; `pnpm test:e2e`. | Pass |
| OM-051 | English-default and Simplified-Chinese switching work in both modes. | `test/domain/localization.test.ts`; `test/online/onlineLobbyUi.test.ts`; `test/online/onlineGameUi.test.ts`; `test/e2e/frontend-recovery.spec.ts`; `pnpm test`; `pnpm test:e2e`. Real preview/production bilingual lobby evidence is recorded in the T021 release update. | Pass |

## Persistence, Security, and Errors

| ID | Requirement summary | Concrete evidence | Result |
|---|---|---|---|
| OM-052 | SQLite Durable Object persists versioned room, seats, snapshot, IDs, and bids. | `test/worker/roomLifecycle.test.ts` (real DO storage, schema validation, recovery); `test/worker/roomWebSocket.test.ts` (ID window and pending bids); `wrangler.jsonc` (SQLite migration); `pnpm test:worker`; `pnpm exec wrangler deploy --dry-run`. | Pass |
| OM-053 | Command/audit storage is bounded and contains no credentials/private diagnostics/losing bids. | `test/worker/roomWebSocket.test.ts` (64-ID bound, safe audit fields, sealed-bid privacy); `test/online/projectionPrivacy.test.ts`; `pnpm test:worker`; `pnpm test`. | Pass |
| OM-054 | Protocol/message/resources/arrays/strings are bounded at network and domain boundaries. | `test/online/protocol.test.ts` (16 KiB and field bounds); `test/worker/security.test.ts` (HTTP byte limits); `test/worker/roomWebSocket.test.ts` (inbound/outbound limits); `test/online/onlineGameUi.test.ts` (real projection size high-water cases); `pnpm test`; `pnpm test:worker`. | Pass |
| OM-055 | Same-origin production policy and strict same-origin CSP are enforced. | `test/worker/security.test.ts` (origin acceptance/rejection and strict response policy); `test/e2e/online-multiplayer.spec.ts` (combined same-origin Worker); `pnpm test:worker`; `pnpm test:e2e`. | Pass |
| OM-056 | Per-seat burst throttling rejects abuse without corruption. | `test/worker/roomWebSocket.test.ts` (10 commands/2 seconds, exact boundary, unchanged state); `pnpm test:worker`. | Pass |
| OM-057 | All stable translatable error codes are implemented. | `test/online/protocol.test.ts` (every approved code, HTTP status, retryability); `test/online/onlineLobbyUi.test.ts` and `test/online/onlineGameUi.test.ts` (translated/sanitized notices); `pnpm test`. | Pass |
| OM-058 | Internal errors are generic; logs contain only safe bounded fields. | `test/worker/security.test.ts` (no internal messages/stacks/secrets); `test/worker/roomWebSocket.test.ts` (generic internal audit and safe fields); `pnpm test:worker`. | Pass |
| OM-059 | Stored/wire schema compatibility rejects unsafe versions explicitly. | `test/worker/roomLifecycle.test.ts` (incompatible/malformed storage and reconstruction result); `test/online/protocol.test.ts` (wire schema); `test/online/onlineClient.test.ts` (terminal incompatible state); `pnpm test:worker`; `pnpm test`. | Pass |

## Hosting and Delivery

| ID | Requirement summary | Concrete evidence | Result |
|---|---|---|---|
| OM-060 | One Worker contains SPA, API, WebSocket routing, and SQLite room binding. | `test/worker/workerSmoke.test.ts`; `test/domain/deliveryReadiness.test.ts`; `wrangler.jsonc`; `scripts/smoke-worker.mjs`; `pnpm test:worker`; `pnpm smoke:worker`; `pnpm exec wrangler deploy --dry-run`. Production URL is recorded above. | Pass |
| OM-061 | SPA fallback coexists with Worker-first API/WebSocket routing. | `test/worker/workerSmoke.test.ts` (health/API and SPA route); `test/worker/security.test.ts` (SPA/API policy); `wrangler.jsonc` (`run_worker_first` and SPA handling); `pnpm test:worker`; `pnpm smoke:worker`. | Pass |
| OM-062 | Wrangler uses an explicit SQLite migration tag. | `wrangler.jsonc` (`migrations.tag = v1`, `new_sqlite_classes = RoomDurableObject`); `test/domain/deliveryReadiness.test.ts`; `pnpm exec wrangler deploy --dry-run`. | Pass |
| OM-063 | GitHub remains source; Workers Builds deploys production from main after verification. | `README.md`, `README.zh-CN.md`, and `specs/002-cloudflare-online-multiplayer/quickstart.md`; `test/domain/deliveryReadiness.test.ts`; T021 release update records user-confirmed Workers Builds connection to GitHub `main`, released Worker version, and the passed release gate; `pnpm exec vitest run test/domain/deliveryReadiness.test.ts`. | Pass |
| OM-064 | Pages remained until Worker acceptance, then was retired. | `test/domain/deliveryReadiness.test.ts` rejects Pages publishing/stale URL; repository inspection confirms the former Pages workflow is absent; T021 release update and independent review record that removal followed production acceptance and the former Pages URL returned HTTP 404; `pnpm exec vitest run test/domain/deliveryReadiness.test.ts`. | Pass |
| OM-065 | Both READMEs document modes, Cloudflare, anonymous-seat limits, and production URL. | `README.md`, `README.zh-CN.md`, `test/domain/deliveryReadiness.test.ts`, and `test/domain/localization.test.ts` (reciprocal documents); `pnpm exec vitest run test/domain/deliveryReadiness.test.ts test/domain/localization.test.ts`. | Pass |

## Cross-cutting Review Evidence

- Domain boundary: `test/domain/matchTransition.test.ts`, `test/domain/gameTableView.test.ts`, and direct source inspection show that `src/app/gameReducer.ts` owns no online networking, projection, dice generation, or game-rule switch. Both modes enter `src/domain/match/applyMatchCommand.ts`.
- Privacy: `test/online/projectionPrivacy.test.ts`, `test/online/onlineGameUi.test.ts`, and `test/worker/roomWebSocket.test.ts` cover opponent resources/cards, hidden victory points, unresolved and losing bids, blind-box identity, credentials, tickets, hashes, raw state, and indirect log/error leakage.
- Durable Object correctness: `test/worker/roomLifecycle.test.ts` and `test/worker/roomWebSocket.test.ts` cover serialized persistence, command ordering, idempotency, retry-stable randomness, alarms, expiry, runtime reconstruction, and stored sealed bids. The evidence does not claim an unrun Cloudflare hibernation callback test.
- Client recovery: `test/online/onlineClient.test.ts` and `test/e2e/online-multiplayer.spec.ts` cover same-origin credentials, fresh single-use tickets, capped retry, complete-snapshot recovery, terminal states, and unsupported storage-clearing/cross-device recovery.
- Accessibility: `test/domain/frontendAccessibility.test.ts` and `test/e2e/frontend-recovery.spec.ts` cover programmatic names and keyboard state, focus ownership/Escape/restoration, 44-pixel touch targets, WCAG 4.5:1 robber guidance contrast, keyboard/mouse scrolling, bilingual copy, and horizontal containment at 1280, 768, and 390 pixels.
- Avoidable complexity: T022 changes artifacts only. It adds no production code, runtime wrapper, dependency, service, configuration mode, or duplicate hosting path.

## Convergence Result

All 65 numbered requirements have concrete automated or approved combined/manual evidence. No missing implementation requirement was found, so no post-T022 convergence task is appended. The controller still owns independent implementation review, the fresh full final gate, and the finishing-branch decision.
