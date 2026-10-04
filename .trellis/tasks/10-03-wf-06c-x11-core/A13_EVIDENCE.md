# WF-06C A13 验收记录

> Branch: `feat/wf07-workspace-restore`
> Acceptance: A13 / WS-N03
> Scenario: SSH X11 打开远端图形程序（真实 Tauri 窗口 + Windows 本地 X server）

## 被测对象与环境

- 被测代码：`feat/wf07-workspace-restore` @ `bf25879`（含 WF-06C 生产 X11 路径与 Experimental X11 开关）。
- 平台：Windows 11 Pro / 10.0.26300 / x64。
- 本地 X server：VcXsrv 21.1.16.1（winget `marha.VcXsrv`），display `:0`，TCP `127.0.0.1:6000`，以 `-auth %USERPROFILE%\.Xauthority` 启动。
- 本机认证：`xauth` 来自 VcXsrv 自带 `xauth.exe`（加入用户 PATH），`XAUTHORITY=%USERPROFILE%\.Xauthority`，含 display 0 的 MIT-MAGIC-COOKIE-1。
- 远端：`tests/fixtures` 的 `ssh-x11` 容器（`127.0.0.1:2223`，`X11Forwarding yes`），`testuser` + `tests/fixtures/keys/test_key`。

## 环境预检（准备步骤，非产品验收）

- 本地 `xclock` 连接 `:0` 成功，证明 X server 与 cookie 认证生效。
- `ssh -Y` 至 fixture 执行 `xdpyinfo` 成功，返回 VcXsrv 显示信息（vendor `HC-Consult` / 21.1.16.1），证明“远端 X client → sshd → 本机 X server”整条转发链路可用。
- 与 NexaTerm 相同的调用方式（仅依赖 PATH 与 `XAUTHORITY`）执行 `xauth list`，能读到 display 0 的 cookie。

## 真实 Tauri 验收（维护者执行）

- 2026-10-04，维护者在 NexaTerm（dev 构建）中使用 `127.0.0.1:2223` 的 X11 profile 连接 fixture，执行 `xdpyinfo` 与 `xev`，确认远端图形窗口真实显示并可交互。
- 维护者结论：**PASS**（反馈原话：“Pass”）。
- 证据来源：维护者实测反馈；助手未操作 GUI，环境准备与链路预检由助手完成（见上节）。

## 先前失败与诊断（同日早前，保留记录）

- 首次尝试失败：`app_error code=terminal_x11_prepare_failed`（诊断 ID `74ac051b-ab68-45db-9bad-d38866298b01`），失败于本机 X11 准备阶段，未进入 SSH 连接。
- 根因：本机缺 `xauth` 且无 X server 监听；代码按设计 fail closed，属环境阻塞而非代码缺陷。
- 恢复条件（已全部满足）：安装并启动 X server、提供 `xauth.exe`、`xauth list` 可读 cookie、`6000` 监听、profile 启用 X11。

## 边界

- Windows 本地 X server 为外部依赖；是否随包分发属 WS-N04 待决事项，本次不涉及。
- cookie 隔离（fake → real 替换）由单元测试与 Linux fixture 自动化覆盖；本次验收聚焦真实 GUI 显示与交互。
