# Batch E 双轴审核记录（2026-09-17）

## 范围与方法

- 用户授权：审核并本地提交本轮 Batch E，不推送、不归档 Task 01。
- 固定基线：`55a2cb7963e746dc8426aed93d40679fcccb1cf0`。
- 经用户确认，审核命令为 `git diff --cached 55a2cb7`，不是会遗漏暂存改动的三点比较；`git log 55a2cb7..HEAD --oneline` 在审核开始时为空。
- 初始暂存树：`c90cefbb57235610e9ce350aeb1ff0e00b5f23fe`，19 个文件；后续加入本记录及下述修复。
- Standards 来源：`AGENTS.md`、`.trellis/spec/backend/{quality-guidelines,security-evidence}.md`、共享思考指南及 Fowler smell 启发式（仓库规范优先，不将主观 smell 当作硬错误）。
- Spec 来源：用户确认使用本任务 `prd.md` 的 Batch E 决策、`design.md` §8.1 与 `implement.md`；缺少独立 issue-tracker 配置不伪装成已读取外部 issue。
- 当前工具没有 sub-agent 调度能力，两个轴由同一会话分开审核；不是独立并行评审。

## Standards

### S1 · P2 · 测试子进程污染真实 CI 摘要（已修复）

- 位置：`scripts/security-report.test.mjs` 的历史删除密钥用例；初始暂存树第 141–144 行。
- 规范依据：`.trellis/spec/backend/security-evidence.md` §6 的临时 Git 仓库测试与真实 Actions 摘要归档约定；测试故障证据必须与当前仓库的安全检查证据隔离。
- 初版将整个 `process.env` 传给真实 CLI。Actions 中的 `GITHUB_STEP_SUMMARY` 因此被继承，故意触发的 fixture `FAIL` 被写到真实 job summary。
- 复现：指定临时 summary 文件运行该真实 Gitleaks 用例。测试 exit 0，但 summary 确实增加 `Security: secrets / FAIL / 发现：1`。
- 修复：仅从测试子进程环境移除 `GITHUB_STEP_SUMMARY`；生产 CLI 的报告和摘要逻辑不变。加强用例，断言预置摘要保持原样。
- 没有另列仅属于风格偏好或已由工具覆盖的 Fowler smell。

本轴：1 项 P2，已修复；最严重问题为测试证据污染 CI 摘要，无剩余阻断发现。

## Spec

### R1 · P2 · 合法 npm advisory 被误判为运行故障（已修复）

- 位置：`scripts/security-report.mjs::normalizeNpmAudit`；初始暂存树第 72–77 行。
- 需求：`prd.md` Batch E 明确“依赖审计本阶段仅报告……不因 advisory 让 CI 失败”。
- 初版强制要求非空 GHSA ID 和字符串修复范围。真实 pnpm 11.22.0 的 bulk audit 在无法推断修复范围时省略 `patched_versions`，缺少 GHSA URL 时输出空 `github_advisory_id`；这两种合法结果都被误拒绝。
- 复现：临时目录复制实际 manifest/lockfile，使用 loopback HTTP 模拟 registry，运行真实 `pnpm --registry=<loopback> audit --json`。影响范围 `*` 得到 `invalid_report_field`；不提供 advisory URL 得到 `invalid_npm_advisory`。两次 pnpm exit 均为 1，报告各有一个 high advisory。
- 修复：保留数字 `registryId`；缺 GHSA 时 `id=null`，缺推断修复范围时 `patchedVersions=null`，明确表示未知。两个真实 CLI 场景重跑后均正确归档为 `REVIEW-REQUIRED`，未丢弃发现。

### R2 · P2 · 严重度统计与明细不一致仍被接受（已修复）

- 位置：`scripts/security-report.mjs::normalizeNpmAudit`；初始暂存树第 84–86 行。
- 需求：`prd.md` Batch E 要求“报告缺失/损坏仍须非零退出”；`design.md` §8.1 要求校验机器可读完成信息，不能把异常当作成功报告。
- 初版只检查统计总数与明细是否同时非零。构造 metadata 为 1 low、唯一 advisory 为 high 的报告，仍得到 `REVIEW-REQUIRED`；总数错误同样可漏检。
- 修复：逐严重度核对 advisory 数。不按受影响版本或依赖路径重复计数；加入严重度错位、总数错误和同 advisory 多版本三个断言。
- 本批未扩大到应用依赖升级、Vault、CSP 或 GUI 改动；Task 01 其余验收不是本批已完成项。

本轴：2 项 P2，已修复；最严重问题为合法依赖报告误判导致 CI 阻断，无剩余阻断发现。

## 验证证据

- 先增加定向断言，3 个定向用例全部失败，分别复现 R1、R2、S1；最小修复后全部通过。
- `RUN_SECURITY_INTEGRATION=1` + `node --test scripts/*.test.mjs`：55/55 PASS，0 skipped。真实 Gitleaks 版本为 8.30.1。
- 真实 pnpm 11.22.0 的上述两组 loopback registry 场景：修复前拒绝、修复后均 `REVIEW-REQUIRED`。
- 另做真实 Gitleaks 负向探测：已跟踪文件即使后来列入 `.gitignore`，其 dirty 内容仍被发现（FAIL，1 finding）。
- `pnpm run check`：PASS。
- 重新运行在线 `pnpm run audit:npm` / `pnpm run audit:rust`：采集 exit 0，分别保留 1 low 和 13 条 Rust 发现，均为 `REVIEW-REQUIRED`，没有自动风险接受。
- CI YAML 契约检查：只读权限、完整 checkout、不保留凭据、无 `continue-on-error`、仅三个 JSON artifact、保留 14 天均通过。
- JS 语法与 `git diff --check` 检查通过。审核记录及修复纳入暂存后，`pnpm run check:secrets` 再次 PASS：813 个受跟踪文件、218 个历史提交、0 个未豁免命中；唯一已审核夹具在历史与当前代码各出现一次。

## Bug Analysis：防止同类回归

### 1. Root Cause Category

- S1：D（测试覆盖缺口）/ E（隐含环境假设），未检查继承环境带来的 CI 文件写入副作用。
- R1：B（跨层契约），把一个实际 advisory 的必填字段错误推广到所有 pnpm 报告。
- R2：E（隐含假设），把“双方均非零”误当作统计与明细一致。

### 2. Why Fixes Failed

不适用：先做真实工具/最小输入复现及红灯断言，再做局部修复，没有通过跳过测试、过滤发现或降低门禁规避问题。

### 3. Prevention Mechanisms

| 优先级 | 机制 | 落地 | 状态 |
|---|---|---|---|
| P2 | 测试隔离 | 清除 CLI 子进程摘要环境并断言未改写 | DONE |
| P2 | 契约覆盖 | 可选 GHSA/修复范围、registry ID 回归 | DONE |
| P2 | 运行时一致性 | 严重度计数逐项核对及多版本边界回归 | DONE |

### 4. Systematic Expansion

Rust normalizer 已逐项核对 error/warning 统计；本轮复核没有发现需要一并修改的同类计数问题。生产报告的摘要写入保留在 CLI 边界，测试调用必须隔离该副作用。后续升级 pnpm/cargo-deny 时应验证真实机器报告，而非只更新手写 fixture。

### 5. Knowledge Capture

- [x] 更新 `.trellis/spec/backend/security-evidence.md` 的可选字段、计数与测试摘要隔离契约。
- [x] 同步本任务 `design.md`、`implement.md`、`HANDOFF.md`。
- [x] 保留 Task 01 为 `in_progress`；新增远端 CI、GUI、CSP 与未解决 advisory 不记为通过。

总结：Standards 1 项（最严重：CI 摘要污染，P2），Spec 2 项（最严重：合法 npm 报告误阻断，P2）；3 项均已修复。
