# Specification Quality Checklist: Cloudflare Online Multiplayer

Reviewed: 2026-07-11
Artifact: `specs/002-cloudflare-online-multiplayer/spec.md`

## Scope and User Value

- [x] Local and online modes are both explicit.
- [x] Anonymous private-room behavior is independently testable.
- [x] Three/four-player limits and host start rules are explicit.
- [x] Full current gameplay, including Commerce Guild, is explicitly in scope.
- [x] Accounts, matchmaking, spectators, chat, randomized boards, timers, and long-term storage are explicitly out of scope.
- [x] Cross-device recovery is explicitly excluded from the anonymous first version.

## Correctness and Privacy

- [x] The authoritative actor comes from the authenticated seat, not client payload.
- [x] Randomness ownership is explicit.
- [x] Command idempotency and stale-version behavior are explicit.
- [x] Public and private projection boundaries are explicit.
- [x] Resource, development-card, hidden-score, and bid privacy are testable.
- [x] Secret bid persistence and clearing behavior are explicit.
- [x] The zero-token/all-pass auction deadlock has deterministic transitions.

## Recovery and Lifecycle

- [x] Lobby, playing, finished, and expired lifecycle states are distinct from core game phases.
- [x] The 24-hour retention rule and active-connection exception are explicit.
- [x] Required versus non-required offline-player behavior is explicit.
- [x] Reconnect uses a seat credential and complete latest projection.
- [x] Host departure and post-start seat locking are specified.

## Architecture and Delivery

- [x] Cloudflare Workers static assets, APIs, WebSockets, Durable Objects, SQLite, and alarms have clear owners.
- [x] GitHub remains source control while Cloudflare becomes the sole production runtime.
- [x] Local and online modes share one pure match-transition implementation.
- [x] `gameReducer.ts` does not gain networking or projection responsibility.
- [x] D1, KV, R2, event sourcing, and duplicate production hosting are excluded.
- [x] Migration, preview, production, README, and GitHub Pages retirement order is explicit.

## Verification

- [x] Domain, privacy, room integration, browser, and release verification layers are defined.
- [x] Multi-browser-context testing is required.
- [x] Hibernation/restart and alarm cleanup are covered.
- [x] Local mode regression remains a release gate.
- [x] No unresolved placeholders, TBDs, TODOs, or contradictory requirements remain.

## Result

The written specification is complete enough for user review and subsequent technical planning. No blocking ambiguity remains in the approved first-release scope.
