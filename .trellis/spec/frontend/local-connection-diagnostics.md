# Local connection diagnostics (WF-09-06B)

## Scope / entry
Tools → Network adds a local direct-route form above existing remote SSH diagnostics. Local workspaces and the SSH fallback without a live session also expose the local form through Tools. The shared component remains lazy (3.98 kB in the verified build), uses AppSelect/Lucide and existing token-based network form/button/result classes. It does not claim SSH auth, Host Key, proxy or jump-path success. No probe runs on mount/focus/profile change. Browser preview displays desktop-only unavailability, never synthetic success.

## Signatures / transient contract
`LocalConnectionDiagnostics({ active, initialHost?, initialPort? })` uses `useLocalConnectionProbe(active)`. The hook returns run/cancel, phase, result, error and busy. Request is `{ kind: dns|tcp, host, port }`; input is not silently trimmed or truncated. TCP UI accepts only decimal1–65535. Backend is authoritative for plain host/IP validation. `localProbeTypes.ts` mirrors the Rust fixed-kind/status/reason schema; shared typed wrappers invoke reserve/run/cancel.

## Ownership and transitions
Only one operation object owns the controller at a time. Pin request before awaiting reserve. Duplicate starts are ignored. Cancel before reserve response releases the late UUID without ever calling run. Cancelling an active request signals its exact UUID; acknowledgement ends local ownership and displays cancellation requested, while the backend core still owns socket/DNS cleanup. Retry creates a new operation and late old callbacks cannot overwrite it. Cancel failure retains ownership/busy and shows a retryable fixed message. Run errors expose fixed request failure; no raw exception text.
Inactive/unmount cancels an owned lease and ignores stale callbacks. Component keys and existing SSH panel tab keys reset ownership on connection/instance changes. A late reserve after unmount is released. Cleanup IPC failure cannot update unmounted UI; unused leases expire and active core operations retain their fixed deadline, with system DNS separately quota-bound. No reservation IDs, host inputs, queries, result state or output are added to snapshots/logs/exports/settings.

## Error / result matrix
Desktop unavailable → disabled Run plus translated hint. Invalid UI port → visible alert, no reserve. Reserve/run IPC failure → fixed request error with retry. Cancel IPC failure → fixed cancel error, Cancel remains retryable. Core statuses success/cancelled/timed_out/unavailable/failed/invalid_input show translated reason/advice, elapsed milliseconds and capped address count; address truncation is explicit. Cancellation acknowledgement is phrased as requested because system DNS may finish later.

## Cases and validation
Good: explicit TCP run renders connection/refusal advice and never sends a shell command. Base: mount alone does no I/O. Bad: cancel/unmount while reserve is pending must never start the late probe. Nine frontend tests cover actual hook IPC races, pinned input, duplicate/stale callbacks, failures/retry and desktop-only form behavior. Full frontend 853 PASS/1 existing todo, scripts178 PASS/3 skips, final types/build and applicable source gates passed. New six manager Rust tests await CI; real GUI/native IPC/light/dark/system acceptance remains MANUAL_REQUIRED.

## Wrong vs correct
Wrong: put raw errors or transient handles in persistent UI, auto-run on focus, or show TCP success as SSH authentication. Correct: fixed bilingual outcomes, explicit user intent, bounded backend owner and transient operation refs.
