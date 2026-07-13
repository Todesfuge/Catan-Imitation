# Task 2 Report — Bounded Deterministic Board Generator

## Status

Implemented T002 only: pure `MapSeed -> StandardBoardData` generation with exact `M0-STANDARD` compatibility and bounded deterministic `M1` generation. Match creation, online protocol/state, and UI integration were not changed.

## TDD Evidence

### RED — before any production edit

Command:

```text
pnpm vitest run test/domain/randomBoard.test.ts test/domain/boardGeometry.test.ts test/domain/portGameplay.test.ts test/domain/production.test.ts
```

Exit code: `1`

Output:

```text
RUN  v2.1.8 C:/Study/Catan/.worktrees/seeded-random-maps

❯ test/domain/production.test.ts (0 test)
❯ test/domain/boardGeometry.test.ts (0 test)
❯ test/domain/portGameplay.test.ts (0 test)
❯ test/domain/randomBoard.test.ts (0 test)

Failed Suites 4

FAIL  test/domain/boardGeometry.test.ts [ test/domain/boardGeometry.test.ts ]
FAIL  test/domain/production.test.ts [ test/domain/production.test.ts ]
Error: Failed to load url ../../src/domain/randomBoard (resolved id: ../../src/domain/randomBoard) in C:/Study/Catan/.worktrees/seeded-random-maps/test/domain/boardGeometry.test.ts. Does the file exist?

FAIL  test/domain/portGameplay.test.ts [ test/domain/portGameplay.test.ts ]
FAIL  test/domain/randomBoard.test.ts [ test/domain/randomBoard.test.ts ]
Error: Failed to load url ../../src/domain/randomBoard (resolved id: ../../src/domain/randomBoard) in C:/Study/Catan/.worktrees/seeded-random-maps/test/domain/boardGeometry.test.ts. Does the file exist?

Test Files  4 failed (4)
Tests       no tests
Duration    830ms
```

This was the expected feature-missing failure: the test contract imported `createBoardDataForSeed`, but `src/domain/randomBoard.ts` did not yet exist.

### GREEN — focused T002 command

Command:

```text
pnpm vitest run test/domain/randomBoard.test.ts test/domain/boardGeometry.test.ts test/domain/portGameplay.test.ts test/domain/production.test.ts
```

Exit code: `0`

Output:

```text
RUN  v2.1.8 C:/Study/Catan/.worktrees/seeded-random-maps

✓ test/domain/boardGeometry.test.ts (3 tests) 16ms
✓ test/domain/production.test.ts (4 tests) 20ms
✓ test/domain/portGameplay.test.ts (4 tests) 20ms
✓ test/domain/randomBoard.test.ts (7 tests) 1402ms
  ✓ bounded deterministic board generation > satisfies every topology, multiset, red-token, and port invariant for 1,000 seeds 1377ms

Snapshots  3 written
Test Files  4 passed (4)
Tests       18 passed (18)
Duration    2.22s
```

## Full Verification

Command:

```text
pnpm test
```

Exit code: `0`

Output summary:

```text
Test Files  34 passed (34)
Tests       359 passed (359)
Duration    3.11s
```

The full output included `test/domain/randomBoard.test.ts (7 tests)` and the 1,000-seed invariant test completed in `1919ms`.

Additional checks:

```text
pnpm exec tsc -b --pretty false
```

Exited `0` with no output.

```text
git diff --check
```

Exited `0`; the only messages were the repository's CRLF conversion warnings.

## Invariant and Golden Evidence

- Three complete JSON goldens are published in `test/domain/__snapshots__/randomBoard.test.ts.snap`:
  - `M0-STANDARD`
  - `M1-0000000000000000`
  - `M1-0123456789ABCDEF`
- The snapshot file is intentionally complete (`59,594` bytes), covering board property order/content, all hex IDs and coordinates, every vertex/edge reference, all edge records, and all port records. An M1 snapshot change is a seed-version compatibility break requiring explicit review.
- M0 additionally compares `createBoardDataForSeed(M0-STANDARD)` with `createStandardBoardData()`.
- A temporary audit test compared `JSON.stringify(createStandardBoardData())` against the untouched released `src/domain/board.ts` implementation outside the worktree. It passed `1/1`; `git diff --exit-code 1d9425a 64e1c9b -- src/domain/board.ts` also confirmed that reference file had not changed since the T002 base.
- The deterministic 1,000-seed loop checks 19 hexes, 54 unique vertices, 72 unique/referenced edges, standard coordinates, unique geometry IDs, exact terrain/resource/number/port multisets, one numberless desert ID, four pairwise non-adjacent 6/8 hexes, a 30-edge coastal cycle, and nine distinct coastal port edges using 18 unique vertices.
- Repeated calls are compared as complete formatted JSON and a `Math.random` spy proves ambient randomness is not consumed.
- Fixed seed pairs prove terrain order, number order, and port positions vary.
- M1 topology is identical across content-varied seeds and IDs are constrained to `hex-NN`, `vertex-NN`, `edge-NN`, and `port-edge-NN`.
- The port selector un-ranks one of `419,900` valid nine-edge independent sets on the 30-edge cycle. It does not scan all `14,307,150` raw combinations and has no retry-until-valid path.

## Frozen M1 Ordering

- Axial positions use the released 19-coordinate order exported by `board.ts`.
- Hex IDs are coordinate indices; vertex and edge IDs are first-encounter geometry indices with two-digit padding.
- Terrain starts in requirement order (forest, pasture, field, hill, mountain, desert) with exact multiplicities and is shuffled by descending Fisher–Yates draws from the T001 stream.
- Eligible red-token sets are enumerated as ascending four-index combinations; one pairwise-independent set is selected by one bounded draw. `[6, 6, 8, 8]` is then shuffled and assigned in candidate-index order.
- Remaining non-desert indices receive a shuffled `[2, 3, 3, 4, 4, 5, 5, 9, 9, 10, 10, 11, 11, 12]` list.
- Coastal traversal retains `board.ts`'s released start/direction rule: lexicographically first coastal vertex, then lexicographically first available edge.
- Cycle independent sets are un-ranked lexicographically with the index-zero branch first. Selected edge indices remain ascending.
- Port types start as four generic ports followed by resources in the existing `resources` order, are shuffled once, and receive IDs derived from their selected edge rather than their kind.

## Files

- `src/domain/board.ts`
  - Retains released fixed terrain/number/port data.
  - Owns the standard coordinates, geometry keying, one shared topology builder, and coastal traversal.
  - Exposes neutral standard topology/coastal ordering for the generator.
- `src/domain/randomBoard.ts`
  - New focused owner of M0/M1 seed-to-board content selection.
  - Contains only deterministic shuffles, red-token candidate enumeration, port dynamic-programming counts/unranking, and seed routing.
- `test/domain/randomBoard.test.ts`
  - New focused generator contract and 1,000-seed invariant suite.
- `test/domain/__snapshots__/randomBoard.test.ts.snap`
  - Complete M0/M1 golden JSON.
- `test/domain/boardGeometry.test.ts`
  - Exercises SVG projections against a neutral-ID M1 board.
- `test/domain/portGameplay.test.ts`
  - Exercises generated coastal ports and port projection with neutral IDs; existing setup wiring remains untouched.
- `test/domain/production.test.ts`
  - Exercises topology/production against a generated neutral-ID board and removes content-derived ID assumptions from robber assertions.

## Boundary Assessment

- `board.ts` remains the sole owner of standard coordinates, topology construction, coastal traversal, and released M0 data.
- `randomBoard.ts` owns only public seeded content selection and the M0/M1 reconstruction entry point.
- The topology implementation was refactored into one builder used by both legacy and neutral identities; no parallel topology path was created.
- No catch-all, facade, UI, online, match-creation, or persistence production file gained business logic.
- No dependency, configuration, hidden random source, `Math.random`, integration hook, or speculative extension point was added.
- Net responsibility grew by one focused generator module plus narrow board exports/refactor and focused domain tests. No existing large test hotspot was expanded.

## Self-Review

- Requirements RM-001 through RM-008 and T002's RM-033 board slice are covered by focused tests.
- M0 JSON/legacy IDs are byte-compatible with the released implementation.
- M1 ID shapes encode only geometry indices; port IDs derive from coastal edge IDs.
- Every selection loop has a finite structural bound. There is no probabilistic retry.
- The one internal identity strategy interface has two current callers (legacy and neutral) and removes topology duplication rather than adding a speculative abstraction.
- The complexity-only review found no dead code, wrapper, dependency, facade path, or standard-library replacement to remove.
- The generated-desert invariant now checks the neutral `hex-NN` identity contract instead of proving membership in the array it was derived from.
- The production regression builds an M1 board, selects a productive neutral-ID coastal hex with an exclusive vertex, places a settlement there, and proves that assigning that exact `hex-NN` ID to the robber suppresses its resource/event.
- Generated-board production state retains the generated desert ID; no nested object literal replaces it with legacy `"desert"`.
- `git diff --check`, focused tests, TypeScript compilation, and the full suite are clean.

## Concerns

No blocking concerns. The large snapshot is deliberate because the contract requires complete board JSON goldens; reviewers should treat changes to either M1 golden as an explicit compatibility event. The review's Minor `localeCompare` portability note was intentionally not changed in this fix wave and remains logged for whole-branch triage.

## Review Fix Evidence — Neutral Robber IDs

Reviewer finding: the original desert-ID assertion was tautological, the generated production state was overwritten with legacy `"desert"`, and the robber-blocking test only exercised the released M0 board.

### RED — legacy overwrite retained in the new generated-board regression

Command:

```text
pnpm vitest run test/domain/randomBoard.test.ts test/domain/production.test.ts
```

Exit code: `1`

Output:

```text
RUN  v2.1.8 C:/Study/Catan/.worktrees/seeded-random-maps

❯ test/domain/production.test.ts (4 tests | 1 failed) 23ms
  × dice production > blocks production when the robber occupies a neutral-ID generated hex 6ms
    → expected 1 to be +0 // Object.is equality
✓ test/domain/randomBoard.test.ts (7 tests) 1383ms
  ✓ bounded deterministic board generation > satisfies every topology, multiset, red-token, and port invariant for 1,000 seeds 1359ms

FAIL  test/domain/production.test.ts > dice production > blocks production when the robber occupies a neutral-ID generated hex
AssertionError: expected 1 to be +0 // Object.is equality
- Expected
+ Received
- 0
+ 1

Test Files  1 failed | 1 passed (2)
Tests       1 failed | 10 passed (11)
Duration    2.13s
```

The productive `hex-NN` emitted one resource because the test state still held legacy `robberHexId: "desert"`. This directly reproduced the review finding.

### GREEN — generated IDs preserved and used

Minimum command:

```text
pnpm vitest run test/domain/randomBoard.test.ts test/domain/production.test.ts
```

Exit code: `0`

Output:

```text
✓ test/domain/production.test.ts (4 tests) 18ms
✓ test/domain/randomBoard.test.ts (7 tests) 1420ms
  ✓ bounded deterministic board generation > satisfies every topology, multiset, red-token, and port invariant for 1,000 seeds 1393ms

Test Files  2 passed (2)
Tests       11 passed (11)
Duration    2.18s
```

Full focused T002 command:

```text
pnpm vitest run test/domain/randomBoard.test.ts test/domain/boardGeometry.test.ts test/domain/portGameplay.test.ts test/domain/production.test.ts
```

Exit code: `0`

Output:

```text
✓ test/domain/boardGeometry.test.ts (3 tests) 16ms
✓ test/domain/production.test.ts (4 tests) 18ms
✓ test/domain/portGameplay.test.ts (4 tests) 19ms
✓ test/domain/randomBoard.test.ts (7 tests) 1382ms
  ✓ bounded deterministic board generation > satisfies every topology, multiset, red-token, and port invariant for 1,000 seeds 1358ms

Test Files  4 passed (4)
Tests       18 passed (18)
Duration    2.14s
```

Type verification:

```text
pnpm exec tsc -b --pretty false
```

Exited `0` with no output.

Review-fix boundary: only `test/domain/randomBoard.test.ts`, `test/domain/production.test.ts`, and this report changed. No production implementation or shared helper changed.
