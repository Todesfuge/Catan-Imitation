# Project Constitution

Project: Catan Imitation portfolio prototype
Version: 1.0.0
Ratified: 2026-07-08
Last amended: 2026-07-08

## Principles

### 1. Playable Core Before Decorative Completeness

The first deliverable must be a playable local prototype that demonstrates the Catan-like turn loop, board interaction, resource production, scoring, and the original commerce expansion. Visual fidelity matters, but it cannot displace rules that the user can operate and verify.

### 2. Pure Game Rules, Thin UI

Game state transitions, resource production, statistics, trading, auctions, and scoring must live in pure TypeScript modules. React components may render state and dispatch commands, but must not hide business rules inside component-local effects.

### 3. High Cohesion, Low Coupling

Each domain module owns one concept: board geometry, core rules, statistics, or commerce guild. Modules communicate through typed data and command functions. Cross-module imports should point inward to stable domain types, not sideways into UI components.

### 4. Traceable Delivery

Every meaningful stage must be documented in Spec Kit artifacts or a curated development log. Claims of completion require evidence: build, test, or manual smoke checks. Internal scratch records may stay private, but portfolio-facing documents must be readable without knowing the agent workflow.

### 5. Time-Boxed Scope Control

The two-hour challenge optimizes for a convincing, inspectable product slice. Networking, account systems, matchmaking, persistence, and full AI opponents are out of scope unless the playable single-machine version is already complete.

## Governance

- This constitution overrides convenience-driven implementation choices when scope, architecture, or verification are in conflict.
- Feature work starts from `specs/<feature>/spec.md`, proceeds through `plan.md` and `tasks.md`, and is verified before being marked complete.
- Changes that add dependencies, shared abstractions, or major UI modes must explain why a smaller solution is insufficient.
- Version changes:
  - Patch: wording clarifications only.
  - Minor: new principle or changed verification rule.
  - Major: changed project objective or authority model.
