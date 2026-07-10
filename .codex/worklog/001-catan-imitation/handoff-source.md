# Handoff Source: 001-catan-imitation

Current phase: CR-001 through CR-030 are committed at `15e3e95`; CR-031 through CR-042 / U047-U059 are implemented, verified, and authorized for GitHub delivery.

The project is a local hot-seat React and TypeScript Catan-style prototype with a Commerce Guild expansion and statistics panel. Work synchronizes to `https://github.com/Todesfuge/Catan-Imitation`. Spec Kit CLI tools are unavailable, so the workflow is represented manually by `.specify/`, `specs/001-catan-imitation/`, and this private worklog.

Completed and verified:

- MVP T001-T026 and updates U001-U059.
- Core rules CR-001 through CR-030 remain preserved.
- Frontend CR-031 through CR-042 add typed recoverable commands, shared availability, explicit targets/trades, complete setup/restart, Commerce participant controls, accessible dialog/live/touch states, responsive ordering, and production-browser regression coverage.
- Baseline: `pnpm test` 20 files / 108 tests; `pnpm test:e2e` 12 tests; production and Pages builds; UI smoke; rendered 1280/768/390 checks; `git diff --check`.
- Focused code review converged with no remaining Critical or Important finding.

Boundary decisions:

- Domain rules throw `RuleViolationError`; the production reducer catches only this expected class and rethrows implementation faults.
- One composed selector owns visible turn and Commerce availability, reasons, costs/ratios, targets, and participant limits.
- Strategic choices remain local UI modes until an explicit target/resource pair dispatches an existing typed command.
- Native `<dialog>` provides modal focus behavior; SVG overlays use visible markers plus non-scaling 44px hit layers.

Still out of scope:

- Networking, persistence, AI players, generalized/randomized board generation, and unrelated visual redesign.

Next action: push the authorized `main` commit and monitor GitHub Actions.
