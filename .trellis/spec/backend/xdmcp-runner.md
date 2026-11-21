# XDMCP managed runner (X1)

## 1. Scope
External-engine development mode only until an exact bundled manifest has been approved. No packaged engine or supported desktop claim. Native main webview alone can reserve/start/list/stop. At most four reservations/runs. No shell, automatic discovery, installation, firewall changes or privilege escalation.

## 2. Signatures
xdmcp_reserve() -> UUID; xdmcp_start(reservation_id, request:{executable, target, local_address, allow_external, allow_network}) -> Status; xdmcp_stop(reservation_id) -> (); xdmcp_status() -> Vec<Status>; xdmcp_capabilities() -> Capability. Internal `XdmcpManager::shutdown_wait() -> Result<(),AppError>` is an application-exit completion barrier. Addresses are numeric IPv4 for this first slice; no DNS. Start requires two explicit true flags. Executable is an explicitly selected absolute regular non-symlink native file, never PATH lookup or a shell/script launch wrapper. A native header does not authenticate engine identity; the external path is explicitly selected by the caller. Bundled identity/hash validation remains X0/X2.

## 3. Lifecycle and budgets
Reservations expire after15s and consume once. Each owned worker keeps its entry, private directory and process owner until real cleanup finishes, including after caller cancellation/timeout. Native metadata reads/spawn are bounded by that retained four-worker quota rather than falsely claimed interruptible. Start await15s; stop await2s then fixed stop_pending. Process creation/file access may block at OS level: cancellation cannot interrupt them but does not release the four-worker quota. `shutdown_wait` closes admission, cancels all entries and snapshots at most four completion watches under the registry lock, removes unused leases, then drops that lock before awaiting actual worker/FD/process-tree/auth-directory completion. It has no successful two-second timeout; app Exit awaits it alongside the other owned services. A poisoned registry or completion channel ending without true returns fixed unavailable, never success. Window destruction initiates cancellation; explicit stop retains its separate two-second response budget. Stop is exact-id/owner and idempotent for missing/foreign entries. Only main can inspect state.

Status contains id, phase, optional display and fixed reason only. Phases reserved/starting/querying/stopping/closed/failed: querying means process creation succeeded and query arguments were submitted, not login or desktop readiness. Last16 terminal statuses are transient. Target, path, auth and process identifiers are not serialized, logged, snapshotted or exported.

Display100–131 is allocated within the manager after checking the corresponding TCP port. Concurrent apps/engines can still race for the port; engine failure remains visible, never treated as desktop success. The engine's local_address is the advertised/query source address, not a claim that it listens only on that interface. XDMCP requires authorized network access. Common X server args are fixed: display, -query target, -from local, -auth owned file, -terminate, -listen tcp, -nolisten local. No -ac or arbitrary extra args.

The worker creates a fresh private run directory and Xauthority file; the cookie uses existing getrandom, never arguments. stdout/stderr go to null; no raw engine diagnostics retained. Unix observes leader exit with waitid/WNOWAIT, terminates its process group before reaping the leader (preventing PID reuse), and reaps the direct child; Windows uses a kill-on-close job with the process assigned before resume. This owns child processes without matching global process names. Auth/run files remain until process cleanup; do not remove unrelated X server files. Real engine-specific logs, authentication negotiation and OS socket behavior remain X2 validation, not established by a process fixture. Unix host hard-crash recovery requires a supervisor/parent-death strategy in X2; the current process-group cleanup is for explicit cancellation and normal application shutdown. Do not claim SIGKILL-host cleanup from this slice.

## 4. Validation/errors
Fixed xdmcp_* reasons: unavailable, busy, expired, invalid_request, consent_required, engine_unavailable, port_in_use, start_failed, timeout, cancelled, stop_pending. Reject target unspecified/multicast/broadcast, local unspecified/multicast/broadcast, non-absolute/NUL/oversized paths, non-regular/symlink files and extra fields. Native engine failures expose start_failed, not raw error text. No bundled capability until actual reviewed resources exist.

## 5. Cases
Good: reserve, explicitly select engine/addresses, start -> querying, exact stop -> process tree reaped and private files removed. Base: mount/capability/status never runs a program. Bad: cancel before start cannot later create a process; old IDs and foreign owners cannot stop replacements.

## 6. Required tests
Actual native process fixture on Windows/macOS/Linux: two isolated runs, descendants, cancellation/shutdown, natural/failed exit, timeout/late worker ownership, single-use/expiry/owner quotas, fixed arguments/auth permissions, status secrecy and invalid inputs. Fixture verifies runner behavior only; it is not an X server or real XDMCP evidence.

Shutdown regression must hold one actual worker before spawn and another after its real process-tree termination but before private-directory removal for longer than the explicit stop budget. Assert shutdown remains pending, admission is closed, both used entries remain owned and the directory still exists; release only the start gate and assert shutdown still waits for directory cleanup. After both gates complete, require the original descendant handle/PID identity stopped, directory absent and registry empty. Native harness imports the actual manager and the same tests; its small AppError boundary stub does not validate Tauri IPC, which still compiles/tests in full application CI.

The fixture's heartbeat file is a PID-readiness marker, not a repeatedly truncated heartbeat stream. Publish the complete PID once by writing a sibling staging file and renaming it; remove a previous run's marker before spawning its replacement. Killing a descendant between truncation and rewrite must not leave an empty visible PID. Keep actual process-stopped assertions; do not skip an empty or invalid marker to make cleanup pass.

Windows process assertions must capture and retain the original process handle before stop. Opening the numeric PID only after stop can observe a recycled PID and is not evidence about the owned child. The native/application fixtures share ObservedProcess and assert immediate signalling of that retained handle after cleanup, with no extra post-stop wait. The natural-descendant fixture waits for an explicit test gate after child readiness so identity is captured before the leader exits. Keep job-accounting and directory cleanup unchanged; the old CI log alone cannot prove PID reuse or a real process leak.

The retained-handle native regression reproduced WAIT_TIMEOUT on Windows, proving job accounting alone is insufficient for this stop barrier. On stop, preserve existing kill-on-close limits, add an active-process admission limit of1 (no new children while the existing tree closes), then snapshot all job PIDs into a bounded1024-entry buffer. Reject truncation/unknown failures. Open and retain SYNCHRONIZE/query handles, verify membership with IsProcessInJob, and ignore only a disappeared PID or a reused PID no longer in this job. TerminateJobObject is asynchronous; wait each retained member and the original leader to signal, release those handles and require zero job accounting before completed=true. Retryable cleanup errors retain the frozen member handles and worker ownership. No arbitrary grace sleep, process-name matching, foreign-process termination or successful timeout acknowledgement.

## 7. Wrong / correct
Wrong: expose arbitrary shell args, label a live PID as logged in, free an entry before a delayed spawn returns, or kill all XWin processes. Correct: fixed args, querying status, resource-owned worker lease, per-run process group/job and bounded metadata.

Wrong: `let _ = timeout(STOP_TIMEOUT, wait_until_empty()).await;` in app Exit; it returns normally with a blocked worker and owned files. Correct: subscribe to each used entry's actual `done` watch under lock, release the lock and await every true completion in `shutdown_wait`; retain the user-facing `xdmcp_stop_pending` budget separately.

## Darwin zombie-group distinction
Native CI reproduced EPERM from killpg after TERM ended the group. Only macOS EPERM may be completed after bounded proc_listpgrppids/proc_pidinfo checks prove no live group member; all other permission failures, unknown states, query errors or a full256-member buffer remain failures. The leader stays unreaped through this check. The native harness and full suite also assert that the current live group cannot be classified as inert. Do not blanket-ignore EPERM or increase stop deadlines to hide the failure.

## Windows directory teardown distinction

Native CI observed a sharing violation during immediate directory deletion after job accounting reached zero. The worker already retains its lease and retries actual removal, marking stopping until cleanup succeeds. The small native harness must exercise that contract too: poll removal, fail with the original error after5s, and assert the directory no longer exists. Do not turn a deletion error into successful acknowledgement or free the worker quota before actual cleanup.

## Scenario: Explicitly Authorized WSL Test Target

### 1. Scope / Trigger
Only when the maintainer authorizes modifying a named WSL distro for XDMCP tests. This is a local test fixture, not an application installer, shipped dependency or approved engine. Windows firewall/AV changes still need separate approval.

### 2. Signatures
The locally installed `/usr/local/sbin/nexaterm-xdmcp-test run|stop|status|info` manages only its dedicated service. `run` holds a foreground WSL invocation, verifies readiness, stops on interruption and has a 30-minute service maximum. `info` emits current NAT `target` / `local_address` only to the local terminal; it is not a new Tauri command.

### 3. Contracts
Save package/manual/service/default-DM baselines before installation; prevent package auto-start and preserve existing policies. Keep the packaged XDM masked and the dedicated unit static. Use empty Xservers, exact interface LISTEN, exact source NOBROADCAST and no indirect rule. Refresh and validate the NAT topology before each start; reject occupied UDP177 instead of replacing a listener. Use a password-locked unprivileged account until the maintainer sets its password interactively. Retain PAM/authentication; restrict only the dedicated service's PAM view, never overwrite global authentication policy. Do not change DISPLAY to WSLg's `:0`.

The Xsession command runs as the authenticated account, not the root XDM daemon. Its file and every parent directory must permit that account to read/execute/traverse. With umask077, `Path.mkdir(mode=0o755)` actually creates 0700: explicitly chmod the newly owned configuration directory to its intended0755, while keeping XDM configuration/access/key files root0600 and the account HOME0700. Do not recursively chmod or relax authentication to mask an exec failure.

### 4. Validation & Error Matrix
| Condition | Required outcome |
| --- | --- |
| Allowed direct Query | Structurally valid WILLING; desktop remains unverified |
| Broadcast opcode / indirect | No response from the exact target |
| Non-allowed source direct Query | UNWILLING; no session created |
| Wrong topology / occupied UDP177 | Fail before XDM starts; no widened ACL |
| WSL went idle after one-shot systemctl start | Diagnose actual service/lifecycle first, not assumed firewall failure |
| Login reaches session exec, then XDM records errno13 | Check session UID traversal/read/execute; do not assume a password or firewall failure |
| Stop or foreground interruption | Original XDM identity exited; listener/runtime absent; unrelated services untouched |

### 5. Good / Base / Bad Cases
Base: the service is stopped and account locked after preparation. Good: keep the explicit foreground owner running during an authorized test, then inspect exact cleanup. Bad: enable autostart, switch WSL networking, use `*` or disable authentication to conceal a failure.

### 6. Tests Required
Pair positive discovery with denied-source, broadcast-opcode and indirect negatives; don't count all timeouts as correct rejection when the target is dead. Check the actual service-private PAM mount and denial of root/existing users before password prompts. Retain a pidfd before stop to verify the original process, not a recycled PID. Logged-in desktop/session-scope cleanup needs separate live tests; no-login service cleanup cannot establish it.

Record local managed-engine teardown and remote login-UID teardown separately. Sample the remote session/scope before ending the test service or its foreground owner; if auxiliary processes remain, preserve that first observation and the later outcome. A final empty UID after stopping XDM or letting WSL idle does not prove immediate per-session cleanup. An unchanged kernel boot time alone does not establish an uninterrupted distro lifecycle. Do not kill all UID processes or delete directories to turn the acceptance result green; retain unresolved remote ownership/timing as a separate limitation.

For concurrent desktop tests, retain an independent foreground observer after stopping XDM. Hold PID1 and observed process pidfds before teardown, identify each logind session by Scope/Leader/Display and each process by start time/cgroup, and record service InvocationID. A shared UID is not a session identity. Observer failure, missing properties or a disappeared-before-capture process must not become successful cleanup evidence. Stop observation explicitly; no automatic distro-shutdown result can replace the observed session lifecycle.

Use repeated `-p FIELD` selectors for `loginctl show-session`, not a `systemctl`-style comma list; `--all` preserves legitimate empty fields such as Display. Keep strict required-field parsing and test the real logged-in session path: an empty-UID smoke never reaches this call. On observer failure retain the original record and start a separate capture; do not claim uninterrupted identity coverage. A signalled pidfd establishes process exit, not `/proc` removal; report remaining zombies separately from live processes. If the test firewall allowance expires before desktop shutdown, record that network interruption and do not label the remote result an undisturbed normal logout case.

Retain exited `(pid, startTicks)` identities and include zombies in process snapshots rather than repeatedly reopening their already-signalled pidfds. Record whether a zombie had a prior live capture; never invent one for an initially observed zombie. Test the real live-to-zombie-to-reap transition using `waitid(WNOWAIT)`, repeated snapshots without duplicate events, and PID reuse with a new start time. A no-login run must explicitly skip, not pass, the live-session property test.

For pre-login MIT-cookie rejection affecting both managed and independent engines, check the target's duplicate-Request behavior before changing local display ownership or weakening authentication. A bounded synthetic negotiation can compare repeated Accept session/authorization equality in memory without sending Manage, starting a login or logging cookie bytes/hashes. Keep this distinct from a packet trace of the failing desktop. The observed XDM target regenerated authorization for an unchanged unstarted session; a real protocol regression is recorded in `validation/isolation-batch-diagnosis.md` under the implementation task. `sourceAddress=true` is not proof that XDM bypasses reverse DNS; measure the actual lookup path. Component replacement or target-service changes still need explicit approval.

Manual remote cleanup requires separate maintainer approval and fresh checks of the observed distro identity, session UID/creation timestamp/leader/scope, stopped test service and retained process identities. A successful `loginctl terminate-session` is not a completion barrier: an already-closing session can leave an active/abandoned scope. Preserve that failed outcome; if authorized cleanup continues, stop only its revalidated exact scope and await original pidfds plus actual session/process disappearance. Do not terminate the entire UID or change global kill/timeout policy. Shared user-manager shutdown after the final session is separately observed. Manual cleanup never becomes natural-cleanup or desktop-isolation PASS.

Run the actual directory-construction statements under umask077 and assert resulting modes, then run read/execute checks and `sh -n Xsession` as the real unprivileged test UID. Assert private XDM files remain unreadable to that UID. A root-only mode check, PAM rejection, or UDP WILLING cannot establish that the post-login session command is reachable.

### 7. Wrong vs Correct
Wrong: `wsl ... systemctl start ...` returns, WSL idles, and the missing UDP reply is used to justify opening Windows firewall. Correct: systemd alone does not keep WSL alive; retain a foreground WSL owner, verify a positive query on the live service, then run negative cases. Machine addresses, account metadata, raw logs and authentication material remain local. Current evidence: `.trellis/tasks/10-16-wf09-07-xdmcp-implementation/validation/wsl-target.md`.

Wrong: trust the requested mkdir mode or only assert Xsession itself is0755. Correct: verify the resulting parent mode and actual login-UID access; pair the positive executable check with negative reads of private configuration. A live errno13 regression and the minimal directory-only repair are recorded in `validation/native-desktop-preflight.md`.

## Scenario: Authorized Private XDM Request-Idempotency Repair

### 1. Scope / Trigger
Only after explicit approval to repair the dedicated test target and install necessary build dependencies. This is not a shipped NexaTerm component, a system display-manager replacement or permission to open another network window.

### 2. Signatures
Local `private-service.py stage|status|apply|rollback` under the ignored test directory; no product IPC. Protocol runner: `unshare --net -- python3 protocol-regression.py --binary <exact-daemon> --label <fresh-receipt>`. Existing receipts must not be overwritten.

### 3. Contracts
Verify fixed source archives and distribution patches through a signed source-index chain before execution. Simulate and pin the complete build-package closure; compare installed versions afterward, rejecting unapproved upgrades/removals. Build only the required daemon as a non-root user; preserve the existing greeter, PAM and access policy when their interfaces are unchanged. Retain licensing and exact source/patch/binary hashes locally.

`SetProtoDisplayAuthorization(pdpy, nameLen, name)` may reuse the existing authorization only for the same proto-display and exact selected scheme. Keep the caller's scheme selection and authentication checks before that reuse. A stable Session ID alone is insufficient: the first Accept authorization must match the X11 setup authorization after repeated Request and Manage. No cross-session cache, `-ac`, password bypass, silent client retry or timeout extension.

Stage the binary into a root-owned non-writable-by-others versioned private prefix. Apply/rollback hold the dedicated foreground owner's lock and require inactive/dead service, MainPID0 and no test login sessions or UID processes. Verify original unit/config/PAM/controller/greeter and binary hashes. Change only an owned ExecStart drop-in; rollback removes only that exact unchanged file and reloads the manager. Never start/stop services as part of the switch, remove foreign drop-ins or claim a closing session is absent. Preserve retryability after daemon-reload fails.

### 4. Validation & Error Matrix
| Condition | Required outcome |
| --- | --- |
| Identical Request repeated before Manage | Same Session ID and authorization; actual X11 setup matches first Accept |
| Different display/source socket or new session | Independent authorization/session identity |
| Malformed packet, unsupported scheme or wrong-session Manage | Preserve the established parser/rejection behavior; no relaxed authentication |
| Active service, closing session or UID process remains | No switch; report the blocking condition |
| Binary/config/drop-in drift | Refuse overwrite or deletion; preserve evidence |
| Exact rollback / repeated rollback / prior reload failure | Recover the known command state without deleting unrelated configuration |

### 5. Good / Base / Bad Cases
Base: private artifact staged, service stopped, original system binary unchanged. Good: original and same-configuration rebuild both fail the targeted protocol invariant, patched and final installed artifacts pass it. Bad: mark W07 passed from synthetic negotiation or clear a residual UID to permit deployment.

### 6. Tests Required
Use fresh loopback-only network namespaces and a real daemon. A synthetic X server compares only its own negotiation's authorization in memory, returns an explicit failure to end before greeter/PAM/login, and never logs cookie bytes/hashes. Retain daemon pidfds, reap owned descendants and remove owned temporary files only after exit. Pair protocol cases with drift, active-session, exclusive-file and reload-recovery switch tests; verify actual apply/rollback plus effective ExecStart separately from mocks. Keep original compiler warnings visible and check the patch introduces none. Re-run the real desktop scenario afterward; synthetic PASS does not close W07.

### 7. Wrong vs Correct
Wrong: fix DNS/serialize launches until a single Request happens, then call the cookie fault resolved. Correct: make the repeated-Request/first-Accept/Manage invariant pass against the real daemon first. Original diagnosis, private build/switch and the still-pending desktop scenario are recorded separately in the task's `validation/private-xdm-request-fix.md`.

## Scenario: Manually Authorized Local Firewall Test Window

### 1. Scope / Trigger
Only after separate maintainer approval of a named local test. This is an ignored, machine-specific helper, not a shipped command, automatic elevation or a change to the runner's no-firewall-management contract.

### 2. Signatures
Local `xdmcp-firewall.ps1 -Mode Check|Apply|Restore [-Display 100..131]`; Check is the default. Apply/Restore require a manually opened administrator PowerShell. The current single-window default is display100/TCP6100, not the entire display range.

A separately approved three-instance isolation window uses a new helper with no Display argument and an exact fixed TCP6100/6101/6102 scope. Its Version2 recovery state and unique prefix reject earlier single-port state; do not extend or overwrite an old window. Native rule serialization of precisely the same port set is acceptable, never a wider set. Both managed engines and the independent control must be stopped before restoring broad pre-existing rules. Tool preparation and mock tests are not evidence of administrator Apply or W07 desktop isolation.

### 3. Contracts
Pin executable identity and original rule snapshots; discover current NAT endpoints and check effective policy/port conflicts. Use exact rule Name plus configuration/filter equality, never DisplayName for mutation. Persist and flush recovery state before disabling originals. Create the one-program/interface/local-IP/remote-IP/TCP-port rule disabled, record its snapshot, then enable and check ActiveStore. No global profile, AV, unrelated rule or Windows UDP177 changes.

Use an exclusive foreground owner with a maximum 30-minute wait. Restore removes only the owned temporary allow, then requires the engine to be closed before enabling the original broad rules. Drift is an error; retain recovery files. An already restored state must not overwrite subsequent user changes. Forced host termination cannot guarantee finally execution; support explicit Restore without requiring the old WSL address or an unchanged executable to remain present.

### 4. Validation & Error Matrix
| Condition | Required result |
| --- | --- |
| Non-admin Apply/Restore | Reject before any firewall mutation or state creation |
| Changed baseline / wrong topology / occupied port / overlapping allow | Stop; do not widen policy |
| Partial disable or create failure | Attempt exact rollback; preserve the original error and any recovery error |
| Engine alive at recovery | Remove owned temporary allow, keep broad rules disabled, require close then Restore |
| Concurrent filter change | Refuse overwrite/removal; preserve recovery evidence |
| Forced PowerShell termination | No automatic-recovery claim; use durable manual Restore |

### 5. Good / Base / Bad Cases
Base: Check is read-only and no engine is running. Good: one actual display matches the authorized TCP port, with real cleanup before restoring broader pre-existing policy. Bad: range-wide allow, UDP177 inbound on Windows, global process killing or restoring broad access while the engine remains alive. One port cannot establish the two-instance desktop acceptance case.

### 6. Tests Required
Real read-only checks plus mocked partial mutation, creation-before/after failure, effective-policy failure, interruption, live-engine recovery refusal, state collision, exact filter drift and idempotent restore. Exercise real state-file durability operations on private test files. Run both Windows PowerShell 5.1 and PowerShell 7 if the user command supports both; mock success is not administrator-write or network evidence.

For local batch helpers, observe readiness while the real child is still alive. Live log readers must allow the existing writer (`FileShare.ReadWrite`), and readiness output must not remain buffered until child exit. Consume only newline-complete JSONL records; malformed complete records fail. An early child exit or readiness deadline cannot become success. Preparing the helper does not authorize automatic consent, login or administrator Apply/Restore, nor does it prove three-desktop isolation.

Windows test observers/owners must gate exit on `WaitForSingleObject` of their retained original handle, not cached `.NET Process.HasExited`/`ExitTime` metadata. Only after WAIT_OBJECT_0 read native `GetExitCodeProcess` and `GetProcessTimes`; reject zero/before-creation times and query/wait errors, never substitute sampling time. A real exit code259 is valid once the handle is signalled. Test a genuine live handle paired with simulated early/cached metadata, then a real exit259; also assert all observer/owner call sites use the guarded helper. Preserve old invalid-time records instead of rewriting them. The private-daemon desktop retest records this correction separately from its 2026-11-21 maintainer-signed W07 desktop result and the missing final observer coverage. Accept the manual signoff without inventing automated PASS; empty resources after a reboot do not establish earlier natural teardown.

### 7. Wrong vs Correct
Wrong: assume `$null` passes a null string to `File.Replace`, or assume a PS5 `ConvertFrom-Json` top-level array is enumerated like PS7. Correct: pass `[System.Management.Automation.Language.NullString]::Value` for the optional backup filename; assign parsed JSON before normalizing it to an array. Keep atomic state replacement and cross-host tests instead of suppressing errors or overwriting the sole recovery record in place. Local preparation and remaining real-write/desktop checks: `.trellis/tasks/10-16-wf09-07-xdmcp-implementation/validation/native-desktop-preflight.md`.
