# Update: Delivery Automation U020-U024

Date: 2026-07-08 20:36
Feature: 001-catan-imitation
Related tasks: U020, U021, U022, U023, U024
Related commits / PR: pending

## Intent

Complete the final ordered backlog slice by making the project easier to verify, deploy, review, and hand off through GitHub.

## Scope

Added GitHub Actions CI, GitHub Pages deployment, a stable UI smoke command, PR/issue templates, and a roadmap milestone document.

## Code Changes

- `.github/workflows/ci.yml`: runs install, unit tests, production build, and UI smoke on push to `master` and pull requests.
- `.github/workflows/pages.yml`: runs `pnpm build:pages` and deploys `dist` to GitHub Pages.
- `scripts/smoke-ui.mjs`: starts Vite preview through the Vite API, fetches built assets, and checks board/panel/activity/responsive CSS signals.
- `package.json`: adds `pnpm build:pages`, `pnpm smoke:ui`, and a pinned pnpm package manager.
- `.github/PULL_REQUEST_TEMPLATE.md`: adds scope and verification checklist.
- `.github/ISSUE_TEMPLATE/bug_report.md`: adds reproducible bug-report template.
- `.github/ISSUE_TEMPLATE/feature_request.md`: adds scoped feature-request template.
- `docs/roadmap.md`: records completed milestones and planned future work.
- `README.md`: adds deployment URL, smoke command, and roadmap link.
- `test/domain/deliveryReadiness.test.ts`: adds acceptance coverage for U020-U024.
- `test/types/node-fs.d.ts`: adds the test-only `existsSync` declaration.

## Spec / Task Changes

- `specs/001-catan-imitation/update-backlog.md`: marked U020-U024 complete and recorded acceptance evidence.
- `specs/001-catan-imitation/tasks.md`: marked U020-U024 complete.
- `specs/001-catan-imitation/quickstart.md`: added `pnpm smoke:ui`.
- `specs/001-catan-imitation/handoff.md`: updated implemented scope, verification counts, delivery automation, known limits, and next steps.
- `.codex/worklog/001-catan-imitation/ledger.md`: added this update index.
- `.codex/worklog/001-catan-imitation/handoff-source.md`: updated current completion point and next action.

## Decisions

- Decision: implement UI smoke with Vite preview and Node built-ins instead of adding Playwright.
- Reason: this satisfies the CI smoke requirement with no new dependencies and a small verification surface.
- Alternatives: add Playwright for full browser rendering and click-flow automation.
- Reversibility: future browser-level smoke can replace or supplement `scripts/smoke-ui.mjs`.

- Decision: deploy to GitHub Pages using the repository path `/Catan-Imitation/`.
- Reason: this matches the existing GitHub repository location and keeps deployment in GitHub-native automation.
- Alternatives: Vercel, Netlify, or another static host.
- Reversibility: deployment workflow is isolated in `.github/workflows/pages.yml`.

## Verification

- Command: `pnpm test -- test/domain/deliveryReadiness.test.ts`
- Result: passed.
- Evidence: 9 test files passed, 31 tests passed.

- Command: `pnpm build`
- Result: passed.
- Evidence: TypeScript build and Vite production bundle completed.

- Command: `pnpm build:pages`
- Result: passed.
- Evidence: Vite production bundle used `/Catan-Imitation/` asset paths.

- Command: `pnpm smoke:ui`
- Result: passed.
- Evidence: built preview exposed board, panels, Activity, and responsive CSS.

## Risks / Follow-ups

- GitHub Pages requires the repository Pages environment to be enabled if it is not already active.
- UI smoke is static-preview level; browser click-flow and screenshot automation remain future work.

## Handoff

Push to `master`, then inspect GitHub Actions and Pages deployment results.
