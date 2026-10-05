# WF-08C Design

## i18n contract

CI 读取 `en.json` 和 `zh-CN.json`：
- key 集合必须完全相等；
- 每个 key 的 `{placeholder}` 集合必须相等；
- catalog 必须非空；
- locale 设置仍提供 system / en / zh-CN。

## release-surface contract

锁定：
- package name: `nexaterm`;
- Tauri product: `NexaTerm`;
- bundle identifier: `com.nexaterm.app`;
- updater endpoint: `DenisZheng/NexaTerm/releases/latest/download/latest.json`;
- release workflow repo/asset naming不得回退到 syscryer/mxterm。

## MCP compatibility

Canonical:
- serverInfo: `nexaterm-mcp`;
- status tool: `get_nexaterm_mcp_status`;
- HTTP token header: `X-NexaTerm-MCP-Token`;
- user-facing errors: NexaTerm.

Legacy aliases during transition:
- `get_mxterm_mcp_status`;
- `X-MXterm-MCP-Token`;
- `MXTERM_DATA_DIR`;
- current executable filename `mxterm-mcp` until 08C-2.

Both token headers are authentication-equivalent; CORS advertises canonical plus legacy during transition.
