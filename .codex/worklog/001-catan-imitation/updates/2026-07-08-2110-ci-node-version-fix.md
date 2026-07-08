# Update: CI Node Version Fix

Date: 2026-07-08 21:10
Feature: 001-catan-imitation
Related tasks: U020, U021
Related commits / PR: pending

## Intent

Fix the failed GitHub Actions install step reported after the delivery automation push.

## Scope

Updated both CI and Pages workflows from Node 20 to Node 22 so Corepack can run the pinned `pnpm@11.7.0`, then migrated the pnpm 11 build-script approval for `esbuild` to the active `allowBuilds` setting.

## Code Changes

- `.github/workflows/ci.yml`: changed `actions/setup-node` from `node-version: 20` to `node-version: 22`.
- `.github/workflows/pages.yml`: changed `actions/setup-node` from `node-version: 20` to `node-version: 22`.
- `pnpm-workspace.yaml`: replaced the removed `onlyBuiltDependencies` setting with `allowBuilds.esbuild: true`, which is required by Vite/esbuild under pnpm 11's build-script policy.
- `test/domain/deliveryReadiness.test.ts`: added assertions that both workflows use Node 22 and that `esbuild` is allowlisted in `pnpm-workspace.yaml`.

## Spec / Task Changes

- `.codex/worklog/001-catan-imitation/ledger.md`: added this update index.

## Decisions

- Decision: upgrade workflow Node instead of downgrading pnpm.
- Reason: the repository is already pinned to `pnpm@11.7.0`, local verification runs on Node 22.14.0, and GitHub's failure explicitly says pnpm 11 needs at least Node 22.13.
- Alternatives: pin pnpm 10, remove packageManager pin, or install a separate pnpm version in CI.
- Reversibility: workflow Node versions are isolated in two YAML files.

- Decision: keep pnpm's build-script approval in `pnpm-workspace.yaml` using `allowBuilds`.
- Reason: pnpm 11 removed the old `onlyBuiltDependencies` setting and reports ignored build scripts unless package build approvals are expressed through `allowBuilds`.
- Alternatives: run `pnpm approve-builds --all` to generate the same class of approval, pin pnpm 10, or avoid dependencies that need install-time build scripts.
- Reversibility: remove or adjust the `allowBuilds` entry if the dependency graph changes.

## Verification

- Command: `pnpm test -- test/domain/deliveryReadiness.test.ts`
- Result: passed.
- Evidence: 9 test files passed, 31 tests passed.

- Command: clean local clone, then `pnpm install --frozen-lockfile`
- Result: passed.
- Evidence: install completed without ignored build-script failure.

- Command: `pnpm test`
- Result: passed.
- Evidence: 9 test files passed, 31 tests passed.

- Command: `pnpm build`
- Result: passed.
- Evidence: TypeScript build and Vite production bundle completed.

- Command: `pnpm build:pages`
- Result: passed.
- Evidence: Vite production bundle completed with `/Catan-Imitation/` base.

- Command: `pnpm smoke:ui`
- Result: passed.
- Evidence: built preview exposed board, panels, Activity, and responsive CSS.

## Risks / Follow-ups

- Re-run the failed GitHub Actions jobs or push this commit and inspect the new runs.

## Handoff

After push, verify `CI` and `Deploy GitHub Pages` no longer fail at `Install dependencies`.
