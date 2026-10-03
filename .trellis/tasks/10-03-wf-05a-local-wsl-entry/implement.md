# WF-05A 实施切片

## 05A-0 启动
- [x] 从 WF-04C @ f824cc178 建 `feat/wf05a-local-wsl-entry` 堆叠分支。
- [x] 对齐 9-23 Delivery Plan：WF-05A 只做 Local/WSL；A09/A10 暂存，后续与 A11 集中验收。
- [x] 复核现有 `local_profiles.rs` WSL distro 探测与 `local_terminal_open`，不重写 provider。

## 05A-1 统一入口投影
- [x] 新建会话把 native Local 与 WSL distributions 分组。
- [x] 非 Windows 不显示 WSL section。
- [x] Windows loading / detect failure / no distro 有明确不可用提示。
- [x] 复用现有 profile callback，不增加第二份 target/session state。
- [x] unit + source gate + CI 接线。

## 05A-2 provider capability / lifecycle
- [ ] 区分 wsl.exe 缺失、无发行版、probe timeout/failure。
- [ ] Local/WSL 打开/关闭 lifecycle 自动化，确认 session/PTY 清理。
- [ ] WSL distribution identity / label 不因 profile 刷新漂移。

## 05A-3 workspace integration
- [ ] Local/WSL instance Split 接线与回归。
- [ ] Local/WSL MultiExec target 接线与回归。
- [ ] A11 自动化边界准备；真实 A09/A10/A11 延后集中验收。

每个切片：定向测试 → 全量相关检查 → source gate → line budget → commit → push → CI。不要修改 `scripts/line-budget.json`。


## 05A-1 实施证据

- 新增 `newSessionLocalEntries.ts` 纯投影：Windows 将 `kind=wsl` 的 detected profiles 单独投影到 WSL section；其它 Local shells 保持 Local section。
- 非 Windows 不显示 WSL section；Windows 在 loading、profile detection failure、零 WSL profile 三种状态下均提供明确但不过度推断的提示。
- 选择 WSL distribution 仍复用 `onOpenLocalProfile → openLocalTerminalByProfile → local_terminal_open`，未引入第二份 session/profile 状态。
- 当前 backend 尚不能精确区分“wsl.exe 不存在”与“无 distro”，因此 05A-1 文案只承诺不可用/未检测；细分 reason 留到 05A-2。
- 新增 Vitest projection tests 与 `check:wf05a-local-wsl` CI source gate；未修改 `scripts/line-budget.json`。
