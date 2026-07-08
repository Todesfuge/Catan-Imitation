# Update: Main Branch Pages Deploy

Date: 2026-07-08 21:40
Feature: 001-catan-imitation
Related tasks: U020-U024 fix
Related commits / PR: pending

## Intent

Resolve the GitHub Pages deployment rejection: `Branch "master" is not allowed to deploy to github-pages due to environment protection rules`.

## Scope

Move delivery automation from `master` to the repository default branch `main`, because GitHub reports `origin/HEAD` as `main` and the Pages environment protection rule allows deployments from that branch.

## Code Changes

- `.github/workflows/ci.yml`: changed push trigger branch from `master` to `main`.
- `.github/workflows/pages.yml`: changed push trigger branch from `master` to `main`.
- `test/domain/deliveryReadiness.test.ts`: added assertions that both delivery workflows target `main`.

## Spec / Task Changes

- `.codex/worklog/001-catan-imitation/ledger.md`: added this update index.

## Decisions

- Decision: push the project history to `origin/main` instead of changing the GitHub environment to allow `master`.
- Reason: `git remote show origin` reports the repository HEAD branch is `main`, so using `main` aligns with the repository default and the Pages environment protection rule.
- Alternatives: allow `master` in the `github-pages` environment protection rules, or force-push over `main`.
- Reversibility: workflow branch filters can be changed back, and `origin/master` remains available during transition.

## Verification

- Command: `git remote show origin`
- Result: passed.
- Evidence: remote HEAD branch is `main`.

- Command: `pnpm test -- test/domain/deliveryReadiness.test.ts`
- Result: passed.
- Evidence: 9 test files passed, 31 tests passed.

- Command: `pnpm build:pages`
- Result: passed.
- Evidence: TypeScript build and Vite bundle completed with `/Catan-Imitation/` base.

## Risks / Follow-ups

- `origin/main` contained only the initial README commit and was unrelated to the project history; it should be merged with `--allow-unrelated-histories` to avoid a destructive force push.
- After push, the GitHub Pages workflow should run from `main`, not `master`.

## Handoff

After push to `origin/main`, inspect the latest `Deploy GitHub Pages` run and confirm it is no longer blocked by environment branch protection.
