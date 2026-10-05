# WF-08D PRD — 性能、长稳与资源释放基线

## Goal

把 requirements §49 / §50 从“文字目标”变成可重复执行的测量与复核流程：

- 常规现代电脑启动约 2 秒内可交互；
- Idle CPU 接近空闲，不允许无意义高频 polling；
- 同构建模式下 NexaTerm Idle memory 相对 mXterm baseline 增长约 25% 以上必须 review；
- 10 SSH + Split + SFTP + Transfer + Monitoring 同时运行；
- 关闭/重连/失败后 PTY、runner、monitor、transfer、tunnel 等资源正确释放。

## Evidence policy

- CI 只证明 instrumentation、workload、parser、source contract 可用。
- CI 不等于真实桌面性能 PASS。
- 真实 startup / RSS / CPU / 10-session UX 必须在打包版、真实平台上采样。
- CPU 没有需求给出的绝对百分比阈值，因此 08D 不自行发明 hard PASS/fail 数字；记录数值并对周期性 polling 做 review。
- 唯一明确内存 review trigger：同机、同构建模式 NexaTerm / mXterm Idle RSS > 1.25。
- 启动 2000 ms 是 review target，不作为未经 benchmark 校准的绝对失败线。

## Outputs

1. Rust opt-in startup interactive probe。
2. 跨平台主进程 + descendant process-tree RSS/CPU sampler。
3. 10 SSH / resource-release / failure-isolation 固定 workload。
4. CI source gate 和脚本单测。
5. WF-08E 可直接执行的实机证据格式。

## Out of scope

- 不为 CI 调优产品行为。
- 不把 GitHub runner 数值当用户设备性能。
- 不在没有真实 mXterm baseline 时宣称内存 PASS。
- 不在 08D 里完成签名、安装、升级/回滚实证。
