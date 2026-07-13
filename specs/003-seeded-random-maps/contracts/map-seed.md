# Contract: Map Seed and Board Generation

Status: Planned
Applies to: browser, Node/Vitest, Cloudflare Worker

## Accepted Values

| Version | Canonical syntax | Meaning |
| --- | --- | --- |
| M0 | `M0-STANDARD` | Released fixed compatibility board |
| M1 | `M1-[0-9A-F]{16}` | 64-bit seeded random standard board |

Parsing is strict. Implementations must not trim, case-fold, pad, truncate, hash, or fall back when input is invalid.

## M1 Generation Contract

For one canonical M1 seed, `createBoardDataForSeed` must return byte-equivalent JSON in every supported runtime. The version fixes:

- seed-word decoding order;
- seeded-stream initialization and 32-bit arithmetic;
- every shuffle order and bounded-index mapping;
- standard axial coordinate order;
- neutral topology ID assignment;
- terrain and number multisets;
- red-token candidate enumeration order;
- coastal traversal direction/start;
- non-adjacent port-set unranking order;
- port-type shuffle and ID assignment.

Any future change that alters output for a supported M1 seed requires a new seed version, not an M1 behavior change.

## Output Invariants

- 19 hexes, 54 vertices, 72 edges, 9 ports.
- Exact standard terrain/number/port multisets from RM-002, RM-003, and RM-005.
- Desert has no token and owns the initial robber position.
- No two 6/8 hexes are adjacent.
- Every port is coastal and no two port edges share a vertex.
- IDs are unique; M1 IDs are geometry-derived and content-neutral.
- Generation has bounded work and cannot retry until lucky.

## Entropy Boundary

The M1 stream may affect only:

- terrain placement;
- number-token placement;
- port edge placement;
- port type placement.

It must not affect deck order, dice, theft, bids, Commerce Guild outcomes, log IDs, time, player IDs, or room credentials. Those values must not affect the public board either.

## Golden Compatibility

`test/domain/randomBoard.test.ts` publishes a small fixed set of complete canonical layout snapshots and exercises at least 1,000 deterministic M1 seeds. Golden changes are treated as a seed-version compatibility break and require explicit review.

`M0-STANDARD` must reconstruct the released fixed data closely enough that all persisted legacy hex, vertex, edge, port, building, road, robber, and setup references remain valid.
