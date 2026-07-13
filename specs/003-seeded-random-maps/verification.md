# Seeded Random Maps Verification

Status: Whole-branch review converged; final root release-gate rerun pending; not deployed

Verified on 2026-07-13 from `codex/seeded-random-maps`. The reviewed feature range starts at merge base `7eef0d4` and includes browser-convergence commit `dd29d0d`, review-convergence commit `0d8f2b5`, and the documentation/release delta described below.

## Release Gate Results

| Gate | Result |
| --- | --- |
| Documentation/localization focus | `pnpm exec vitest run test/domain/deliveryReadiness.test.ts test/domain/localization.test.ts`: 2 files, 10 tests passed. |
| React discard regression focus | `pnpm exec vitest run test/domain/productPolish.test.ts`: 1 file, 20 tests passed. |
| Domain/client suite | `pnpm test`: 34 files, 432 tests passed. The 1,000-seed invariant case passed. |
| Worker suite | `pnpm test:worker`: 7 files, 242 tests passed. The command exited 0; Miniflare emitted non-failing temporary-directory cleanup warnings after shutdown. |
| Browser suite | `pnpm test:e2e`: 2 projects, 42 tests passed in 1.1 minutes: 39 `local-preview` and 3 `online-worker`. |
| Random-map browser stress | `pnpm exec playwright test --project=local-preview --grep "explicit maritime choices fund" --repeat-each=3`: 9/9 passed (Road, Settlement, and City each 3/3) in 28.3 seconds. `pnpm exec playwright test --project=local-preview --grep "robber guidance stays readable" --repeat-each=3`: 3/3 passed in 16.5 seconds after the React event-lifetime fix. |
| Review-convergence domain focus | `pnpm exec vitest run test/domain/randomBoard.test.ts test/online/protocol.test.ts test/online/onlineGameUi.test.ts`: 3 files, 146/146 tests passed. `pnpm exec vitest run test/domain/productPolish.test.ts`: 1 file, 20/20 tests passed. |
| Review-convergence Worker focus | `pnpm exec vitest run --config vitest.worker.config.ts test/worker/roomMigration.test.ts`: 1 file, 120/120 tests passed. The command exited 0; Miniflare emitted non-failing shutdown cleanup warnings. |
| SPA build | `pnpm build`: TypeScript passed; Vite transformed 1,624 modules and emitted the production bundle. |
| Worker build | `pnpm build:worker`: SPA build and `tsc -p tsconfig.worker.json` passed. |
| UI smoke | `pnpm smoke:ui`: built preview exposed board, trade, localization, scrolling, and responsive CSS. |
| Worker smoke | `pnpm smoke:worker`: security/cache headers, rendered SPA, room API, single-use ticket, and WebSocket snapshot passed against health schema 2. |
| Deployment dry-run | `pnpm exec wrangler deploy --dry-run --config wrangler.jsonc`: 4 asset files, 228.22 KiB upload / 47.46 KiB gzip; `ROOMS` Durable Object and `ASSETS` bindings resolved; no deployment performed. |
| Production demo guard | `rg -n "createDemoGame" src worker`: no matches. |
| Legacy projection guard | `rg -n "boardLayout.*standard-v1" src worker`: no matches. |
| Whitespace | `git diff --check`: passed. |

The full-suite counts above were recorded before the final review corrections. The focused post-review commands cover every changed production boundary and pass. The root agent must rerun the complete release gates on the committed branch before push, merge, or deployment and record any changed aggregate counts if necessary.

## Production Address Evidence

- The production target is `https://catan-imitation.workers.dev/`.
- That address and its external Cloudflare configuration were operator-confirmed under the approved evidence-substitution path before T009.
- T009 performed no production or preview deployment. The current environment was network-constrained and could not remotely reverify the live target, so repository string checks and the Wrangler dry-run are not presented as proof of a live deployment.

## Browser and Visual Evidence

- Local opens directly in empty setup with four zero-resource players, no buildings or roads, a canonical `M1-` seed, and disabled normal actions. Same-map restart preserves the complete SVG signature; fresh restart changes both seed and signature.
- Clipboard denial leaves the seed selectable, presents localized failure feedback, and keeps restart controls usable.
- Three isolated Online contexts reconstruct equal 19-hex/9-port DOM signatures. Same-map and fresh-map host restarts each increment room version exactly once; a non-host direct command is rejected without state change; reload/reconnect receives the complete current setup and original seat.
- The Online restart path is isolated from the existing long authoritative-game flow, so each test has one convergence objective and the original 180-second gameplay budget remains unchanged.
- Full-run screenshots cover Local clean/fresh setup, Online host desktop, Online participant mobile, and expanded restart confirmation at English/Chinese 1280/390 widths. Visual review found 0 P0 and 0 P1 issues; mobile confirmation remains scrollable with Cancel and Confirm reachable, and no horizontal overflow was observed.

## Integration Defects Proven During T009

1. Accepting or cancelling a projected player trade could retain a stale optional `pendingPlayerTrade` own-property after a successful reducer merge. Focused reducer tests failed before the merge boundary explicitly deleted absent optional state and passed afterward.
2. A random setup could require seven-roll discards and expose a React event-lifetime crash: `TurnFlowPanel` read `event.currentTarget.value` from a deferred state updater after React had released the event. The trace captured the `TypeError` and blank root. The handler now captures the number synchronously; focused and repeated browser paths pass.
3. The Worker smoke script still expected health schema 1 after the storage/protocol v2 upgrade. A delivery guard failed before the smoke contract was updated to schema 2; the real Worker smoke then passed.

## Requirement Evidence

| Requirement | Status | Evidence |
| --- | --- | --- |
| RM-001 | Pass | `test/domain/randomBoard.test.ts` verifies one shared 19-hex topology over 1,000 canonical seeds. |
| RM-002 | Pass | Random-board invariant suite verifies the exact terrain multiset. |
| RM-003 | Pass | Random-board invariant suite verifies the exact number multiset and desert without a number. |
| RM-004 | Pass | Random-board invariant suite verifies 6/8 tokens form an independent set. |
| RM-005 | Pass | Random-board invariant suite verifies nine coastal ports with the required non-adjacency rule. |
| RM-006 | Pass | Random-board identity assertions prove M1 geometry IDs do not encode terrain, number, or port content; M0 remains the explicit compatibility exception. |
| RM-007 | Pass | Map-seed golden vectors, Worker-safe generation, projection reconstruction, and three-browser DOM signatures agree. |
| RM-008 | Pass | Bounded candidate/unranking generation completes for all 1,000 tested seeds without retry loops. |
| RM-009 | Pass | `test/domain/mapSeed.test.ts` covers canonical 64-bit parsing, formatting, and bounds. |
| RM-010 | Pass | Match-transition tests separate public map entropy from hidden deck/dice entropy. |
| RM-011 | Pass | Match creation, Local boot, Online start, and fresh restart all create a new M1 map. |
| RM-012 | Pass | Local Playwright starts in real setup with the four current default players. |
| RM-013 | Pass | Match-transition and Local/Online browser assertions verify no pieces, resources, private cards, pending trade, or active auction at setup. |
| RM-014 | Pass | Same-map transition and browser signature assertions preserve seed/layout while clearing match and Commerce Guild state. |
| RM-015 | Pass | Fresh transition and browser signature assertions replace seed/layout while applying the same reset matrix. |
| RM-016 | Pass | Transition and browser tests return both restart modes to snake-order settlement placement. |
| RM-017 | Pass | Prepared scenarios live under `test/fixtures`; the repository guard proves `createDemoGame` is absent from `src` and `worker`. |
| RM-018 | Pass | Protocol projections and Settings expose the canonical public seed without redundant board arrays. |
| RM-019 | Pass | Bilingual accessible copy action/status has unit, browser-success, denial, retry, and stale-completion coverage. |
| RM-020 | Pass | Local Settings exposes confirmed fresh and same-map controls with atomic reset coverage. |
| RM-021 | Pass | Projection capability/privacy tests and three-context UI assertions expose restart only to the authenticated host. |
| RM-022 | Pass | Worker restart suites allow the host restart transition from supported room phases; UI requires explicit confirmation. |
| RM-023 | Pass | Strict protocol tests reject client-supplied seed/actor/host fields; the UI sends mode only. |
| RM-024 | Pass | Worker authorization derives the latest host identity from persisted authenticated seat state. |
| RM-025 | Pass | Restart ordering, exact version increment, idempotency, persistence-before-broadcast, retry context, and recipient convergence pass. |
| RM-026 | Pass | Reset matrices cover pending trade, seven/development state, auction bids/outcomes, acknowledgements, and caller projections. |
| RM-027 | Pass | Worker storage validation requires schema 2 for current rooms. |
| RM-028 | Pass | Migration tests accept only an exact released fixed playing/finished board, assign `M0-STANDARD`, and preserve live state. |
| RM-029 | Pass | Parser, protocol, projection, and migration tests reject malformed/noncanonical/unsupported seeds and changed legacy boards without partial write. |
| RM-030 | Pass | Protocol v2 carries public seed and caller restart capability; incompatible schema paths return the existing recovery response. |
| RM-031 | Pass | Transition construction, migration validation, projection preflight, and failed restart tests prove atomic no-partial-write/no-broadcast behavior. |
| RM-032 | Pass | Unit UI plus real clipboard-denial browser coverage verifies localized failure and selectable manual fallback. |
| RM-033 | Pass | Focused map, transition, protocol, migration, authority, concurrency, and privacy suites are included in the 432 + 242 passing tests. |
| RM-034 | Pass | Local and three-isolated-context Online Playwright evidence is included in the 42-test browser gate. |
| RM-035 | Pass | Independent whole-branch review completed. Confirmed findings were resolved in `0d8f2b5` with focused RED/GREEN evidence for ordinal board identity, M1 storage strictness, presence/projection identity, discard convergence, and random-map maritime Road/Settlement/City behavior. A final complete root gate rerun remains required before push or deployment. |
