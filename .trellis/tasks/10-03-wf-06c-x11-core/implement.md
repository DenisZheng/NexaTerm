# WF-06C 实施切片

## 06C-0 启动
- [x] 从 WF-06B 全绿 HEAD `dccb26dbb08a9f57252108bedbbad60d382bba03` 建 `feat/wf06c-x11-core`。
- [x] 核对现有 feasibility spike、russh API、RFC 4254 与可参考 Rust 项目。
- [x] 决定先做生产 core，不把 GPL X server 引入安装包。

## 06C-1 production X11 core
- [ ] profile 增加默认关闭的 X11 配置。
- [ ] 本机 DISPLAY / xauth / real cookie 自动准备。
- [ ] CSPRNG 生成 128-bit fake cookie。
- [ ] TerminalSession 生产路径 request_x11。
- [ ] incoming X11 channel 严格首包 cookie 替换。
- [ ] request/close/failure 清理 X11 state。
- [ ] 单元测试 + source gate + 三平台 CI。

## 06C-2 Experimental UI / platform feedback
- [ ] SSH Advanced 增加 X11 开关与 DISPLAY override。
- [ ] Linux/macOS/Windows 平台提示与错误说明。
- [ ] WS-N04 Windows X server 分发方案保持显式待决，不伪装成已支持。

## 06C-3 real A13
- [ ] Linux Xvfb fixture 改为生产 profile/Terminal 路径。
- [ ] 真实远端 X client 能连接本地 X server。
- [ ] cookie mismatch / local server unavailable fail closed。
- [ ] 后续集中人工验收真实 Tauri GUI window。

不要修改 `scripts/line-budget.json`。
