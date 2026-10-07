# README 双语与图片验证

验证日期：2026-10-07。基线：`7a8f6a61771df461137374d513cf527d8664c34a`；分支：`docs/readme-bilingual-refresh`。只改文档、图片和本任务记录，不改运行时。

## 自动检查

- `node /private/tmp/nexaterm-readme-demo/verify-readmes.mjs`：PASS。使用现有 marked 解析 GFM 并生成两份 HTML；各 20 个标题、3 张表、6 张本地图片、25 个普通链接。标题层级、表格结构、图片顺序、规范化链接、package scripts 与语言切换一致，缺失本地引用为 0。
- 表格列/数据行数依次为 `2/8`、`2/17`、`4/3`。
- `git diff --check`：PASS。
- 对 README 保留的 8 个唯一外链执行 `curl -L -sS --max-time 20 -o /dev/null -w '%{http_code}'`：全部 HTTP 200。`releases/latest` 当前跳转到发布列表；两份文档均已说明尚无对应正式版本。
- `gh api repos/DenisZheng/NexaTerm/releases`：空列表，尚无公开 Release。
- `gh api repos/DenisZheng/NexaTerm/branches/main --jq .commit.sha`：与本地基线一致。
- [main CI #553](https://github.com/DenisZheng/NexaTerm/actions/runs/37552766479)：`completed / success`，head SHA 与上述基线一致。

## 图像证据

全部来自同一 main 基线的 macOS 原生 Tauri 演示实例，使用虚构配置和 loopback SSH fixture。前五张沿用前会话的图像检查；最后一张由维护者提供，本次直接读取原图检查，未再捕获屏幕。没有对图片内容进行修改。

- `home.png`：Home、Quick Connect 和 Sessions。
- `ssh-files.png`：SSH 与左侧 Files。
- `session-manager.png`：会话与分组。
- `tools.png`：终端旁的运维工具。
- `settings.png`：外观设置。
- `split-multiexec.png`：web-01/db-01 双 pane，Primary input/Receiver、Active · 2 targets 与两个 Receiving 目标清楚可见。图中为本地测试身份和 loopback 地址；命令仍在输入行，不将其描述为执行成功证据。尺寸比其它图片少 2 像素高，保留用户原图而不拉伸。

| 图片 | 尺寸 | SHA-256 |
| --- | --- | --- |
| `home.png` | 3024×1758 | `7523957b4328ec8a8010c768d66f4dc95e54a3705c74256f0ac18a435c71cc41` |
| `session-manager.png` | 3024×1758 | `8a27c32b6b263950dc8efd43be2c293fa9edf8fb51a7a9abc5052fcdcc0e340b` |
| `settings.png` | 3024×1758 | `24ceb7bc03e44770eb40a0130c12151826b2fef279d8ef8f08d3616a60977070` |
| `split-multiexec.png` | 3024×1756 | `5e5d504661c17734a7b94e3ac5eed955f26ac6d313ba20cbd166560bd4544ef4` |
| `ssh-files.png` | 3024×1758 | `30413d283dd5366aad90f42aaa72a018a36eefe4ca4d96794c729f08d57863d0` |
| `tools.png` | 3024×1758 | `4505a138d3c4a03f3d11c346abf9238d2a1443e6f4c9489dceb2b8c59bf44e7c` |

全仓库（排除 Git、依赖、构建和 runtime 目录）搜索确认无剩余引用后，删除五张旧图：`home-connections.png`、`terminal-files.png`、`terminal-monitor.png`、`ai-assistant.png`、`appearance-settings.png`。

## 未通过的附加检查与边界

- 额外启动的 Chrome headless DOM/版式检查在 40 秒后超时；未取得浏览器版式结果，不记为通过。未执行截图，生成的 HTML 不等于完整视觉验收。最终 GitHub 页面观感仍需维护者查看 PR 后确认。
- 本轮无产品代码变更，未重复运行业务测试或全量编译。原生 Tauri 启动所需编译已成功，但它不是三平台发布验收。
- A15 仍未完成；X11/Serial/Linux IME 的边界不扩大，PR #12 不改动。
- 依据 `trellis-update-spec` 检查：没有新增 API、数据模型、工程契约或通用规范，不修改 `.trellis/spec/`。
- 暂存范围限定为两份 README、六张新图、五张旧图删除以及本任务记录。演示配置、密钥、缓存、依赖和构建产物不提交。
