# WF-07 / A14 restart acceptance evidence

> Branch: `feat/wf07-workspace-restore`  
> Acceptance: A14 / WS-R01 / WS-R02  
> Scenario: multi-session + Split + Local/WSL + one deleted profile + restart.

## Automated evidence

The dedicated A14 automation intentionally models the complete restart snapshot rather than a single-item planner case:

- three SSH logical instances, including one profile that no longer exists;
- one native Local instance;
- one WSL instance (restored through the existing Local/WSL provider path);
- a four-pane Split tree with stable pane ids and ratios;
- Files directories and sidebar state;
- explicit reconnect on/off behavior;
- the deleted profile fails alone and remains represented in its pane;
- every surviving SSH/Local/WSL item stays independently reconnectable;
- MultiExec is always restored as `off`.

Evidence files:

- `src/features/workspace/restore/a14RestartAcceptance.test.ts`
- `src-tauri/src/workspace_snapshot.rs` — repository close/reopen persistence test
- `scripts/check-wf07-workspace-restore-source.mjs`
- CI named step: `WF-07 A14 restart acceptance`

The Rust test writes an A14-shaped snapshot to the real SQLite repository, drops the repository handle, reopens the same database path, and verifies that the current snapshot survives with the previous snapshot retained as backup. This is the storage boundary that must survive an actual application process restart.

The frontend A14 test then applies the same restart contract to the restore planner and shell hydration path. It verifies layout, per-item failure isolation, Local/WSL reconstruction, explicit reconnect policy, Files/sidebar state, and `multiExecMode = "off"`.

## Real Tauri restart acceptance

Run this once on the Windows development machine with WSL available; record the result below before marking A14 fully PASS.

1. Use a branch build from the A14 evidence commit.
2. Ensure **Restore workspace on launch** is enabled. Test once with **Reopen last terminal** enabled.
3. Open at least:
   - two SSH terminal instances;
   - one Local terminal;
   - one WSL terminal.
4. Put SSH + Local/WSL instances into a four-pane Split and leave at least one additional SSH instance as a normal workspace tab.
5. Turn MultiExec on and select explicit targets. This proves restart does not inherit an active broadcast state.
6. Create a dedicated SSH profile named **A14-missing** and open exactly one instance of it as one of the test panes/tabs. Keep this instance open. Do not delete the profile from the UI: normal deletion deliberately closes its instances and would remove the item from the snapshot.
7. Wait at least one second so the 500 ms workspace snapshot debounce has persisted the new state, then exit NexaTerm completely.
8. In PowerShell at the repository root, inject a missing reference into that one saved test instance, then restart. This exercises the same missing-profile restore path without deleting credentials or changing normal profile-deletion behavior:

   ```powershell
   $a14Database = Join-Path $env:APPDATA 'com.nexaterm.app/mxterm.db'
   python -X utf8 -B scripts/wf07_a14_fixture.py apply --database $a14Database --profile-name A14-missing
   pnpm tauri dev
   ```

   The helper refuses to run while `nexaterm.exe` is running, with a non-A14 profile, with duplicate profile names, or without exactly one matching SSH snapshot item. It changes only that item's profile reference, keeps the logical id/order/panes, and rotates the previous snapshot into `backup_json`. The missing item may display its opaque reference rather than the original profile name; verify its original position and retry action.
9. Verify:
   - the same logical workspace order and Split layout return before slow reconnect work completes;
   - surviving SSH instances reconnect in place rather than creating duplicate tabs;
   - Local and WSL reconnect through their existing providers;
   - the deleted-profile item alone shows a retryable failure and remains identifiable in its original pane/tab;
   - the failure does not block surviving siblings;
   - MultiExec is **off** after restart and no previous target set is active;
   - SSH reconnect continues through the normal credential and Host Key path.
10. Disable **Reopen last terminal**, restart once more, and verify the shell/layout restores but ready terminals do not auto-reconnect.
11. After both rounds, exit the app and restore the test reference. Then restart and use the item's retry button to verify it reconnects in place:

    ```powershell
    python -X utf8 -B scripts/wf07_a14_fixture.py restore --database $a14Database --profile-name A14-missing
    pnpm tauri dev
    ```

    Keep the test profile and placeholder until this cleanup is complete. The helper preserves any layout changes made during acceptance and never restores the whole database over newer data.

## 2026-10-04 review regressions

- `useWorkspaceSnapshotLifecycle.test.tsx`: readiness changes during load, ordinary rerenders, content-based debounce, ordered saves, unmount and error reporting.
- `scripts/wf07-ssh-output.test.mjs`: same-millisecond SSH restore and same-tab retry use isolated output channels.
- `RemoteFilePanel.restore.test.tsx`: browsing directory survives cold restoration, including ancestor directory loading.
- `scripts/wf07-a14-fixture.test.mjs`: missing-reference injection/restore touches one test item and preserves real profiles/credentials.

These automated checks supplement the original planner/storage evidence. Real Windows restart acceptance remains PENDING until the maintainer executes both rounds.

Local validation after the review fixes: type check/build, WF-07/startup/line-budget gates PASS; frontend 518 PASS / 1 existing TODO; script suite 96 PASS / 3 existing Gitleaks environment-gated skips. The five offline fixture unit cases run inside the script suite. Rust snapshot tests remain 3 PASS; Rust production code was unchanged by these fixes.

## Result record

- Automated baseline commit: `763e869b2dba54fa0d1fd769877064ebc309ac2f`
- Baseline CI: #302 / run `37169542872` — PASS (Frontend, A14 restart acceptance, fixtures, Rust linux/windows/macos, security, license); this run predates the review fixes.
- Real Windows tested commit: PENDING (record `git rev-parse HEAD` when performing the manual run)
- Windows version:
- WSL distribution:
- A14 real restart: PENDING
- Notes / screenshots:


## Completion rule

A14 is not marked fully PASS from mocks/unit tests alone. The automated evidence is the regression gate; the final checkbox requires one real Windows Tauri exit/relaunch run following the checklist above. After that run, replace `PENDING` with `PASS`, record the tested commit/CI and environment, and commit the evidence record.
