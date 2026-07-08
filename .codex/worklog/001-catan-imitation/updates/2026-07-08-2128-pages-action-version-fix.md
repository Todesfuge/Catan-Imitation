# Update: Pages Action Version Fix

Date: 2026-07-08 21:28
Feature: 001-catan-imitation
Related tasks: U020-U024 fix
Related commits / PR: pending

## Intent

Reduce the GitHub Pages deployment failure surface after the `Configure Pages` job reported a Pages API 404 and a Node 20 deprecation warning.

## Scope

Updated the Pages deployment workflow to current Pages action major versions so the workflow runs on the supported action runtime. The remaining `Pages site failed` 404 is a repository setting issue: GitHub Pages must be enabled and configured to use GitHub Actions.

## Code Changes

- `.github/workflows/pages.yml`: upgraded `actions/configure-pages` from v5 to v6, `actions/upload-pages-artifact` from v3 to v4, and `actions/deploy-pages` from v4 to v5.
- `test/domain/deliveryReadiness.test.ts`: added assertions that the Pages workflow stays on the current Pages action versions.

## Spec / Task Changes

- `.codex/worklog/001-catan-imitation/ledger.md`: added this update index.

## Decisions

- Decision: do not add `enablement: true` to `actions/configure-pages`.
- Reason: the screenshot indicates the repository Pages site is not enabled/configured; relying on an action-side enablement path can require different token permissions and may hide the actual repository setup requirement.
- Alternatives: manually enable Pages in GitHub Settings, or later add a dedicated PAT-backed enablement step if automated repo provisioning becomes a requirement.
- Reversibility: action versions can be pinned back if GitHub reports compatibility issues.

## Verification

- Command: `git ls-remote --tags` for `actions/configure-pages@v6`, `actions/upload-pages-artifact@v4`, and `actions/deploy-pages@v5`.
- Result: passed.
- Evidence: all three tags exist upstream.

- Command: `pnpm test -- test/domain/deliveryReadiness.test.ts`
- Result: passed.
- Evidence: 9 test files passed, 31 tests passed.

- Command: `pnpm build:pages`
- Result: passed.
- Evidence: TypeScript build and Vite bundle completed with `/Catan-Imitation/` base.

## Risks / Follow-ups

- GitHub Pages still needs to be enabled in repository Settings with Source set to GitHub Actions.
- The local environment does not have `gh`, so the remote Actions run could not be inspected from the CLI.

## Handoff

After push, enable Pages in GitHub Settings, then rerun the latest `Deploy GitHub Pages` workflow.
