# Update: Cloudflare online multiplayer release

Date: 2026-07-12 to 2026-07-13
Feature: 002 Cloudflare online multiplayer
Related tasks: T021 / OM-064 / OM-065
Related commit: this release commit, `docs: publish Cloudflare online multiplayer`

## Intent

Publish the combined SPA and authoritative online-room service on Cloudflare Workers, document the verified release, and retire duplicate GitHub Pages hosting only after production acceptance.

## Scope

- Preview Worker: `https://catan-imitation-preview.catan-imitation.workers.dev/`
- Preview deployment: `pnpm build:worker`, then `pnpm exec wrangler deploy --name catan-imitation-preview`
- Production Worker: `https://catan-imitation.catan-imitation.workers.dev/`
- Cloudflare Workers Builds connected to GitHub `main`
- English and Simplified Chinese release documentation
- GitHub Pages publishing removal and delivery-readiness contract update

## Code Changes

- `.github/workflows/pages.yml`: removed after production acceptance so Cloudflare is the single production host.
- `test/domain/deliveryReadiness.test.ts`: replaced the Pages-specific delivery contract with CI and Worker build/deploy documentation requirements.
- `README.md` and `README.zh-CN.md`: made Cloudflare production primary and documented Local/Online selection, anonymous-seat recovery limits, commands, and rollback.
- `specs/002-cloudflare-online-multiplayer/quickstart.md`: recorded the verified preview/production workflow and evidence boundary.
- `specs/001-catan-imitation/handoff.md`: replaced stale local-only status with the released online architecture and limitations.

## Spec / Task Changes

- T021 records the explicit user-approved evidence substitution that closes preview and production acceptance without claiming a remote three-browser run.
- The final post-edit release gate and release commit are complete.

## Decisions

- Decision: use Cloudflare Workers as the only production host and remove, rather than disable, the Pages workflow.
- Reason: the Worker must serve both SPA and same-origin room APIs; duplicate production hosts would make online availability and credential origin ambiguous.
- Alternatives: retain Pages as a static mirror or leave a disabled workflow. Both add a stale release path without serving the online API.
- Reversibility: restore the workflow from Git history if a future static-only mirror is explicitly required. Roll back Worker code by promoting the last verified version in Cloudflare deployment/version history.
- Decision: deploy preview builds to the separate `catan-imitation-preview` Worker because version preview URLs are not suitable for this Durable Object Worker.
- Decision: on 2026-07-13, accept the local combined-Worker full three-context API/WebSocket/privacy/reconnect/stored-recovery/responsive suite together with real preview/production rendering, bilingual lobby, and room creation as T021 acceptance evidence.
- Reason: the controller network could not execute the full suite against `workers.dev`, and the user explicitly approved the substitution. This is a waiver, not evidence of a remote three-browser run.

## Verification

- Fresh pre-preview local gate passed: `pnpm test` 307/307; `pnpm test:worker` 91/91; `pnpm test:e2e` 31/31; `pnpm build:worker`; `pnpm smoke:worker`; `pnpm exec wrangler deploy --dry-run`; `git diff --check`.
- Preview deploy succeeded with checked-in Worker configuration, assets, and the `ROOMS` Durable Object binding.
- The real preview rendered `Catan Imitation`, a populated React root, English-default Local/Online selection, complete Online lobby, and complete Simplified Chinese lobby copy.
- On 2026-07-12, the user created a preview room and confirmed its six-character code.
- Production deployment succeeded with version `9109402c-1f16-47cd-bbc2-254449afedd9`, checked-in assets, and the `ROOMS` binding.
- The real production page rendered the populated React root, English-default Local/Online selection, complete Online lobby, and complete Simplified Chinese lobby copy.
- On 2026-07-13, the user confirmed Workers Builds for GitHub `main` and production room creation with a six-character code.
- The full three-context API/WebSocket, privacy, authoritative-play, reconnect, stored-state recovery, and responsive suite ran against the combined Worker locally. The user explicitly approved combining that evidence with real preview/production rendering, bilingual lobby, and room creation to close T021 preview and production acceptance; no remote three-browser run is claimed.
- The controller verified the retired GitHub Pages URL returns HTTP 404.
- Post-edit delivery-readiness contract passed: `pnpm exec vitest run test/domain/deliveryReadiness.test.ts` (2/2).
- Focused reciprocal-link, stale-URL, link-target, and Pages-absence checks passed; `git diff --check` passed.
- Fresh final T021 gate passed: `pnpm test` 307/307; `pnpm test:worker` 91/91; `pnpm test:e2e` 31/31; `pnpm build`; `pnpm build:worker`; `pnpm smoke:worker`; `pnpm exec wrangler deploy --dry-run`; link/content checks; and `git diff --check`.
- Independent T021 re-review approved the release with no Critical, Major, or Minor findings.

No account identifier, login detail, bearer credential, connection ticket, or room secret is stored in this record.

## Risks / Follow-ups

- Anonymous seat recovery is limited to the same browser origin and retained site storage; clearing storage loses the seat, and cross-device recovery is unavailable.
- Inactive rooms expire after 24 hours; active connections defer expiry. Long-term saved games, accounts, matchmaking, and spectators remain out of scope.
- T022 convergence and branch finishing remain to be completed.

## Handoff

Proceed to T022 convergence.
