# Technical Research: Gathering Pacing, Setup Grants, and Resource Iconography

Date: 2026-07-14
Specification: `specs/004-gathering-pacing-resource-icons/spec.md`

## Decision 1: Represent the cooldown as one absolute turn window

Decision:

- Add one `GatheringCooldownWindow` to `CommerceGuildState`.
- Store `availableAtTurn` and `displayDuration` rather than decrementing a counter on every turn.
- Derive the visible value with:

```text
min(displayDuration, max(0, availableAtTurn - game.turn))
```

- New matches use `availableAtTurn = game.turn + 2n` and `displayDuration = 2n`.
- A gathering started on turn `t` uses `availableAtTurn = t + n + 1` and `displayDuration = n`.

Rationale:

- The duration cap keeps the visible value at `n` through the initiator's current turn without a mutable skip flag.
- The absolute target makes reconnect and storage eviction deterministic from persisted state plus `game.turn`.
- A single table window is sufficient; no caller-keyed state or private projection is needed.

Rejected alternatives:

- Mutable remaining counter: requires an additional “skip initiating turn” flag and a write on every end turn.
- Wall-clock expiry or Worker alarm: does not match turn-based semantics and would introduce a second time source.
- Separate player cooldown: duplicates state and UI without adding fairness beyond the table-wide `n`-turn window.

## Decision 2: Put eligibility and cooldown math in the Commerce Guild owner

Decision:

- `src/domain/expansion/commerceGuild.ts` owns initial/post-gathering window creation, remaining-turn derivation, blocker calculation, start transition, and complete-to-idle transition.
- `src/domain/match/applyMatchCommand.ts` supplies the authenticated/local player id, pending-trade fact, logging, and end-turn orchestration.
- `src/app/actionAvailability.ts` maps the same domain blocker to the existing availability-reason model.

Rationale:

- This keeps business rules out of React and the Worker command facade.
- One blocker function prevents the enabled button and authoritative transition from drifting.
- `applyMatchCommand.ts` remains a coordinator instead of becoming the owner of formulas.

Rejected alternatives:

- Recompute eligibility independently in `CommercePanel.tsx`: a stale or malicious client could disagree with the domain.
- Put formulas in `commandPipeline.ts`: Local and Online would acquire separate implementations.
- Create a generic timer service: there is only one turn-based cooldown and no second implementation to justify it.

## Decision 3: Preserve the no-payload wire command and derive the actor at trust boundaries

Decision:

- Domain `START_GATHERING` carries `playerId`.
- Public `OnlineMatchCommand` remains exactly `{ "type": "START_GATHERING" }`.
- Local control supplies the current controlled player id.
- Worker `trustedCommand` injects the latest authenticated seat's `playerId`.

Rationale:

- The domain can enforce current-player authority without trusting caller input.
- Existing version, idempotency, persistence-before-broadcast, and projection-preflight behavior remains unchanged.

Rejected alternatives:

- Send `playerId` from the browser: permits impersonation attempts and expands the protocol unnecessarily.
- Authorize only by disabling the button: does not protect direct WebSocket commands.

## Decision 4: Upgrade wire and storage schemas together to version 3

Decision:

- Set the public protocol and persisted room schema to version 3.
- Public snapshots expose only `guild.gathering.cooldownRemaining`.
- Persisted state retains the absolute window; the target turn is not exposed to clients.
- Migrate schema-v2 rooms atomically:
  - lobby: change schema only;
  - idle/complete gathering: add a `2n` window anchored at the current game turn;
  - redemption/auction: preserve phase/live data and add an `n` window that excludes the current turn;
  - remove `lastAutoGatheringRound`.
- Preserve the existing schema-v1 fixed-map migration by chaining v1 to the legacy v2 shape and then v2 to v3.

Rationale:

- Strict exact-object validation means adding a public or persisted field is a breaking schema change.
- Chaining preserves already-promised v1 recovery without maintaining two current schemas.
- Constructing and validating the full v3 candidate before one `storage.put` preserves atomicity.

Rejected alternatives:

- Add optional v2 fields: lets two incompatible meanings share one schema number.
- Drop all legacy support: regresses the seeded-map release's v1 migration guarantee.
- Publish `availableAtTurn`: exposes an internal representation that clients do not need.

## Decision 5: Award setup resources inside the settlement transition

Decision:

- Extend `placeSetupSettlement` in `src/domain/rules/building.ts`.
- Before mutating state, determine whether the player already owns exactly one setup settlement.
- Build a resource multiset from every adjacent hex whose `resource` is not `null`.
- Verify the bank can fund the complete multiset, then apply the settlement, player credit, bank debit, and setup-stage transition in one returned state.

Rationale:

- The function is already the shared Local/Online authority for setup settlement placement.
- Counting adjacent hexes directly handles duplicate resource types and desert without special cases.
- Preflight before object construction gives a clear atomic failure path.

Rejected alternatives:

- Award on the paired road: delays the rule and risks duplicate grants.
- Award in Local/Worker adapters: duplicates rule logic and can diverge.
- Reuse normal dice production: production depends on dice/building events and does not match setup semantics.

## Decision 6: Use one shared React resource presentation boundary

Decision:

- Add `src/ui/ResourceBadge.tsx` exporting the resource icon mapping and focused `ResourceIcon`, `ResourceBadge`, and `ResourceBundle` renderers.
- Reuse installed Lucide icons:
  - wood: `Trees`
  - brick: `BrickWall`
  - wool: `Cloud`
  - grain: `Wheat`
  - ore: `Gem`
- Reuse the project's semantic resource colors and render quantity as visible text.
- Keep `src/ui/resourceLabels.ts` only for natural-language prose formatting; delete abbreviation exports once no operational surface uses them.

Rationale:

- The five silhouettes are distinct even without color.
- `lucide-react` is already installed and the selected exports are present in version `0.468.0`.
- One mapping prevents map, statistics, trade, and inventory panels from choosing different symbols.

Rejected alternatives:

- Emoji, letters, or terrain abbreviations: inconsistent across platforms and fail the visual requirement.
- New icon package or remote assets: adds dependency and deployment surface for five existing icons.
- Per-panel icon maps: creates immediate duplication.

## Decision 7: Replace native resource selects where icons must be visible

Decision:

- Keep native selects for players and non-resource choices.
- Replace maritime resource `<select>` controls with keyboard-operable button/radio groups using `aria-pressed`, localized accessible names, and the shared icons.
- Use the same icon controls for trade bundles, development choices, discards, and gathering redemption.

Rationale:

- Native `<option>` elements cannot reliably contain React/SVG icons.
- Button groups preserve visible icon semantics while retaining keyboard operation and explicit selection state.

Rejected alternatives:

- CSS background images on `<option>`: inconsistent browser support and poor accessibility.
- A generic custom listbox abstraction: unnecessary complexity for two fixed five-item selectors.

## Decision 8: Preserve sealed-auction privacy

Decision:

- Do not expose the winning resource composition in the public online projection.
- Render the existing public `resourceCardCount` with a generic resource-card pictogram and quantity.
- Local natural-language logs retain exact resource names; Local operational bundles use specific resource badges where the full map is already available.

Rationale:

- The icon change is a presentation change, not authority to expand public information.
- Existing projection deliberately reduces a resource outcome to a card count.

Rejected alternative:

- Publish exact resource maps to every online participant: changes privacy semantics outside the approved feature.

## Minimalism and Boundary Result

- Rung: reuse existing modules and installed dependency, then make direct bounded changes.
- New production files: one UI presentation component only.
- New state concepts: one cooldown window only.
- New services, routes, packages, timers, and generic frameworks: none.
- Large facades (`applyMatchCommand.ts`, `commandPipeline.ts`, `GameTable.tsx`) remain coordinators; formulas, migration, and icon mapping stay in their owner modules.
