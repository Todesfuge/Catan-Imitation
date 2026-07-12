# Update: T022 requirement convergence and handoff

Date: 2026-07-13
Feature: 002 Cloudflare online multiplayer
Related tasks: T022, T023 / OM-001 through OM-065
Related commits / PR: none; controller owns integration

## Intent

Converge the released feature against every numbered requirement, preserve evidence honesty, prepare a team-facing handoff, and record the T023 fixes required by whole-branch review.

## Scope

- Added one explicit verification row for every OM-001 through OM-065.
- Audited Spec Kit artifacts, tests, release records, and production evidence for missing implementation requirements.
- Recorded the two Important final-review findings: real page refresh did not restore the retained seat, and ticket issuance/persisted outstanding tickets were unbounded.
- Added T023 test-first fixes and updated only evidence-supported task/spec/checklist status.
- Added the whole-feature external handoff.

## Code Changes

- Added a room-code-only active credential pointer with safe volatile fallback, boot-time Online route/session restoration, and explicit pointer clearing.
- Added persisted ticket validation/issuance caps (8 per seat, 32 per room) and a 10-authenticated-admission/2-second in-memory route limiter using stable `RATE_LIMITED`/HTTP 429; saturated store-level rejections count before later requests are stopped ahead of ticket crypto/storage.
- Deleted the unused `createBufferedCryptoRandomSource` export. No dependency, persisted field, schema version, or Wrangler migration changed.
- Added focused client/lobby/Worker tests and an actual production-UI `page.reload()` assertion.

## Spec / Task Changes

- `specs/002-cloudflare-online-multiplayer/verification.md`: requirement-level evidence matrix.
- `specs/002-cloudflare-online-multiplayer/handoff.md`: team-facing release handoff.
- `spec.md`, `tasks.md`, and `checklists/requirements.md`: released/convergence state, with controller-owned terminal gates left open.

## Decisions

- Decision: append T023 without renumbering earlier tasks.
- Reason: the T022 whole-branch review found genuine OM-019/OM-054 availability gaps despite the initial evidence mapping.
- Decision: preserve the T021 evidence-substitution waiver verbatim in substance.
- Reason: remote rendering/lobby/room creation plus the local combined-Worker three-context suite is approved evidence, but it is not a remote three-browser run.

## Verification

- Deterministic matrix check passed: all 65 IDs appear exactly once and all 34 cited repository paths exist.
- Handoff content check passed: all 14 required release/architecture/limitation/rollback markers are present.
- `pnpm exec vitest run test/domain/deliveryReadiness.test.ts test/domain/localization.test.ts test/domain/frontendAccessibility.test.ts`: 3 files and 9 tests passed.
- Relative Markdown link check passed: 14 targets across 9 release/convergence documents exist.
- T022 task-state check passed: the two implementer steps are checked and all five controller terminal steps remain open.
- `src/app/gameReducer.ts` boundary check passed: no networking, projection, random, or rule-switch markers; the file remains 36 lines.
- `git diff --check` passed with only Windows LF-to-CRLF notices.
- T023 RED: client storage 4 failed/27 passed; lobby 2 failed/12 passed; Worker lifecycle 3 failed/45 passed; real three-browser reload 1/1 failed because `.online-game-shell` disappeared after refresh.
- T023 review-remediation GREEN: client/lobby 45/45; Worker lifecycle 51/51; main 312/312; Worker 97/97; online E2E 2/2; builds/smoke passed; real three-browser reload/reconnect scenario 1/1 passed. Saturated authenticated 429s stop before later crypto/storage, and legacy-v1 records normalize expired excess before strict bounds.
- T023 implementer regression gates and exact current counts are in `.superpowers/sdd/reports/T023-recovery-ticket-hardening-implementer.md`.
- The controller still owns independent re-review and the expensive fresh full final T022 gate.

## Risks / Follow-ups

- Same-origin anonymous recovery remains intentionally unrecoverable after storage clearing or device change.
- Remote three-browser and Cloudflare hibernation-callback evidence remain optional strengthening; neither is claimed here.
- T023 requires independent re-review; T022 independent review, final full gate, and finishing-branch choice remain open.

## Handoff

Use `specs/002-cloudflare-online-multiplayer/handoff.md`, `verification.md`, and the T023 implementer report; controller proceeds to independent review and the fresh final gate.
