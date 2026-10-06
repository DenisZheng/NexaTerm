# 关闭全部实例后 Home 空白：诊断记录

> 本文记录修复前的诊断过程。维护者随后已确认实施；修复结果见 `verification.md`。一次性 `repro.cjs` / `fix-proposal.patch` 保留在原诊断工作树，新分支将可复现验证纳入 `scripts/workspace-home-close.test.mjs`，不重复维护诊断脚本。

## 现场与授权

- 日期：2026-10-06。
- 维护者确认关闭的是 NexaTerm 顶部所有会话标签，随后 Home 一片空白。
- 运行工作树：`/private/tmp/nexaterm-wf07-files-follow-snapshot`。
- 候选：`fix/wf07-files-follow-snapshot @ f3b471e0d5dd18f98aa0c2a891bc2e4fadcc03e3`。
- `pnpm run tauri:dev` 的持续会话为 `61577`；保留现场，未发送中断、刷新或重启。
- 已批准创建独立诊断任务；产品代码修复需另行确认。当前未修改运行时代码，未提交或推送诊断材料。

## 已取得的证据

1. `curl -sS -o /dev/null -w 'HTTP %{http_code}; total %{time_total}s\n' http://localhost:5520/` 返回 `HTTP 200; total 0.002538s`。仅证明开发服务可响应，不能证明 WebView 的应用渲染正常。
2. `ps -p 78920,78845 -o pid,ppid,state,%cpu,%mem,etime,comm`：NexaTerm PID 78920 与 Vite PID 78845 均存在、状态 S，本次采样 CPU 均为 0.0%。不能据此排除前端异常。
3. AppleScript 只读窗口结构成功：

   ```sh
   osascript -e 'tell application "System Events" to tell process "nexaterm" to get entire contents of window 1'
   ```

   返回两层 group、一个 scroll area 和一个 UI element；没有 Home 文本、按钮或会话标签。与维护者报告的空白相符，但单次 AX 观察不是完整的触发复现，也不能独立证明 DOM 已卸载。
4. 进程表存在与 NexaTerm 启动时刻接近的 WebKit GPU / WebContent / Networking 进程（PID 79002 / 79003 / 79004），本次 CPU 均为 0.0%。这些 XPC 进程的 PPID 为 1，尚未独立证明应用归属，不能仅以启动时刻认定它们属于 NexaTerm。
5. `~/Library/Logs/DiagnosticReports` 与 `/Library/Logs/DiagnosticReports` 顶层未找到名称包含 NexaTerm、WebKit 或 WebContent 的报告；这不等于证明没有崩溃。
6. 开发会话累积输出有重复 `app_error code=secret_missing ... recoverable=true`。这是累计读取且没有逐条时间戳，不能据其数量推断实时频率；尚未确定请求来源、失效引用、是否影响正常路径或与空白页的因果关系。

## 已运行的最小验证

- `node scripts/check-workspace-empty-home-source.mjs`：通过。
- `node node_modules/vitest/vitest.mjs run src/features/workspace/sessionTabs/closeDecision.test.ts src/features/workspace/sessionTabs/reducer.test.ts src/features/layout/HomeSessionStart.test.tsx`：3 个文件、57 项测试全部通过。
- `git diff --check`：通过。
- 这些现有检查覆盖关闭决策、状态 reducer 和 Home 入口组件，没有自动驱动当前原生应用关闭全部标签；其通过不能证明此次空白故障已消失。

## 取证限制

- Computer Use 的应用清单没有当前开发态 NexaTerm；按进程名与开发二进制路径绑定均失败，不能据此判断产品异常。
- 后续维护者明确批准用 AppleScript 打开并读取 Console，已执行 Cmd+Option+I；没有刷新、重启或清理日志。
- Safari 当前未显示开发菜单，未改变 Safari 设置。
- 现已建立下面的真实 controller + 渲染派生函数最小复现。它重现相同空对象异常和 React root 变空；尚未在原生应用重新执行维护者原始关闭顺序，不能将 jsdom 结果写成 Mac 人工通过。

## Console 与直接原因

当前原生窗口 Console 捕获：

```text
TypeError: null is not an object (evaluating 'activeConnection.name')
WorkspaceShell.tsx:13074:88
```

同时有 `Each child in a list should have a unique "key" prop` 警告；它不是本次已证明的空对象异常原因，不纳入本修复。`secret_missing` 也不需要参与下面的复现，维持独立只读诊断范围。

直接原因是 `WorkspaceShell.tsx:12583` 的类型守卫 `isSshConnection` 把不存在的连接也按缺省协议识别成 SSH：

```ts
return (connection?.protocol || "ssh") === "ssh";
```

`null` 和 `undefined` 均返回 true。`buildCommandHistoryScopeOptions` 在 SSH 模式下信任此守卫，随后解引用 `activeConnection.name`。该函数在 shell render 的 `useMemo` 中调用，即使命令历史面板没有显示也会计算。

`git blame` 将守卫实现及调用条件追溯到 `2d227158`；`main @ 17a4365f` 中已有相同逻辑。WF-07 cherry-pick `6bfb3a7` 对 shell 的修改仅涉及 snapshot 导入、生成和恢复，不触及此守卫或命令历史构建。因此这不是本次 Files follow 补丁新引入的判空缺陷。

## 最小复现及单变量实验

运行：

```sh
node .trellis/tasks/10-06-home-after-close-diagnosis/repro.cjs
```

脚本使用实际 `useSessionTabsController` 及其 reducer/closeDecision，从当前 shell 的 TypeScript AST 读取实际守卫和命令历史函数，用 React/jsdom 观察 root。翻译和视图外围使用最小替身，不访问 Tauri、Vault 或真实用户数据，也不加载 WF-07 snapshot。

当前源码两次重复运行均退出 1，约 0.52 秒：

```text
isSshConnection(null)=true; isSshConnection(undefined)=true; legacyProfile=true
close-only-ssh: PASS; afterSshClose=Home; finalText=Home
close-ssh-then-local: FAIL; afterSshClose=""; finalText=""
Cannot read properties of null (reading 'name')
sawNullSshTransition=true
```

关键边界：仅剩一个 SSH 时关闭正常回 Home；同时存在一个本地标签、关闭活动 SSH 时，真实关闭决策先清空活动连接，而模式在 followUp effect 执行前仍为 ssh。渲染期间错误的守卫放行 null，发生与 Console 一致的解引用异常，React root 被清空，后续激活无法完成。因此无需把正常的“无连接”状态伪装成一个虚假连接，也无需吞掉异常。

假设按验证顺序为：① 类型守卫放行空对象；② 关闭状态流另有独立缺陷导致无法切换；③ 必须有 WF-07 snapshot 才触发。最小复现已排除③作为必要条件。进一步只在脚本内存文本中给守卫增加存在性检查：

```sh
node .trellis/tasks/10-06-home-after-close-diagnosis/repro.cjs --probe-null-guard
```

退出 0，约 0.52 秒：

```text
isSshConnection(null)=false; isSshConnection(undefined)=false; legacyProfile=true
close-only-ssh: PASS; afterSshClose=Home; finalText=Home
close-ssh-then-local: PASS; afterSshClose=local; finalText=Home
sawNullSshTransition=true
```

过渡状态仍存在而错误消失，真实 followUp 能完成激活并最终回 Home，支持①；此最小场景没有支持②的证据。脚本的探针没有写回产品文件，随即再跑原始源码仍失败。

首次脚本启动因 pnpm 严格依赖隔离无法从项目根解析 esbuild；核对 Vite 的现有依赖后改从 Vite package 的 require 上下文加载，未安装依赖。React `act` 将渲染异常直接抛出，因此脚本将该异常记录为 FAIL 并继续采集 DOM，未将异常当作成功。

## 待确认的最小修复方案

1. 使用独立修复分支/工作树（建议 `fix/home-after-close-null-connection`），不把改动混入 PR #44。
2. 在 `isSshConnection` 源头要求连接对象存在；保留“已存在的历史 profile 缺 protocol 时视为 SSH”的兼容行为。候选单行差异见 `fix-proposal.patch`，尚未应用。
3. 补充 null / undefined / 历史 SSH profile 的类型守卫验证，以及真实 controller 关闭 SSH → 本地/RDP/VNC 回退 → 最终 Home 的渲染回归；测试须覆盖当前调用模式，不能只断言 reducer 最终状态。
4. 运行相关回归、前端类型检查、`check-workspace-empty-home-source.mjs`、`check-startup-module-boundary-source.mjs`、`git diff --check`。由于修改处在 WorkspaceShell 渲染路径，按项目规范运行前端 build 并检查首屏 chunk 边界。
5. 经维护者授权后再编译启动修复版本并验收关闭场景；原生现场当前仍保留。提交/推送需明确授权，不自动合并任何 PR。
6. WF-07 A=OFF、B=ON 的完全退出/冷启动人工验收继续保持 PENDING。
