# Quality Guidelines

> Code quality standards for backend development.

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

(To be filled by the team)

---

## Scenario: Tauri Capability Policy CI Gate

### 1. Scope / Trigger

- Trigger: changing `src-tauri/capabilities/*.json` or the Tauri window labels they govern.
- The check is a configuration-level guard. It does not replace a real `tauri dev` GUI regression or IPC integration test.

### 2. Signatures

- `pnpm run check:tauri-capabilities` → runs `node scripts/check-tauri-capabilities.mjs` from the repository root.
- `readTauriCapabilities(directory?: string) -> Capability[]` reads every JSON capability file in the directory.
- `validateTauriCapabilities(capabilities: Capability[]) -> string[]` returns policy violations; an empty array is required for success.

### 3. Contracts

- The `default` capability covers only `main`.
- The `vnc-runner-host` capability covers only `vnc-runner-host`.
- No capability may cover both windows or enable remote origins.
- The runner may contain only its required event permissions and window operations; it must not inherit main-window dialog, opener, process, updater, clipboard, or webview-creation permissions.
- The command exits `0` and prints `PASS: ...` when valid; it exits non-zero and prints `FAIL: ...` plus each violation when invalid.
- `.github/workflows/ci.yml` runs the command as an explicit Frontend checks step in addition to the script unit tests.

### 4. Validation & Error Matrix

| Condition | Expected result |
|---|---|
| Current capability files satisfy the exact policy sets | `PASS`, exit `0` |
| Required capability is missing | `FAIL`, non-zero exit |
| Capability contains an unexpected permission | `FAIL`, non-zero exit |
| Capability is shared by `main` and `vnc-runner-host` | `FAIL`, non-zero exit |
| Capability enables a remote origin | `FAIL`, non-zero exit |
| GUI runner behavior or unauthorized IPC is being tested | Use a Tauri integration/GUI environment; this static check is insufficient |

### 5. Good / Base / Bad Cases

- Good: add a main-window permission only to `default`, update its call-site evidence, and keep the runner set unchanged.
- Base: run `pnpm run check:tauri-capabilities` after a capability edit and before review.
- Bad: add `updater:default` to `vnc-runner-host`, or broaden `windows` to both labels to make a test pass.

### 6. Tests Required

- `node --test scripts/tauri-capability-policy.test.mjs` must cover the current policy plus rejection of updater access, shared windows, missing runner event emission, and missing main focus permission.
- CI must execute both `node --test scripts/*.test.mjs` and the explicit `pnpm run check:tauri-capabilities` step.
- A complete security acceptance still requires a separate `tauri dev` runner smoke test and negative IPC/origin checks when the GUI/toolchain environment is available.

### 7. Wrong vs Correct

#### Wrong

```yaml
- name: Script unit tests
  run: node --test scripts/*.test.mjs
```

The current unit test already reads the capability files in the checkout. This alone does not expose the CLI check as a separately identifiable CI step, and neither form proves real GUI/IPC behavior.

#### Correct

```yaml
- name: Tauri capability policy
  run: pnpm run check:tauri-capabilities
```

The explicit step validates the checked-out capability configuration and makes the CLI exit status visible independently of unit-test results. Keep both; do not interpret either as GUI/IPC acceptance.

---

## Scenario: Windows Portable ZIP Allowlist Gate

### 1. Scope / Trigger

- Trigger: changing the Windows portable ZIP assembly in `.github/workflows/release.yml` ("Collect release assets", `matrix.target == windows-x64`) or the set of files the portable build must ship.
- The gate is a static source contract plus a local simulation. It does not replace a real GitHub Actions build of the ZIP.

### 2. Contracts

- The ZIP is built from an explicit allowlist: `nexaterm.exe`, `nexaterm-mcp.exe`, `mxterm-mcp.exe`, `_up_/` (Tauri resources), `LICENSE`, `THIRD_PARTY_LICENSES.md`, `portable.marker`. A missing allowlisted file fails the step (`::error::` annotation + `exit 1`).
- Never bulk-copy `src-tauri/target/release`; cargo residue (`*.pdb`, `*.d`, `.fingerprint/`, `nsis/`, `.cargo-*lock`) must not ship.
- The archive is produced by the Windows built-in bsdtar (`$SYSTEMROOT/System32/tar.exe -a -cf`) so entries use `/` separators; `Compress-Archive` is not allowed because it emits `\` entry names.
- `scripts/check-wf08c-release-surface.mjs` locks the allowlist lines and forbids the `find ... -mindepth 1 -maxdepth 1` bulk copy and `Compress-Archive`.

### 3. Validation & Error Matrix

| Condition | Expected result |
|---|---|
| Allowlist intact, bsdtar present | step exits `0` and lists exactly 9 entries |
| Required exe or `_up_/` missing | `::error::` annotation, step exits `1` |
| Workflow drifts back to bulk copy or `Compress-Archive` | `pnpm run check:wf08c-release-surface` fails |
| Real artifact size / entry list needed | run `release.yml` via `workflow_dispatch` on the branch (no GitHub Release is created) |

### 4. Local Simulation

Extract the `windows-x64` block from the workflow, run it with `set -euo pipefail` against a copy of `src-tauri/target/release` that also contains residue, then list the ZIP with `tar.exe -tvf` and open it with `Expand-Archive` / `System.IO.Compression.ZipFile` to confirm `/` separators and hash parity with the source binaries.

---

## Code Review Checklist

<!-- What reviewers should check -->

(To be filled by the team)
