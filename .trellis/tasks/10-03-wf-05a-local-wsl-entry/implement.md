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
- [x] 区分 wsl.exe 缺失、无发行版、probe timeout/failure。
- [x] Local/WSL 打开/关闭 lifecycle 自动化，确认 session/PTY 清理。
- [x] WSL distribution identity / label 不因 profile 刷新漂移。

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


## 05A-2 实施证据

- backend 新增 `WslProviderCapability` 与稳定状态：`available / command_missing / no_distribution / probe_timeout / probe_failed / unsupported_platform`。
- `local_terminal_wsl_capability` 仅在 Windows 且当前入口没有可见 WSL profile 时由前端额外调用；正常已检测发行版不会重复 probe。
- WSL probe timeout/non-zero/spawn failure 现在收敛为 provider capability，不再让 WSL 探测失败拖垮 PowerShell/cmd/Git Bash 等其它 Local profiles。
- 新增 `build_wsl_profile` 稳定投影与测试，固定同 distro 的 profile id、label、`-d <distro>` args，避免 profile refresh 后 identity 漂移。
- Windows CI 新增 `kind=wsl` 的共享 `LocalTerminalSession` close/master-release lifecycle 测试。该测试故意用 cmd.exe 作为可控进程，只证明 WSL-shaped profile 复用相同 PTY 清理边界；不冒充真实 WSL 互操作，真实发行版启动仍归 A11。
- New Session UI 对 command missing / no distro / timeout / probe failure 提供精确提示；若 backend 报 available 但 profile 被用户隐藏，则单独显示“可用但已隐藏”，避免误报未安装。
- 未修改 `scripts/line-budget.json`，未进入 Serial/Telnet/RDP/VNC。
