# Task 03 前端测试基线 · 交接

> 更新时间：2026-09-19 ｜ 分支 `main` = `origin/main` @ `e16d553`
>
> **当前状态**：Vitest 门禁已落地、已提交、已推送，CI run `35411114576` 全绿（Frontend checks / Rust linux-x64 / windows-x64 / macos-arm64 / Security evidence 均 success）。本机 Rust 工具链已于同日安装（rustup stable 1.98.1），`cargo check` / `cargo test --workspace --locked` 本机通过（303 + 18 tests）。剩余项见「待办」。

## 提交记录

| 提交 | 内容 |
| --- | --- |
| `b9520bf` | Vitest 配置、六个测试文件、`package.json` scripts、CI step、四个 devDependencies |
| `b23bef3` | Trellis 任务文档、前端 Testing Requirements 规范、TEST_STRATEGY / CURRENT_STATE / LICENSE_AUDIT |
| `e16d553` | 修复首次 CI 失败：`@csstools/css-tokenizer@4.0.1`（jsdom 传递依赖，2026-09-18 发布）被 pnpm 11 的 minimumReleaseAge 策略拒绝；在 `pnpm-workspace.yaml` overrides 固定 4.0.0 并用 pnpm 11.22.0 重解析锁文件 |

CI 证据：run `35410207511` @ `b23bef3` 在 `Install dependencies` 失败（上述根因）；run `35411114576` @ `e16d553` 全绿。

## 踩过的坑（接手必读）

- **锁文件必须用 CI 同版本 pnpm 写**：`CI=true npx -y pnpm@11.22.0 add/install`。本机 pnpm 10.30.3 不执行 pnpm 11 的 supply-chain 策略，写出的锁文件本机能装、CI 拒绝。`CI=true` 是为了跳过无 TTY 时的 modules 目录清理确认。
- `@csstools/css-tokenizer` 的 override 是临时措施；4.0.1 发布满策略窗口后可删除该行并重新解析。
- 推送用 SSH：`git push git@github.com:DenisZheng/NexaTerm.git main`。HTTPS `origin` 无凭据；remote 配置未改，是否把 pushurl 固定为 SSH 由用户定。
- `gh` 未安装，CI 结论用 GitHub REST API 读。

## 待办

- 用户审阅 `prd.md`「Decisions Taken」四项（Vitest 4、jsdom 29、不迁移旧脚本测试、ConfirmDialog 作组件测试对象）。
- 是否归档本任务：验收项全部有证据；建议用户确认后 `task.py archive 09-19-frontend-test-baseline`。
- 后续扩展（不在本任务）：WorkspaceShell 内 session/tab、command sender、restore 的 characterization 归 Task 04/05；i18n 归 Task 08；覆盖率阈值待 seam 提取后再定。

## 本任务不做

不拆 WorkspaceShell（Task 04）、不建 restore schema（Task 05）、不引入 i18n（Task 08）、不设覆盖率阈值、不做 E2E。
