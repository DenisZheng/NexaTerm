# WorkspaceShell 状态 seam 实施计划

## 0. 启动前门禁

- Task 03 Vitest 门禁已在 CI（`35411114576` 全绿）。
- 基线数字（2026-09-19，`2b56749`）：`WorkspaceShell.tsx` 14,370 行；`useState` 108（组件内 77）、`useEffect` 40、`useReducer` 0。
- 本机：Node 24 / pnpm 11.22.0 / rustup 1.98.1，`tauri dev` 可运行，可做手动冒烟。

## 1. 第一刀：Split reducer

- [ ] 新建 `src/features/workspace/split/{actions,reducer,selectors}.ts`，状态与 action 按 design §2。
- [ ] `reducer.test.ts`：design §2 的 characterization 用例 + 每个 action 的最小用例；未知 action 返回原引用；`revision` 语义。
- [ ] WorkspaceShell：12 个 `useState` 换 `useReducer`；按 setter 调用点逐个改 dispatch（总计约 80 处），多 setter 连改处合并为一个 action；effect 位置不动。
- [ ] 若 `TerminalSplitSurface` / `TerminalSplitMenu` 的 props 只是透传 state 字段，保持 props 契约不变，只改来源。
- [ ] 验证：`pnpm run check`、`pnpm test`、`pnpm run build`、`node scripts/check-startup-module-boundary-source.mjs`；手动冒烟：开两 pane、移动、同步输入、关闭一个、关闭全部。
- [ ] 记录前后行数与计数；提交 `refactor(workspace): extract split reducer`；push，记录 CI run。

## 2. 第二刀：SessionTabs reducer

- [ ] 先写 characterization：现有关闭活动 tab 的相邻激活规则、connecting→terminal 迁移、重连 sessionId 替换、RDP/VNC 失败留存，全部以现状为准。
- [ ] 新建 `sessionTabs/` 三件套；`WorkbenchTab` 判别联合按 design §3。
- [ ] 合并五个集合与六个 active 指针；派生值进 `selectors.ts` 并在 WorkspaceShell 用 `useMemo`。
- [ ] 逐个审 13 个 tab/active 相关 effect：纯指针对齐的删除，带副作用的改读 selector；每删一个 effect 在 implement.md 记一行"删除原因"。
- [ ] 验证同第一刀，冒烟加：SSH/本地/RDP 各开关一次、断线重连、关闭活动 tab。
- [ ] 提交 `refactor(workspace): extract session tabs reducer`；push，记录 CI run。

## 3. 第三刀：MultiExec reducer

- [ ] 新建 `multiExec/` 三件套；`buildCommandSenderTargets` 迁入 `selectors.ts` 并改为消费 SessionTabs state。
- [ ] 从 Split reducer 移交 `sync.*`；Split reducer 去掉 sync 字段，其测试同步调整。
- [ ] 吸收 command sender 11 个 useState 与 `selectedCommandTargetKeys`。
- [ ] 验证同前，加 `node scripts/check-command-sender-active-tab-source.mjs` 与 `check-command-sender-mvp-source.mjs`（两脚本此前已知漂移，若失败先核对是否为脚本假设过期，不为迁就脚本改行为）。
- [ ] 提交 `refactor(workspace): extract multi-exec reducer`；push，记录 CI run。

## 4. 文档

- [ ] `.trellis/spec/frontend/state-management.md`：reducer/action/selector 约定、目录、命名、测试要求。
- [ ] `docs/ARCHITECTURE.md`、`docs/CURRENT_STATE.md`：WorkspaceShell 状态所有权与前后数字。
- [ ] `docs/tasks/05-workspace-restore-and-schema.md`：注明快照输入为 `SessionTabsState` + `SplitState`。

## 5. 回滚点

每刀独立提交，`git revert <sha>` 即回滚；reducer 目录无其它消费者。

## 结果记录

（执行时填写）
