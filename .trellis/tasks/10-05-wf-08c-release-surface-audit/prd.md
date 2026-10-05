# WF-08C PRD — 品牌、i18n 与发布表面收口

## Goal

满足 A15 / requirements §53、§60 的两条核心门禁：

1. NexaTerm 品牌与更新通道完整；
2. English / zh-CN 可用且不会因新增文案产生 key/placeholder 漂移。

## Facts at task start

- Tauri `productName=NexaTerm`、`identifier=com.nexaterm.app`。
- updater 已指向 `DenisZheng/NexaTerm`。
- release workflow 资产名使用 NexaTerm。
- en / zh-CN 当前各 170 个 key，key 集合与 placeholder 集合完全一致。
- 仍有活跃 MCP 表面暴露旧品牌：
  - MCP serverInfo 为 `mxterm-mcp`；
  - CORS/token header 只宣传 `X-MXterm-MCP-Token`；
  - 部分运行时错误文案仍写 MXterm；
  - 工具名 `get_mxterm_mcp_status` 仍是唯一 status 名；
  - sidecar executable 仍叫 `mxterm-mcp`。

## Compatibility policy

旧 mXterm 字样只能出现在：
- mXterm → NexaTerm 迁移代码/文案；
- 历史归档/attribution；
- 明确标注的兼容 alias。

活跃主身份必须使用 NexaTerm。兼容 alias 不能继续成为新文档/协议的首选名称。

## Slices

### 08C-1 — active surface hardening
- full catalog key + placeholder parity gate；
- product/bundle/updater/release repository gate；
- MCP serverInfo / status tool / token header 使用 NexaTerm 主名称，同时兼容旧 alias；
- 用户可见错误文案改成 NexaTerm；
- CI 独立门禁。

### 08C-2 — executable / installer naming
- 将 release/installed sidecar executable 主名称迁到 `nexaterm-mcp`；
- 兼容旧脚本的策略必须显式、可测试；
- Windows update blocker 同时识别过渡期新旧进程；
- 真实安装包文件清单留到 08E 证明。

## Out of scope

- 不创建真实 release/tag。
- 不提交证书或 updater private key。
- 不把历史 Trellis 文档中的 mXterm 引用批量改写。
- 不删除 WF-08B 所需的旧 identifier/storage key 兼容逻辑。
