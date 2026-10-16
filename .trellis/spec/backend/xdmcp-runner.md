# XDMCP managed runner (X1)

## 1. Scope
External-engine development mode only until an exact bundled manifest has been approved. No packaged engine or supported desktop claim. Native main webview alone can reserve/start/list/stop. At most four reservations/runs. No shell, automatic discovery, installation, firewall changes or privilege escalation.

## 2. Signatures
xdmcp_reserve() -> UUID; xdmcp_start(reservation_id, request:{executable, target, local_address, allow_external, allow_network}) -> Status; xdmcp_stop(reservation_id) -> (); xdmcp_status() -> Vec<Status>; xdmcp_capabilities() -> Capability. Addresses are numeric IPv4 for this first slice; no DNS. Start requires two explicit true flags. Executable is an explicitly selected absolute regular non-symlink native file, never PATH lookup or a script interpreter.

## 3. Lifecycle and budgets
Reservations expire after15s and consume once. Each owned worker keeps its entry, private directory and process owner until real cleanup finishes, including after caller cancellation/timeout. Native metadata reads/spawn are bounded by that retained four-worker quota rather than falsely claimed interruptible. Start await15s; stop await2s then fixed stop_pending. Process creation/file access may block at OS level: cancellation cannot interrupt them but does not release the four-worker quota. Shutdown signals all; window destruction prevents new reservations. Stop is exact-id/owner and idempotent for missing/foreign entries. Only main can inspect state.

Status contains id, phase, optional display and fixed reason only. Phases reserved/starting/querying/stopping/closed/failed: querying means process creation succeeded and query arguments were submitted, not login or desktop readiness. Last16 terminal statuses are transient. Target, path, auth and process identifiers are not serialized, logged, snapshotted or exported.

Display100–131 is allocated within the manager after checking the corresponding TCP port. Concurrent apps/engines can still race for the port; engine failure remains visible, never treated as desktop success. The engine's local_address is the advertised/query source address, not a claim that it listens only on that interface. XDMCP requires authorized network access. Common X server args are fixed: display, -query target, -from local, -auth owned file, -terminate, -listen tcp, -nolisten local. No -ac or arbitrary extra args.

The worker creates a fresh private run directory and Xauthority file; the cookie uses existing getrandom, never arguments. stdout/stderr go to null; no raw engine diagnostics retained. Unix observes leader exit with waitid/WNOWAIT, terminates its process group before reaping the leader (preventing PID reuse), and reaps the direct child; Windows uses a kill-on-close job with the process assigned before resume. This owns child processes without matching global process names. Auth/run files remain until process cleanup; do not remove unrelated X server files. Real engine-specific logs, authentication negotiation and OS socket behavior remain X2 validation, not established by a process fixture. Unix host hard-crash recovery requires a supervisor/parent-death strategy in X2; the current process-group cleanup is for explicit cancellation and normal application shutdown. Do not claim SIGKILL-host cleanup from this slice.

## 4. Validation/errors
Fixed xdmcp_* reasons: unavailable, busy, expired, invalid_request, consent_required, engine_unavailable, port_in_use, start_failed, timeout, cancelled, stop_pending. Reject target unspecified/multicast/broadcast, local unspecified/multicast/broadcast, non-absolute/NUL/oversized paths, non-regular/symlink files and extra fields. Native engine failures expose start_failed, not raw error text. No bundled capability until actual reviewed resources exist.

## 5. Cases
Good: reserve, explicitly select engine/addresses, start -> querying, exact stop -> process tree reaped and private files removed. Base: mount/capability/status never runs a program. Bad: cancel before start cannot later create a process; old IDs and foreign owners cannot stop replacements.

## 6. Required tests
Actual native process fixture on Windows/macOS/Linux: two isolated runs, descendants, cancellation/shutdown, natural/failed exit, timeout/late worker ownership, single-use/expiry/owner quotas, fixed arguments/auth permissions, status secrecy and invalid inputs. Fixture verifies runner behavior only; it is not an X server or real XDMCP evidence.

## 7. Wrong / correct
Wrong: expose arbitrary shell args, label a live PID as logged in, free an entry before a delayed spawn returns, or kill all XWin processes. Correct: fixed args, querying status, resource-owned worker lease, per-run process group/job and bounded metadata.
