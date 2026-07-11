# Task 8 (T008) Report — Combined Cloudflare Worker Runtime Harness

Date: 2026-07-11
Requirements: OM-060 through OM-063
Commit intent: `build: add Cloudflare Worker runtime`

## Outcome

The repository now has one Wrangler entry point that serves the built Vite SPA and handles
`/api/*` worker-first. Task 8 intentionally implements only `/api/health`, API not-found
handling, static/SPA routing, and a real SQLite-backed `ROOMS` Durable Object binding whose
class returns an explicit `501 NOT_IMPLEMENTED` shell. Room lifecycle, tokens, WebSockets,
persistence, game commands, and other online behavior remain for later tasks.

The browser/domain Vitest project and Workers-runtime Vitest project are isolated. The Worker
suite exercises `SELF`, the SPA asset binding, and a real
`env.ROOMS.getByName(...).fetch()` call under the Cloudflare Workers pool.

## RED and GREEN History

The prior implementation session recorded the focused RED run after the Worker pool was able
to start. Of three smoke tests:

- `/api/health` failed because the initial response was `404`, not the expected `200`.
- The real `env.ROOMS.getByName(...).fetch()` Durable Object call failed because the initial
  shell response was `404`, not the expected `501`.
- The SPA fallback test already passed, proving the built assets and single-page fallback were
  reachable before production routing was implemented.

After the minimal Worker router and Durable Object shell were added, the GREEN run passed all
three tests: health JSON, SPA fallback, and the real `ROOMS` binding returning the explicit
Task 8 `501` response. The fresh final runs below independently confirm the final GREEN state.

## Windows Workers-Pool Debugging Matrix

The pinned `@cloudflare/vitest-pool-workers@0.8.70` pool was kept because it supports the
existing Vitest 2 line. Its Windows SQLite cleanup behavior required the following focused
configuration investigation:

| Configuration | Result |
|---|---|
| `isolatedStorage: true`, default temporary persistence path | Tests ran, but SQLite teardown ended in a fatal `EBUSY` path failure. |
| `isolatedStorage: false`, default persistence path | Worker startup/storage failed with `SQLITE_CANTOPEN`. |
| `isolatedStorage: true`, short `durableObjectsPersist` path | Real Durable Object binding passed 3/3 and the process exited 0. |

The final configuration uses
`node_modules/.tmp/vitest-worker/durable-objects`, retaining per-file isolated storage while
shortening the SQLite path on Windows. After the fresh final runs this path was absent (zero
persisted user Durable Object files), and the worktree `.wrangler` state contained only an
empty `tmp` directory. No user Durable Object state remained.

### Known non-fatal Windows warning

Both fresh Workers-pool commands exited 0 but printed the pool's teardown warnings verbatim:

```text
vitest-pool-worker: Unable to remove temporary directory: Error: EBUSY: resource busy or locked, rmdir '...\cache\miniflare-CacheObject'
vitest-pool-worker: Unable to remove temporary directory: Error: EBUSY: resource busy or locked, rmdir '...\do\vitest-pool-workers-runner--__VITEST_POOL_WORKERS_USER_OBJECTRoomDurableObject'
```

These paths are internal, randomly named Miniflare runner temporary directories under the
Windows user temp directory, not the configured user Durable Object persistence directory.
The warning occurs after 3/3 tests pass during `[vpw:debug] Shutting down runtimes...`; the
process still exits 0. It is therefore recorded as an environment/tooling cleanup concern,
not a product failure. No output filtering or warning suppression was added.

## Configuration and Dependency Audit

- Direct versions are pinned as required: `wrangler@4.110.0` and
  `@cloudflare/vitest-pool-workers@0.8.70`.
- Existing `vite@5.4.14` and `vitest@2.1.8` resolutions remain unchanged; there was no
  toolchain major upgrade.
- `pnpm-workspace.yaml` keeps the existing `esbuild` allow-build entry and adds only the
  Cloudflare dependency requirements `sharp` and `workerd`.
- `pnpm install --lockfile-only --frozen-lockfile` reported `Already up to date` under the
  repository-pinned pnpm 11.7.0. The lockfile importer contains exactly the requested direct
  additions. `wrangler@4.34.0` is also present only as the fixed pool 0.8.70's transitive
  dependency (`pnpm why wrangler`); direct Wrangler remains 4.110.0. No temporary package or
  placeholder dependency was found.
- `wrangler.jsonc` declares `dist` assets, `ASSETS`, SPA fallback,
  `run_worker_first: ["/api/*"]`, the `ROOMS` class binding, and migration `v1` with
  `new_sqlite_classes: ["RoomDurableObject"]`.
- `compatibility_date` is `2025-09-02`, matching the supported date used by the pinned
  Workers-pool workerd line.
- A fresh `pnpm exec wrangler types worker-configuration.d.ts` used Wrangler 4.110.0 and
  regenerated `ASSETS`, `ROOMS`, `RoomDurableObject`, and runtime types consistently with the
  current config. The generated header records runtime workerd 1.20260708.1 with compatibility
  date 2025-09-02.
- `vitest.config.ts` excludes Worker and e2e tests. `tsconfig.app.json` excludes Worker tests.
  `vitest.worker.config.ts` and `tsconfig.worker.json` own the Worker runtime tests/types.
- Package scripts match the task workflow. `test:worker`, `build:worker`, `dev:worker`, and
  `smoke:worker` build `dist` before using the combined runtime.

## Fresh Final Verification

All commands were run from `C:\Study\Catan\.worktrees\online-multiplayer` on 2026-07-11.

| Command | Fresh result |
|---|---|
| `pnpm smoke:worker` | Exit 0; Vite 5.4.14 built 1,613 modules; Worker smoke 1 file, 3/3 tests passed. Non-fatal Windows teardown warnings recorded above. |
| `pnpm test:worker` | Exit 0; combined build passed; Worker suite 1 file, 3/3 tests passed. Same non-fatal teardown warnings. |
| `pnpm test` | Exit 0; 27 files and 215/215 Node/domain/online tests passed. Worker tests were not collected. |
| `pnpm build:worker` | Exit 0; `tsc -b`, Vite production build, and `tsc -p tsconfig.worker.json` passed. |
| `pnpm exec wrangler deploy --dry-run` | Exit 0 using Wrangler 4.110.0; read 4 asset files; upload bundle validated; reported `env.ROOMS` Durable Object and `env.ASSETS` bindings. |
| `pnpm build` | Exit 0; `tsc -b` and Vite production build passed, 1,613 modules transformed. |
| `git diff --check` | Exit 0; no whitespace errors. Git emitted only existing Windows LF-to-CRLF conversion notices for tracked text files. |
| `pnpm install --lockfile-only --frozen-lockfile` | Exit 0; lockfile already up to date. |

## Files

Modified:

- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `tsconfig.app.json`
- `vitest.config.ts`

Added:

- `wrangler.jsonc`
- `tsconfig.worker.json`
- `vitest.worker.config.ts`
- `worker-configuration.d.ts`
- `worker/env.ts`
- `worker/index.ts`
- `worker/room/RoomDurableObject.ts`
- `test/worker/workerSmoke.test.ts`
- `.superpowers/sdd/task-8-report.md`

`specs/002-cloudflare-online-multiplayer/tasks.md` and progress records were not modified.

## Self-review

- Scope is deliberately minimal: no room creation, credential, token, WebSocket, persistence,
  match, or game implementation was introduced.
- `worker/index.ts` is a thin same-origin router. It does not own room or game behavior.
- `RoomDurableObject` is an explicit shell with no storage or transport behavior.
- The smoke test uses actual Cloudflare test bindings instead of a mocked namespace.
- Static fallback and API-first behavior are configured by Wrangler, while unknown `/api/*`
  requests cannot fall through to the SPA.
- Generated types and dry-run binding output agree with `wrangler.jsonc`.
- The only remaining concern is the documented non-fatal Windows temp-directory cleanup warning
  in the pinned test pool; it is visible, unsuppressed, and does not leave user DO state.
