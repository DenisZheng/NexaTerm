# README 续接记录

## 当前状态（2026-10-07）

英文默认 README 与完整简体中文 README 已完成；六张真实 Tauri 新图已齐，五张无引用旧图已删除。已提交并推送，见 [PR #47](https://github.com/DenisZheng/NexaTerm/pull/47)，尚未合并。静态检查和边界详见 [validation.md](validation.md)。

- 分支：`docs/readme-bilingual-refresh`；工作树：`/private/tmp/nexaterm-readme-bilingual-refresh`。
- 起始 main 基线 `d16610a2`、CI #551；主题修复 PR #46 合入后更新为 `7a8f6a61771df461137374d513cf527d8664c34a`，本次实时确认 main CI #553 SUCCESS。
- 维护者提供最后一张 Split + MultiExec 图片，原样复制。后续截图由维护者操作，助手不得自动恢复截图。
- 两份 README 的结构、表格、图片顺序、链接、构建命令与语言入口一致；六张图片均存在；保留的八个唯一外链均 HTTP 200。
- `releases/latest` 目前跳转到发布列表；GitHub Releases API 为空，文档如实说明暂无公开 Release。
- marked Markdown 解析/HTML 生成与 `git diff --check` 通过；额外 Chrome headless 版式检查超时，未记为通过，GitHub 最终观感留待 PR 审阅。
- 本任务没有产品代码变更，不重复编译或业务测试，不扩大 A15/X11/Serial/Linux IME 验收，不改 PR #12。

## 已核对的产品事实

- 当前 main 存在 `.mxtsessions` SSH 定义导入：`src-tauri/src/mobaxterm_import.rs`、`src/features/connections/MobaXtermImportPanel.tsx`、`ConnectionTransferDialog.tsx` 已接通。与 legacy mXterm 应用数据迁移分开描述，不导入密码或非 SSH 会话；私钥路径可能需要调整。
- `package:all` 只选择当前宿主支持的目标，不是三平台交叉构建。
- NexaTerm 是 syscryer/mxterm 的 hard fork，与 MobaXterm 区分；A15 仍未完成。

## 交付与待审阅项

- 内容提交：`32b6f12dc549635f19b6bf5f0db4e3a93eb02556`；PR 目标为 main，不自动合并。
- 首轮 [PR CI](https://github.com/DenisZheng/NexaTerm/actions/runs/37579964548) 在记录时安全与许可证 PASS，前端、fixture 和三平台 Rust 仍运行中；Windows 手动打包作业按条件跳过。后续记录提交会重新触发 CI，最终状态必须检查 PR 当前 head。
- 等待维护者在 GitHub 审阅两份 README 的最终页面观感，因此任务仍为 in_progress，未将附加浏览器检查超时伪装成完成。
- 提交范围仅包含 README、图片与本任务记录；依赖、构建产物、演示配置和凭据均未提交。
