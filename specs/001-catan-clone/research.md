# Research Notes

Created: 2026-07-08

## Technical Choices

- Vite + React + TypeScript gives the fastest path to a polished browser demo with typed code and a simple build pipeline.
- Pure functions in `src/domain` make the most important behavior testable without browser automation.
- CSS/SVG board rendering is preferable to Canvas for this challenge because UI panels, tooltips, click targets, and statistics tables integrate more quickly with React.
- Random outcomes in the Commerce Guild should accept an injected random source so tests can force blind-box outcomes.

## Product Interpretation

- The target online UI prioritizes a large board and dense side information rather than a marketing-style landing page.
- A portfolio reviewer should see the requested innovation quickly, so the Commerce Guild and statistics controls should be first-class panels, not hidden debug tools.
- The clone should use original visual assets. Similar layout and information hierarchy are acceptable; copying proprietary art is not.

## Open Technical Unknowns

- Package installation may require network approval. If dependency installation fails, request escalation instead of silently changing the technology.
- Board interaction can be simplified with fixed node IDs if precise geometric hit testing becomes a time risk.

