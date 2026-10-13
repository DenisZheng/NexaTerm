# Remote editor asynchronous state contracts

## 1. Scope / Trigger

WF-09-02A fixes read/save races under WS-F01/F05/F08/F09. Reuse existing Monaco and Rust UTF-8/version-check commands. No new credential, IPC, snapshot or persistence schema is introduced.

## 2. Signatures

```ts
canSaveRemoteFileEditor(tab, overwrite = false);
changeRemoteFileEditorContent(tab, content, readyCopy, modifiedCopy);
completeRemoteFileEditorRead(tab, initialContent, result, readyCopy, modifiedCopy);
completeRemoteFileEditorSave(tab, submittedContent, metadata, savedCopy, modifiedCopy);
createRemoteFileEditorOperations(); // begin/has/isCurrent/finish/invalidate/activate/dispose
```

`useSessionTabsController` owns the existing file tabs, synchronous ref/setter, and operation scope. Shell supplies I/O and confirmation callbacks; Monaco owns presentation only.

## 3. Contracts

- Capture the submitted content/path/connection/version once. A successful write acknowledges only that content; compare the current buffer to it before clearing dirty.
- Content changes preserve saving/loading locks. Undoing to the old saved text during a pending write must still require dirty-close confirmation; remote content may soon become the submitted draft.
- The toolbar and save handler share `canSaveRemoteFileEditor(tab)`. Clean tabs do not issue redundant writes. Explicit conflict overwrite may save unchanged content, but cannot bypass loading/saving or the operation lock.
- Each file operation has an opaque token. Saves serialize per file; newer reads supersede old reads; read and save cannot race. The scope contains no file contents or credentials.
- The controller setter updates its ref immediately and invalidates removed file IDs before React renders. Closing/reopening the same deterministic file ID cannot reuse old requests.
- Completion/error side effects require a current token. Invalidating UI callbacks does not mean Rust I/O was canceled. Unmount clears tokens; StrictMode activation supports effect replay.
- Read completion preserves edits made after the read started. Read failure preserves the buffer and previous saved text, clears stale editable metadata and reports the error.
- Monaco initializes/updates `readOnly` from `remoteFileEditorIsReadOnly(tab)`: loading or missing editable metadata is protected; verified saves remain editable so later input is preserved.
- Existing mtime/size conflict checks and explicit overwrite/cancel dialogs stay authoritative. Never use the latest buffer as evidence of what an earlier request wrote.
- Opening from Files uses its active pane connection, not a different workspace activeConnection. Existing connection/path editor deduplication is preserved.

## 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| User edits during save | Preserve current content; acknowledge submitted content only |
| User undoes during save | Keep close confirmation until the write result establishes the saved version |
| Repeated save or reload/discard while saving | No second conflicting I/O operation |
| Synchronous invoke throw or asynchronous rejection | Surface error, retain buffer, release lock |
| Remote conflict | Keep local edits and version; require explicit resolution |
| File closes/reopens before old response | No new-tab update, old conflict dialog or directory refresh |
| Newer read completes before older read | Only the newer result applies |
| Read fails (including binary/non-UTF-8 errors) | Preserve buffer, clear stale metadata, prevent a write based on it |
| Component unmounts | Late callbacks have no UI side effects |

## 5. Good/Base/Bad Cases

- Good: write B, type C during I/O, then acknowledge B while leaving C dirty.
- Base: unchanged buffer after successful write becomes saved.
- Bad: write B, then assign `savedContent = currentBuffer` and clear dirty when the promise resolves.

## 6. Required Tests

- `remoteFileEditorState.test.ts`: acknowledged versus latest text, in-flight undo, conflict/edit locks, UTF-8 preview sizing and operation token lifecycle.
- `useSessionTabsController.editor.test.tsx`: same-event ref updates, close/reopen invalidation, unmount and StrictMode replay using the real controller.
- `scripts/wf09-editor-save.test.mjs`: execute real shell functions with delayed I/O; exercise completion/failure/reentrancy, late conflicts/reads, reload edits and dirty close.
- Keep full Vitest/script/type/build, Files, snapshot/restore, startup, i18n and line-budget gates. GUI/SFTP evidence remains separate and may be batched only when the maintainer authorizes it.

## 7. Wrong vs Correct

```ts
// Wrong: the server may have written an earlier buffer.
savedContent: item.content;
dirty: false;

// Correct: acknowledge exactly the request payload.
savedContent: submittedContent;
dirty: item.content !== submittedContent;
```
