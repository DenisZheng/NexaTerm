# Loopback File Service UI

## Scope and entry
WS-E06 lazy Tools entry, WS-R01 transient state. Local and SSH fallback use LocalToolsPanel; SSH toolbox offers the same LocalFileService. It always serves the local machine, never the selected SSH host. Browser preview disables native operations. Existing shared tool forms/buttons and theme tokens are reused.

## IPC and ownership
Typed reserve/start/stop/status/audit wrappers match the backend contract. Pin selected path and port before reserve. A single operation object owns late responses; cancellation/unmount releases a late reservation without starting it. Stop failures retain ownership for retry. Old start/status responses cannot overwrite a newer operation. Status polling is serial every two seconds only while active. An adopted running service exposes no token and is not implicitly stopped on unmount; explicit stop is available.

## Transient and explicit actions
Native single-file selection never starts automatically. Display only basename, fixed loopback address, size and masked token. Copying a curl command requires an explicit click and uses the native clipboard. No path, token, lease, audit or command enters snapshots/settings/logs. Leaving the owning panel stops the service; backend lifetime/window-exit cleanup remains authoritative. Audit is a bounded app-session event list, not durable compliance logging.

## Limits and failures
UI shows 16 MiB/15-minute bounds, automatic port 0 or 1024–65535, fixed bilingual errors, retryable stop and desktop-only unavailability. Picker responses after leaving are ignored. Only recognized backend error codes are displayed; raw exception messages never reach UI.

## Verification boundary
Controller/component tests cover pinned input, duplicate start, late reserve/start, cancellation, retry, unmount, adopted service, stale poll, expiry and explicit picker/copy. Source gates cover lazy loading, i18n, snapshots and line budgets. Real native IPC, clipboard, themes and operating-system lifecycle acceptance remain MANUAL_REQUIRED.
