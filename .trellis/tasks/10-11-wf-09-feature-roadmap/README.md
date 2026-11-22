# WF-09 Feature Roadmap

Planning-only documentation; no runtime code changes. Parent line: 09-23-nexaterm-workflow-mainline.

Stable sequence: WF-09-01 through WF-09-06. Experimental/Post-v1: WF-09-07 through WF-09-09; these do not block stable release.

Dependency order: 01 SFTP -> 02 remote editor; 03 credentials can run beside 01 and gates 04/06/09; 04 macros uses WF-04C targets; 05 terminal enhancements; 06 diagnostics; 07 XDMCP feasibility; 08 legacy protocol decision; 09 loopback services.

Shared rules: CI/code existence is not real GUI/protocol evidence; record implementation, automation, real environment, platform, and limits. Never persist passwords, private keys, session handles, X11 cookies, or active broadcast state. Use English/zh-CN catalogs, existing actions, shortcuts, lazy loading, cancellation, cleanup, and rollback.

Out of scope: MobApt-compatible runtime, plugin marketplace, Professional Customizer, arbitrary pane counts, broad daemon suite.

| Task | Feature | Gate |
|---|---|---|
| WF-09-01 | SFTP 双栏、拖放与传输队列 | P0 |
| WF-09-02 | 远程文件编辑与冲突保存 | P0 |
| WF-09-03 | 主密码与凭据管理 | P0 |
| WF-09-04 | 安全宏录制与重放 | P1 |
| WF-09-05 | 终端搜索、高亮与日志 | P1 |
| WF-09-06 | 连接诊断工具 | P1 |
| WF-09-07 | XDMCP / 远程 Unix 桌面验证 | Experimental |
| WF-09-08 | Rlogin / RSH 兼容性评估 | Experimental |
| WF-09-09 | Loopback 文件服务与嵌入式服务 | Post-v1 |
