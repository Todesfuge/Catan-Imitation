# Cloudflare Online Multiplayer Technical Plan

Created: 2026-07-11
Status: Ready for implementation; artifact analysis passed
Feature: `002-cloudflare-online-multiplayer`

## Goal

Deliver one Cloudflare-hosted React application in which Local Game remains browser-only and Online Game gives three or four anonymous players an authoritative, private, reconnectable full game including the Commerce Guild expansion.

## Architecture Summary

The existing pure rule modules remain the gameplay authority, but their orchestration is extracted from `src/app/gameReducer.ts` into a shared match-transition module. Local Game calls that transition through a thin reducer adapter. Online Game sends authenticated commands to one SQLite-backed Durable Object per room, which calls the same transition, persists the result, and emits a separate projection for each seat.

The Cloudflare Worker is a thin same-origin router for static Vite assets, room HTTP endpoints, and WebSocket upgrades. Room lifecycle, credentials, presence, command idempotency, sealed bids, persistence, and expiry belong to focused Worker/room modules rather than React or the domain rules.

## Technology Choices

- React 18.3 and Vite 5.4 remain unchanged.
- Vitest 2.1 remains the browser/domain test runner.
- Wrangler is pinned to `4.110.0` for deployment and generated Worker types.
- `@cloudflare/vitest-pool-workers` is pinned to `0.8.70`, whose declared peer range includes Vitest 2, for Workers-runtime integration tests.
- No Cloudflare Vite plugin is added; Wrangler uploads the existing `dist` directory through the static-assets binding.
- No runtime schema, state-management, authentication, database, patch, or event-sourcing dependency is added.
- Protocol validation uses small discriminated-union parsers owned by `src/online/protocol.ts`.
- Durable Object storage uses the SQLite backend through the standard storage API; no D1, KV, or R2 binding is introduced.

## Constitution Check

| Principle | Plan response |
|---|---|
| Playable core before decoration | Room creation, authoritative setup/turns, privacy, and reconnect precede visual polish. |
| Pure game rules, thin UI | Shared `applyMatchCommand` owns transitions; React and Worker routing do not implement rules. |
| High cohesion, low coupling | Protocol, projection, identity, persistence, room orchestration, transport, and UI adapters have separate owners. |
| Traceable delivery | Every implementation group starts with a failing focused test and ends with recorded verification. |
| Time-boxed scope control | Accounts, chat, matchmaking, random boards, timers, D1/KV/R2, and event sourcing remain excluded. |

No constitution amendment is required: the playable local version is complete, so networking is now permitted by Principle 5.

## Responsibility Map

### Shared match domain

- `src/domain/match/types.ts`: `MatchState`, synchronized command types, execution context, and transition result.
- `src/domain/match/createMatch.ts`: create setup/demo match state for arbitrary three/four-player seat definitions.
- `src/domain/match/applyMatchCommand.ts`: the only synchronized command dispatcher; delegates to existing rule owners.
- `src/domain/match/random.ts`: injectable `RandomSource` contract and unbiased integer helper.
- `src/app/gameReducer.ts`: local-only compatibility adapter, UI selections, and recoverable notice handling; loses business orchestration responsibility.
- `src/app/localGameState.ts`: compose local `MatchState` with browser-only `UiState` and adapt local commands.

### Online contract and projection

- `src/online/protocol.ts`: HTTP/WebSocket request and response unions, stable error codes, message limits, and parsers.
- `src/online/view.ts`: public/private room projection types consumed by React.
- `src/online/projectRoomView.ts`: authoritative state-to-seat projection and privacy-safe log transformation.
- `src/online/allowedActions.ts`: server-computed caller action availability needed by the online UI.
- `src/online/sessionStorage.ts`: origin-local seat-token persistence keyed by room code.

### Worker and room runtime

- `worker/index.ts`: route `/api/*`, WebSocket upgrades, and static assets.
- `worker/env.ts`: generated binding-facing `Env` type and constants.
- `worker/http.ts`: JSON response, bounded-body, origin, and safe error helpers.
- `worker/crypto.ts`: seat-token creation/hashing, one-time ticket creation, and cryptographic `RandomSource`.
- `worker/room/roomTypes.ts`: persisted room, seat, ticket, bid, and command-window types.
- `worker/room/roomStore.ts`: load/save/delete/version compatibility and 24-hour alarm scheduling.
- `worker/room/roomLifecycle.ts`: create/join/leave/ready/start/host-transfer transitions.
- `worker/room/commandPipeline.ts`: authenticate, parse, deduplicate, version-check, execute, persist, project, and broadcast.
- `worker/room/RoomDurableObject.ts`: thin Durable Object integration with HTTP, hibernatable WebSockets, alarms, and module delegation.

### React online mode

- `src/app/AppRouter.tsx`: Local Game / Online Game mode selection without a routing dependency.
- `src/online/OnlineLobby.tsx`: create/join and ready/start lobby.
- `src/online/useOnlineRoom.ts`: HTTP bootstrap, one-time ticket exchange, WebSocket lifecycle, backoff, and snapshots.
- `src/online/onlineReducer.ts`: connection/lobby/projection state only; never executes game rules.
- `src/online/OnlineGame.tsx`: map caller projection and server-provided allowed actions into the shared table UI.
- `src/ui/GameTable.tsx`: extracted presentational shell shared by local and online modes.
- Existing board/action/trade/commerce components: consume an explicit view model and dispatch interface rather than raw authoritative `AppState`.

### Tests and configuration

- `test/domain/auctionNoBid.test.ts`: zero-token and all-pass domain regressions.
- `test/domain/matchTransition.test.ts`: shared transition and local-adapter parity.
- `test/online/projectionPrivacy.test.ts`: per-seat privacy and allowed-action projection.
- `test/online/protocol.test.ts`: parser limits and stable message/error shapes.
- `test/worker/roomLifecycle.test.ts`: Durable Object HTTP/lobby/persistence/expiry behavior.
- `test/worker/roomWebSocket.test.ts`: hibernation, command pipeline, idempotency, presence, and sealed bids.
- `test/e2e/online-multiplayer.spec.ts`: three-browser-context critical path and reconnect.
- `vitest.config.ts`: keep domain/online Node tests separate from Workers-runtime tests.
- `vitest.worker.config.ts`: configure the Cloudflare Workers pool.
- `tsconfig.app.json`: exclude Workers-runtime tests from the browser/Node project.
- `tsconfig.worker.json`: typecheck Worker code and Worker tests separately from DOM-facing React code.
- `wrangler.jsonc`: assets, Worker entry, Durable Object binding, compatibility date, and SQLite migration.

## State and Interface Boundaries

### Match transition

```ts
export interface MatchState {
  game: GameState;
  guild: CommerceGuildState;
  lastDice: DiceRoll | null;
  pendingPlayerTrade?: PlayerTradeOffer;
}

export interface MatchExecutionContext {
  random: RandomSource;
  nextLogId(): string;
  now(): number;
}

export function applyMatchCommand(
  state: MatchState,
  command: MatchCommand,
  context: MatchExecutionContext
): MatchState;
```

`MatchCommand` contains gameplay only. `SELECT_DICE_TOTAL`, `SELECT_PLAYER`, panels, locale, notices, and connection state never enter this interface.

### Online command envelope

```ts
export interface MatchCommandEnvelope {
  type: "match.command";
  commandId: string;
  expectedVersion: number;
  command: OnlineMatchCommand;
}
```

`OnlineMatchCommand` omits the actor player ID. `commandPipeline.ts` obtains the seat attachment, maps it to `playerId`, and constructs the trusted `MatchCommand`.

### Projection

```ts
export interface RoomSnapshot {
  type: "room.snapshot";
  schemaVersion: 1;
  roomVersion: number;
  lifecycle: RoomLifecycle;
  publicState: PublicRoomState;
  privateState: PrivateSeatState;
  allowedActions: OnlineAllowedActions;
  presence: SeatPresence[];
  acknowledgedCommandId?: string;
}
```

Projection functions receive the raw room only inside the Worker/test boundary and return a newly allocated privacy-safe object. React types do not import `PersistedRoom` or raw `MatchState`.

## Storage and Concurrency

- A room is addressed with `env.ROOMS.getByName(normalizedRoomCode)`.
- Room creation generates a code and asks that object to create only if empty; a collision retries with a new code up to eight times before returning a safe internal error.
- One persisted record key stores schema-versioned room state; pending sealed bids are part of that record so hibernation cannot lose them.
- Every accepted mutation executes inside the Durable Object's serialized request/event handling and persists before broadcast.
- `roomVersion` increments only after a successful state transition.
- Each seat retains a bounded queue of the last 64 accepted command IDs and their resulting versions.
- A command with a duplicate ID returns the current snapshot without executing again.
- A command whose expected version differs returns `VERSION_CONFLICT` plus a new caller snapshot.
- WebSocket attachments contain only `seatId`, `connectionId`, and connection time so they survive hibernation without containing secrets.
- Alarm cleanup deletes the persisted record only when 24 hours have elapsed and `getWebSockets()` returns no open connections.

## Security and Privacy Controls

- Create 32 random bytes for seat tokens; send base64url plaintext once and store a SHA-256 hash.
- Issue 32-byte one-time WebSocket tickets with a 30-second expiry; consume them atomically during upgrade.
- Require a valid same-origin `Origin` header for state-changing production requests and WebSocket upgrades; allow explicit loopback origins in local development.
- Reject HTTP bodies above 16 KiB and WebSocket text messages above 16 KiB.
- Normalize nicknames with Unicode normalization, trimming, length checking, and case-insensitive comparison.
- Limit each seat to a burst of 10 gameplay commands per 2 seconds; heartbeats and server replies do not consume gameplay quota.
- Apply a CSP that permits only same-origin scripts, styles, connections, and images needed by the application.
- Structured logs include safe room hash prefix, command type, version, duration, and error code only.

## Implementation Sequence

### Phase A: Shared correctness boundary

1. Add failing zero-token/all-pass auction tests and correct the Commerce Guild state machine.
2. Extract synchronized `MatchState`, `MatchCommand`, execution context, log ID, and randomness from `gameReducer.ts`.
3. Keep Local Game behavior stable through a thin reducer adapter and full existing-suite verification.
4. Generalize setup creation to accepted three/four-seat definitions, keep board/ports fixed, and shuffle the development deck from the injected random source.

Exit: all current tests plus shared-transition tests pass; `gameReducer.ts` contains no rule switch implementation or `Math.random` ownership.

### Phase B: Privacy-safe contract

1. Define exact protocol parsers and error codes.
2. Define public/private view types and server-computed allowed actions.
3. Add projection privacy tests before implementation.
4. Implement public/private projection, sanitized logs, and blind-box card redaction.

Exit: tests prove that serializing any opponent projection cannot reveal resources, card kinds, hidden score, pending/losing bids, or private errors.

### Phase C: Cloudflare room runtime

1. Add Wrangler/static-assets configuration, generated bindings, and Workers Vitest project.
2. Implement token/ticket cryptography and bounded HTTP helpers.
3. Implement room lifecycle and persisted model with TDD.
4. Implement the Durable Object adapter, alarm cleanup, and hibernatable socket attachments.
5. Implement command pipeline, deduplication, version conflict, throttling, projections, and presence broadcast.
6. Implement sealed per-seat bid submission and resolution through the corrected shared auction rule.

Exit: Workers-runtime tests cover create/join/ready/start, persistence across eviction, WebSocket commands, privacy, reconnect, bids, and expiry.

### Phase D: Online React experience

1. Extract the current table into a view/dispatch-based presentational shell.
2. Add Local/Online entry selection and prove Local Game regression.
3. Add seat-token storage, HTTP room bootstrap, socket connection, tickets, backoff, and online reducer.
4. Add lobby UI and online game adapter with connection/presence/wait states.
5. Adapt action, robber, trade, development-card, and Commerce Guild controls to caller-only allowed actions.
6. Add English and Chinese strings for room, connection, protocol, privacy, and auction-pass states.

Exit: three independent browser contexts can start and operate one privacy-safe match; local mode remains unchanged.

### Phase E: Convergence and deployment

1. Add multi-context Playwright coverage for the full critical path and reconnect.
2. Add CSP, safe structured logging, preview smoke, and combined production scripts.
3. Run full test/build/preview/privacy gates and resolve findings.
4. Deploy a preview and manually verify real WebSocket, SQLite eviction recovery, and alarm behavior.
5. Connect Workers Builds to GitHub `main`, verify production, update READMEs, and then retire GitHub Pages production publishing.

Exit: the Cloudflare production URL is the sole documented application, and all release gates in `spec.md` have fresh evidence.

## TDD and Review Gates

- Every production behavior starts with a focused failing test in its owner suite.
- A task may be marked complete only after its focused test and the relevant regression slice pass.
- Phase A requires a domain-boundary review because it changes the owner of all commands.
- Phase B requires an adversarial privacy review using serialized projections.
- Phase C requires Workers-runtime integration review and eviction evidence.
- Phase D requires real-browser desktop/mobile and three-context review.
- Phase E requires full verification, artifact convergence, and finishing-branch review.

## Required Commands

```powershell
pnpm test
pnpm test:worker
pnpm test:e2e
pnpm build
pnpm build:worker
pnpm dev:worker
pnpm smoke:worker
pnpm exec wrangler deploy --dry-run
git diff --check
```

`pnpm dev:worker` must serve both the SPA and Worker endpoints locally. The implementation must not require running a second manually coordinated frontend server.

## Delivery Decomposition

The specification remains one user-visible feature, but implementation is reviewed in five coherent groups:

1. Shared transition and auction correction.
2. Privacy contract and projections.
3. Durable Object room runtime.
4. Online React experience.
5. Deployment convergence.

Each group produces independently testable software and a separate update record. Tasks must not be parallelized when they edit `gameReducer.ts`, shared match types, protocol types, or `GameTable.tsx`.

## Known Risks and Mitigations

- Extracting `gameReducer.ts` can regress mature local behavior: preserve the public reducer contract until all callers migrate and run the full domain suite after every extraction step.
- Sanitized state may make existing UI selectors assume missing secrets: introduce explicit view models and server-provided allowed actions rather than inserting fake zero resources into `GameState`.
- The pinned Workers test pool is not the latest major-compatible release: keep it isolated in `vitest.worker.config.ts`, document the compatibility reason, and avoid upgrading Vite/Vitest in this feature.
- WebSocket hibernation discards memory: persist every rule-relevant value and use serialized socket attachments only for reconstructable connection identity.
- Full Commerce Guild scope increases state combinations: make sealed bidding a separate reviewed task after core room commands pass.
- Production deployment changes hosting: keep GitHub Pages intact until the Cloudflare production address and rollback path are verified.

## Planning Completion Criteria

- `research.md` records platform and dependency decisions.
- `data-model.md` defines persisted, wire, and client states without privacy ambiguity.
- `contracts/protocol.md` defines all first-version endpoints and messages.
- `quickstart.md` defines local setup and verification without Cloudflare secrets in the repository.
- `tasks.md` maps every OM requirement to test-first implementation work.
- Artifact analysis has no unresolved critical or high finding before implementation starts.
