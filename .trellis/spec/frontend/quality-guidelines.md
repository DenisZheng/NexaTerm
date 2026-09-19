# Quality Guidelines

> Code quality standards for frontend development.

---

## Overview

<!--
Document your project's quality standards here.

Questions to answer:
- What patterns are forbidden?
- What linting rules do you enforce?
- What are your testing requirements?
- What code review standards apply?
-->

(To be filled by the team)

---

## Forbidden Patterns

<!-- Patterns that should never be used and why -->

(To be filled by the team)

---

## Required Patterns

<!-- Patterns that must always be used -->

(To be filled by the team)

---

## Testing Requirements

<!-- What level of testing is expected -->

Three kinds of frontend checks exist. They are reported separately and none of them replaces another:

| Kind | Location | Command | What it proves |
| --- | --- | --- | --- |
| Static source contracts | `scripts/check-*.mjs` | `node scripts/check-<name>.mjs` / `pnpm run check:*` | Startup lazy boundaries, token usage, command/event naming — asserted on source text, nothing is executed |
| Script tests | `scripts/*.test.mjs` | `pnpm run test:scripts` | Behaviour of build/release/security scripts themselves |
| Unit / component tests | `src/**/*.test.{ts,tsx}` | `pnpm test` (Vitest, `vitest.config.ts`) | Runtime behaviour of `src/` modules |

Rules for `src/` tests:

- Co-locate the test with the module: `<module>.test.ts` next to `<module>.ts`, `<Component>.test.tsx` next to the component.
- Import `describe` / `it` / `expect` / `vi` explicitly from `vitest`; globals are not enabled.
- Default environment is `node`. A test that needs the DOM declares `// @vitest-environment jsdom` on its first line so the dependency is visible in the file header. Pure logic tests must not require jsdom.
- Prefer testing pure functions and reducers. Component tests use `@testing-library/react` with `fireEvent` and role/text queries; do not assert on class names or DOM structure that is not part of the behaviour.
- Assertions express behaviour, not snapshots. `toMatchSnapshot` is not used.
- Fixtures never contain real secrets, real hosts, tokens or machine paths. Use `example.invalid`, `10.0.0.x`, `SHA256:test-*` style placeholders.
- Tests do not touch `@tauri-apps/*` at runtime. When a module needs it, mock the narrowest import with `vi.mock` and a minimal fake; do not introduce a generic mocking layer.
- A pre-existing failure exposed by a new test is recorded with `it.todo` / `it.skip` plus the reason and owning task. Weakening an assertion or silently skipping is not allowed.
- Contracts shared with the Rust side (for example `isLoopbackHost` ↔ `mcp.rs::is_loopback_host`) keep the same input set on both sides; changing one side's cases requires changing the other.
- `vitest.config.ts` sets `passWithNoTests: false`; deleting all test files fails the gate instead of silently passing.

CI (`.github/workflows/ci.yml`, job `Frontend checks`) runs type check, build, `pnpm run test:scripts`, `pnpm test`, then the static contract checks. A failing `pnpm test` blocks the job.

Coverage thresholds are not enforced yet; they will be set once the WorkspaceShell state seams are extracted (Task 04).

---

## Code Review Checklist

<!-- What reviewers should check -->

(To be filled by the team)
