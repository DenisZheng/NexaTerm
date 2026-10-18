# Rlogin workspace owner and transient consent

## 1. Scope / trigger

Wire the already tested native attempt/controller into logical local-instance projection, consent, close/reconnect, split and restore. Follow WORKFLOW_SPEC v0.7 WS-P01/P02/P04 and WS-R01/R02. Backend UUID and terminal data never enter workspace persistence.

## 2. Signatures

`RloginConsentQueue.request(target,signal):Promise<boolean>`, `respond(token,allowed):boolean`, `getSnapshot()/subscribe`, `dispose()`. At most16 pending requests; visible snapshot is a cached frozen {token,target} or null. Only the currently visible token can settle an approval. Target was frozen by the attempt owner, never replaced with live profile state.

`RloginWorkspaceSessions(loadRuntime,requestConsent,onState)` owns per-logical-tab slots. It exposes connect(tabId,profile,window), cancel(tabId), close(tabId), forget(tabId), getOwner/getState, dispose. Runtime loader dynamically imports the actual Tauri factory; no heavy first-screen imports. Pin a whitelist copy of profile/config/encoding/window before waiting for the module. Slot states add loading to attempt phases (the unconnected pane derives restored when no slot exists) and expose only metadata/close intent, no native IDs or bytes.

## 3. Contracts

Queue stores only bounded target snapshots/resolvers; abort removes exactly that request and settles false. Closing/confirming a stale dialog must not approve or cancel the next dialog; guard token and key the shared Radix dialog by it. Queue-full rejects fixed rlogin_session_busy, no network. Dispose settles all false and denies further requests without opening a prompt. Cached snapshot identity changes only when the visible request changes.

An unresolved dynamic import is retained: close/cancel flags prevent a late module from creating/starting an owner. Once owned, cancel/close is issued immediately and waits issued connect work plus actual native cleanup. Close intent is irreversible for that logical tab; a failure retains the slot/tab and only offers retry-close. forget requires successful actual close. Reconnect on a non-closing retained instance awaits old cleanup through the attempt owner, freezes the new target and asks new consent. Only workspace cleanup removes the logical instance; pane detach does not close it.

`LocalTerminalTab.source` and snapshot validation add rlogin. Persist only logical profile/instance/ordinal/source. Restore always waits explicit new consent and never starts Rlogin through generic autoReconnect. Files/MultiExec/macros/history/AI-recent-output exclude Rlogin explicitly. Reuse native fixed reasons; browser and Windows unsupported paths remain real failures without fake provider success, elevation or high-port fallback.

## 4. Error matrix

| Condition | Result |
| --- | --- |
| Consent abort/decline | settle only that request false; no reserve |
| Stale token | no action on current or queued request |
| Queue cap/disposed | fixed busy/denied; no authorization |
| Module returns after cancel/close | no new owner/transport; settle pending operation |
| Close fails | keep slot/tab/controller and fixed cleanup failure |
| forget before cleanup | refuse removal |
| Restore | unconnected logical instance, new explicit permit required |

## 5. Cases

Good: a cancelled loading tab waits its module and closes without allowing late IO; queue response A cannot affect visible target B. Base: same-profile siblings have different logical owners and cleanup. Bad: overwrite one global promise resolver, persist consent, remove the tab before close or route an imported Rlogin target through SSH.

## 6. Tests

Queue cap, FIFO, abort current/queued, stale confirm/close, disposal, snapshot identity and no sensitive fields. Deferred runtime loader, cancelled import, immediate native close, cleanup failure/retry/forget guard, frozen profile before load and same-profile sibling isolation. Then real workspace entry/split/mixed-close/restore/privacy routing, TerminalPanel private binding and full CI. Native WebView/rlogind/platform/theme evidence remains separately reported.

## 7. Wrong vs correct

Wrong: resolve whatever pending consent happens to exist when an old ConfirmDialog finishes. Correct: compare its immutable visible token. Wrong: use public terminal_close for a Rlogin UUID or remove a pending slot before import settles. Correct: workspace retains private ownership through actual completion.
