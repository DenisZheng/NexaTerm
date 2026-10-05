# WF-08C Implementation

## 08C-1 Active surface
- [x] Audit en / zh-CN key count and placeholder parity at start (170 / 170; no diff).
- [x] Add full i18n + brand/release source gate.
- [x] Make MCP serverInfo canonical `nexaterm-mcp`.
- [x] Add canonical `get_nexaterm_mcp_status` while keeping old status alias.
- [x] Add canonical `X-NexaTerm-MCP-Token` while accepting legacy header.
- [x] Replace active user-facing MXterm MCP errors with NexaTerm.
- [x] Wire independent CI step.
- [x] First green CI evidence: CI #357 / run `37262522837` PASS on `40cdc07b94bb4f285dd39519a9f0793f15aa848a`.

## 08C-2 Executable / installer naming
- [x] Canonical installed/release sidecar filename `nexaterm-mcp` via Tauri `bundle.externalBin` and target-triple preparation.
- [x] Compatibility behavior for existing `mxterm-mcp` callers: protocol/header/env aliases retained and runtime binary fallback supported.
- [x] Update Windows process blocker for transition: recognize/terminate both `nexaterm-mcp.exe` and `mxterm-mcp.exe`.
- [x] Package artifact filename/source audit: release assets remain NexaTerm; installed sidecar canonical name is `nexaterm-mcp`. Real package contents remain WF-08E evidence.

## A15 boundary
08C source/CI success is not real installer evidence. Windows/macOS/Linux installed file names, About/title, language switching and updater behavior remain WF-08E real-platform acceptance.
