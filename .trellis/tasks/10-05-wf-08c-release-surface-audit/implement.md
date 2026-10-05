# WF-08C Implementation

## 08C-1 Active surface
- [x] Audit en / zh-CN key count and placeholder parity at start (170 / 170; no diff).
- [ ] Add full i18n + brand/release source gate.
- [ ] Make MCP serverInfo canonical `nexaterm-mcp`.
- [ ] Add canonical `get_nexaterm_mcp_status` while keeping old status alias.
- [ ] Add canonical `X-NexaTerm-MCP-Token` while accepting legacy header.
- [ ] Replace active user-facing MXterm MCP errors with NexaTerm.
- [ ] Wire independent CI step.
- [ ] First green CI evidence.

## 08C-2 Executable / installer naming
- [ ] Canonical installed/release sidecar filename `nexaterm-mcp`.
- [ ] Compatibility behavior for existing `mxterm-mcp` callers.
- [ ] Update Windows process blocker for transition.
- [ ] Package artifact filename audit.

## A15 boundary
08C source/CI success is not real installer evidence. Windows/macOS/Linux installed file names, About/title, language switching and updater behavior remain WF-08E real-platform acceptance.
