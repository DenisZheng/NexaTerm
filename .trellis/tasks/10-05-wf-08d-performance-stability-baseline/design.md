# WF-08D Design

## Startup measurement

Rust `PerformanceProbeState` 在 Tauri Builder 建立时记录单调时钟。主 WorkspaceShell 首次挂载时调用一次 `performance_probe_mark_interactive`。

只有设置：

- `NEXATERM_PERF_EVIDENCE_PATH`
- 可选 `NEXATERM_PERF_RUN_ID`

时才写 JSONL。正常用户运行不写性能文件、不打日志。

该事件定义为 `workspace-interactive`：工作区 React 组件已挂载，适合作为同版本回归指标；它不是 OS 从双击到第一帧的绝对物理时间，因此真实报告必须说明定义。

## Runtime sampler

`scripts/perf-runtime-sampler.mjs`：

- 启动指定 NexaTerm 打包版 executable；
- Windows 用 PowerShell/CIM + Get-Process 读取 PID/PPID/RSS/累计 CPU；
- macOS/Linux 用 `ps` 读取 PID/PPID/RSS/累计 CPU；
- 递归汇总根进程与 WebView/child process tree；
- 用相邻样本累计 CPU 差计算 interval CPU；
- warmup 后计算 RSS median/P95/max、CPU average/P95、process count；
- 合并 startup JSONL；
- 如果提供 `--baseline-rss-mb`，应用 1.25 review rule；
- startup > 2000 ms 标记 review；
- 输出 JSON evidence，不把 review 自动解释为产品 fail。

## Workloads

`tests/performance/wf08d-workload.json` 固定：
- 5 次 cold launch；
- 30 秒 idle measurement；
- 10 个独立 SSH instances；
- Split；
- 两个 SFTP/Remote Files；
- upload + download；
- Monitoring；
- 3 轮 close/reopen resource-release；
- 单 session disconnect/reconnect + transfer/monitor failure isolation。

## Existing protections retained

继续执行既有：
- `check-startup-module-boundary-source.mjs`
- lazy TerminalPanel / Settings / Monitor / Files 等 startup boundary
- remote file transfer isolation
- Rust manager lifecycle tests
