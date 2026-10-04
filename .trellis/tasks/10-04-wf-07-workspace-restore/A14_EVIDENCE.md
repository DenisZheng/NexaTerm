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
6. Delete the saved profile referenced by one still-open SSH instance. Do not close that terminal placeholder before exit.
7. Wait at least one second so the 500 ms workspace snapshot debounce has persisted the new state.
8. Exit NexaTerm completely and start it again.
9. Verify:
   - the same logical workspace order and Split layout return before slow reconnect work completes;
   - surviving SSH instances reconnect in place rather than creating duplicate tabs;
   - Local and WSL reconnect through their existing providers;
   - the deleted-profile item alone shows a retryable failure and remains identifiable in its original pane/tab;
   - the failure does not block surviving siblings;
   - MultiExec is **off** after restart and no previous target set is active;
   - SSH reconnect continues through the normal credential and Host Key path.
10. Disable **Reopen last terminal**, restart once more, and verify the shell/layout restores but ready terminals do not auto-reconnect.

## Result record

- Commit:
- CI: pending the evidence commit
- Windows version:
- WSL distribution:
- A14 real restart: PENDING
- Notes / screenshots:


## Completion rule

A14 is not marked fully PASS from mocks/unit tests alone. The automated evidence is the regression gate; the final checkbox requires one real Windows Tauri exit/relaunch run following the checklist above. After that run, replace `PENDING` with `PASS`, record the tested commit/CI and environment, and commit the evidence record.
