# WF-06C 设计

## 06C-1 production core

在现有 `src-tauri/src/x11_forward.rs` 上补齐生产准备流程：

1. 选择 DISPLAY：profile override 非空优先，否则读取本进程 DISPLAY；Windows 无 DISPLAY 时使用 `localhost:0` 作为显式 fallback。
2. 解析到本地 X server target：
   - Unix `:N` → `/tmp/.X11-unix/XN`；
   - XQuartz launchd DISPLAY → 对应 Unix socket；
   - host/display → TCP `6000 + display`。
3. 通过 `xauth list` 读取匹配 display 的 MIT-MAGIC-COOKIE-1；macOS 优先 `/opt/X11/bin/xauth`。
4. 用现有 `getrandom 0.3` 生成 128-bit fake cookie。
5. handler 持有 `X11ForwardState`；request_x11 只提交 fake cookie。
6. incoming X11 channel 的第一个 setup packet必须严格匹配 MIT-MAGIC-COOKIE-1 + fake cookie，再替换成本机 real cookie后转发。
7. local X server、xauth、cookie 或 request 任一失败时返回结构化错误，不静默降级为无认证转发。

## profile model

SSH profile 增加独立 `x11` 配置，不塞进 proxy/jump：
- `enabled: bool`
- `display: Option<String>`，空值表示自动使用本机 DISPLAY。

默认 disabled，旧 profile 通过 serde/default 自动兼容。

## Terminal owner / lifecycle

X11 属于 Terminal session 生命周期：
- 认证成功后、shell 启动前准备 X11；
- 在 session channel 上 `request_x11(... want_reply=true ...)`；
- 成功后 shell 才启动；
- `TerminalSession` owner 保存 X11 state；
- close 和连接失败均 clear state，再 disconnect target/jump clients。

Exec/SFTP/Tunnel 不自动请求 X11，避免非交互 session 无意暴露本地 display。

## 06C-2 platform / UX

- ConnectionDialog SSH 高级页显示 Experimental X11 开关和 DISPLAY override；
- 平台状态说明：
  - Linux：使用现有 Xorg/XWayland DISPLAY；
  - macOS：需要 XQuartz；
  - Windows：需要兼容 X server；是否自动安装/随包分发留给 WS-N04。
- 错误明确区分 display 缺失、xauth 缺失/cookie 缺失、本地 X server 不可达、远端拒绝 X11。

## 06C-3 A13

- Linux fixture：生产 profile + TerminalSession 路径打开 `xdpyinfo` / 简单 X client；
- wrong fake cookie / local display unavailable 必须 fail closed；
- 后续集中人工验收真实 Tauri UI 与实际 GUI window。
