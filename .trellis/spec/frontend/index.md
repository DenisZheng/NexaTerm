# Frontend Development Guidelines

> Best practices for frontend development in this project.

---

## Overview

This directory contains guidelines for frontend development. Engineering rules (tokens, Radix/Lucide, lazy loading, IPC contracts, reducer conventions, testing) live in the files below. **Product interaction rules** (where Files lives, what a top-level tab represents, what MultiExec targets) live in `docs/WORKFLOW_SPEC.md` and are referenced by rule id (`WS-xx`); they are not duplicated here.

Some bullets in `component-guidelines.md` and `tauri-command-contracts.md` describe the *current* UI placement (right-pane tools, manual-only locate, Command Sender subtab entry). Since 2026-09-23 those bullets are tagged `[Current implementation …]` with the workflow package (`WF-xx`) that replaces them. Treat them as facts about today's code, not as constraints on the target layout; the engineering rule in the same bullet (no probes, no `cd` write-back, connection-id-only IPC, lazy boundaries) still applies.

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Module organization and file layout | To fill |
| [Component Guidelines](./component-guidelines.md) | Component patterns, props, composition | Active (placement bullets scoped 2026-09-23) |
| [Hook Guidelines](./hook-guidelines.md) | Custom hooks, data fetching patterns | To fill |
| [State Management](./state-management.md) | Local state, global state, server state | Partial (reducer conventions filled) |
| [Quality Guidelines](./quality-guidelines.md) | Code standards, forbidden patterns | Partial (testing requirements filled) |
| [Type Safety](./type-safety.md) | Type patterns, validation | To fill |
| [Tauri Command Contracts](./tauri-command-contracts.md) | Typed invoke wrappers and frontend/backend payload sync | Active (placement bullets scoped 2026-09-23) |
| [Workflow Spec (product rules)](../../../docs/WORKFLOW_SPEC.md) | Target interaction rules `WS-xx`, status, owning WF package, superseded-rule table | v0.1 (2026-09-23) |

---

## Pre-Development Checklist

Read in this order before writing code. Skip the product-rule step for pure backend, dependency, or script tasks.

1. Task artifacts: `prd.md` → `design.md` (if present) → `implement.md` (if present). Note the acceptance ids (`A01`–`A15`) and `WS-xx` rules the PRD cites.
2. **UI / workspace / session / files / MultiExec work only**: `docs/WORKFLOW_SPEC.md` — confirm the rules you touch are `已确认` or `默认值`; a `待确认` rule must be aligned with the user before implementation. Read §9 (three baseline questions) and §11 (superseded rules) so you do not re-implement the old layout.
3. `state-management.md` — reducer / controller / selector conventions for anything under `src/features/workspace/`.
4. `component-guidelines.md` — tokens, Radix/Lucide, dark mode, shortcuts, terminal/xterm boundaries, performance boundaries. Bullets tagged `[Current implementation …]` describe today's placement; follow the WS rule they point to when the task's WF package changes that placement.
5. `tauri-command-contracts.md` — the scenario(s) whose commands you call. Same tagging rule applies.
6. `quality-guidelines.md` — test kinds, locations, fixture rules.
7. `../guides/index.md` — cross-layer and code-reuse thinking guides.

---

## Quality Check

Run after implementation, before reporting completion.

- Behaviour matches the PRD's cited `WS-xx` rules and acceptance ids; if the task intentionally changes an interaction (e.g. moving Files, changing MultiExec targeting), the change is recorded in the task artifacts and, when a `待确认` item was decided, written back to `docs/WORKFLOW_SPEC.md` with a version bump.
- Static source contracts (`scripts/check-*.mjs`) that assert old placement or old identifiers are updated together with the behaviour change. Do not make a check green by moving the UI back to its old position, and do not delete a check that still guards a lifecycle, security, or startup boundary.
- `pnpm run check`, `pnpm test`, `pnpm run build`, and `node scripts/check-startup-module-boundary-source.mjs` pass; heavy modules stay out of the startup chunk.
- Light, explicit dark, and system-dark themes verified for every changed surface.
- No secrets, session ids, or full command payloads in React state that is persisted, logged, or snapshotted.
- `.trellis/spec/` updated when the task produced a new pattern, pitfall, or decision.

---

## How to Fill These Guidelines

For each guideline file:

1. Document your project's **actual conventions** (not ideals)
2. Include **code examples** from your codebase
3. List **forbidden patterns** and why
4. Add **common mistakes** your team has made

The goal is to help AI assistants and new team members understand how YOUR project works.

---

**Language**: All documentation should be written in **English**.
