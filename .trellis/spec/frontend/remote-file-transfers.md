# Remote-file transfer ownership and queue contracts

## 1. Scope / Trigger

WF-09-01 completes the existing Files workflow (WS-M01, WS-F01/F05/F08/F09). The existing store/controller remains authoritative; no new persistence or Rust credential path is introduced.

## 2. Signatures

```ts
RemoteFileTransferItem.ownerInstanceId?: string | null;
planRemoteFileTransferClose(items, releasedConnectionIds, policy, closingInstanceIds);
createRemoteFileTransferTargets(contextGetter, transferGetter);
useRemoteFileTransferController({ concurrentTransfers, onTaskError });
// controller exposes queuePaused, pauseQueue(), resumeQueue()
readRemoteFileDrop(payload: string): RemoteFileDrop | null;
```

Rust upload/download/cancel commands keep their existing connectionId/transferId contracts.

## 3. Contracts

- New rows capture logical `ssh:tabId` ownership before async picker, metadata, or batch work; runtime SSH sessionId is never the owner.
- Closing instances select owned queued/running rows. Legacy ownerless rows use releasedConnectionIds. Confirmation recomputes the plan.
- Context getters read current session collections. A closed owner cannot create/retry work by falling back to its sibling. Temporary-to-saved rebinding changes connection/retry fields only; queued callbacks resolve the current row connection when starting.
- Queue pause stops new scheduling only. In-flight work retains slots until settled; resume drains the same FIFO queue. It does not provide byte-range resume.
- Internal remote drop uses `{ connectionId, ownerInstanceId, entry: { name, path, type } }`. Decoder rejects missing/malformed metadata and returns whitelisted fields. Receiving shell verifies the source owner is still open.
- A local drop destination overrides downloadRoot and disables groupBySession/timestampDirectory. Preflight and download receive the same target options; conflict policy is resolved through the existing workflow.
- Local list requests use generation guards, preserve prior rows on errors, and invalidate pending work on hide/unmount. First-selection errors stay visible.
- Paths, retry payloads, and owner metadata remain in memory; never write them into snapshots, logs, settings, or exports.

## 4. Validation & Error Matrix

| Condition | Behavior |
| --- | --- |
| Close one of two instances sharing a profile | Confirm/cancel only that owner's active tasks |
| User cancels close confirmation | Keep instance and all tasks unchanged |
| Task finishes during confirmation | Exclude it from recomputed cancellation |
| Owner closes during picker/metadata work | Do not start new transfer |
| Focus changes during async work | Preserve captured source/target |
| Temporary profile is saved while queued | Resolve new connection from the original transfer row |
| Pause with running tasks | Running work continues; no new task starts |
| Older directory request resolves late | Ignore it, including late errors/loading state |
| Invalid internal drop | No download callback / I/O |

## 5. Good/Base/Bad Cases

- Good: capture pane A before opening a picker; A's tasks remain A-owned when focus switches to B.
- Base: ownerless old rows retain last-connection cleanup compatibility.
- Bad: rebuild a transfer target from whichever pane is active after `await`.

## 6. Tests Required

- `remoteFileTransferOwner.test.ts`, `itemClose.test.ts`, `useCloseRequest.test.tsx`: sibling isolation, cancellation, replan and temporary identity.
- `scripts/wf09-transfer-context.test.mjs`: execute real shell functions for delayed pickers/metadata, batch targets, original download source, and queued rebinding.
- `useRemoteFileTransferController.test.tsx`: pause/resume FIFO, cancellation and slot retention, plus existing scheduler regressions.
- `LocalFilePanel.test.tsx`, `remoteFileDrop.test.ts`, `localFilePaths.test.ts`: first error, stale responses, hidden picker, drop decoding and Windows drive/UNC roots.
- Keep Vitest, script tests, type/build, startup, i18n, Files and line-budget gates; CI validates three-platform Rust/security/license.
- Real desktop drag/drop, SSH/SFTP conflict/cancel/reconnect, theme and locale behavior require explicit platform evidence.

## 7. Wrong vs Correct

```ts
// Wrong: target follows focus after an asynchronous picker.
const paths = await selectLocalUploadFiles();
runLocalFileUpload(parentPath, paths[0]);

// Correct: freeze intent, then validate the original logical owner at execution.
const target = captureTransferOptions();
const paths = await selectLocalUploadFiles();
runLocalFileUpload(parentPath, paths[0], target);
```
