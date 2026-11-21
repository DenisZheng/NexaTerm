# 主线第一批整合记录（2026-11-21）

## 范围与基线

维护者在非主线分支评估后授权合并、提交并推送第一批修复。本轮不新建 Trellis 任务，不发版，不删除分支，不签署产品验收。

- 实际远端只有 GitHub `origin`，默认主线为 `origin/main`；整合前本地 `main` 与远端均为 `2d2fe23ca18ff5678d3576ee0a00d7dfb7c02d7f`。
- 项目规则中的 Gitee `origin/master` / GitHub `github/main` 与当前配置不一致；已向维护者说明并按现有 `origin/main` 授权执行，未修改远端配置或猜测地址。
- 使用 merge commit 保留 PR head 的祖先关系，不 squash、不 rebase、不强制推送。

### 主线保护规则与提交路线

本机完成整合后尝试推送 `main`，远端以 `GH013` 拒绝，未修改远端主线。随后查询实际 branch rules：必须通过 PR，且 Frontend checks、Rust 三平台、Test fixtures smoke、Security evidence、License compliance 共 7 项检查必须通过；不能只查询旧 branch protection 接口就认为主线不受保护。

因此使用必要的专用分支 `merge/main-maintenance-20261121` 提交同一批整合内容，以 PR 合入 `main`，不使用 admin bypass、不更改 ruleset、不 force push。该分支仅用于这次保护规则要求的整合，不作为新的日常开发主线；本轮不自动删除它。

| 顺序 | PR / 内容 | 原分支 head | 主线 merge commit |
| --- | --- | --- | --- |
| 1 | #57 source-map-js advisory 修复 | `e4f76d88360fbf4681145436f3356f2963659561` | `5651e9b` |
| 2 | #56 四个英文断言测试固定 locale | `1205daf6f96f05c06060c8378ac634fac55b3646` | `c60a0f3` |
| 3 | #55 Windows portable ZIP 白名单 | `3fce37c8eee4e865fc979f0319743a111faa9a86` | `624af99` |
| 4 | #54 历史 rc.1 Windows 验收证据 | `9c6deeaec6591afa0f7fb02f8c39e66cef7a501f` | `0f7755a` |

两次实际冲突均仅涉及 `.trellis/tasks/09-23-nexaterm-workflow-mainline/task.json` 的 `children` 列表；核对双方其它字段一致后保留已有任务及三个新增 child，不使用整文件 ours/theirs。父任务的产品状态没有改变。

## 本机联合验证

Windows 11、Node `24.12.0`、pnpm `11.22.0`，Node 系统语言 `zh-CN`。切回主线后重新执行 frozen install，不沿用开发栈依赖作为验证依据。

- `pnpm install --frozen-lockfile`、`pnpm run check`、`pnpm run build` 通过；TerminalPanel、SettingsView、RemoteFilePanel、DockerToolPanel、noVNC / Monaco 仍为独立按需 chunk。构建存在既有大 chunk 提示，不调整预算掩盖提示。
- `pnpm test`：79 个文件通过，609 项通过、1 项既有 todo、0 失败。
- `pnpm run test:scripts`：125 项通过、3 项真实工具测试默认跳过、0 失败；安装固定版本 Gitleaks 后单独以 `RUN_SECURITY_INTEGRATION=1` 重跑安全测试，13 项全部通过、0 跳过。
- CI frontend 的 22 项静态门禁及 startup module boundary 通过；三个修复任务的 context manifest 校验通过，原有示例占位仍为 0 条实际上下文记录，未伪称已补全。
- A15 checker 使用 `--allow-pending`：`eligible=false`、`declared=pending`、`validSignoff=false`，剩余 31 项 blocker（8 pending、22 blocked、1 review）。这是未完成证据契约的正确拒绝，不是 A15 通过。
- 本轮不修改 Rust；三平台 Rust、协议 fixtures 与许可证的联合结果必须由推送后同一 HEAD 的 CI 验证。旧 PR 的独立检查不能代替联合版本结果；本轮未重新运行安装包、GUI 或升级/回滚验收。

## 全历史扫描的整合补项

主线安全策略扫描所有可达 refs，而不仅是当前 main。首次真实 Gitleaks 扫描出现 5 项历史命中，均位于本轮未合并的开发栈；当前 main 工作树没有新增凭据命中。

逐项读取原提交并核对规则、文件、完整命中片段的 SHA256，全部匹配开发分支已有审查记录：两个固定合成认证测试片段、一条无凭据值的测试说明、两个公开文件的校验哈希。对应既有审查提交为 `d9b82f9`、`fc7d1ad`、`bfbd225`。

因此只同步 `scripts/security-reviewed-fixtures.json` 中这 5 条精确记录，未合入对应产品代码，也未修改扫描规则、扫描范围、工具版本、目录忽略或依赖风险接受策略。重新扫描完整历史及 tracked snapshot：`PASS`，未审查命中为 0。规则、文件或源码字节变化仍使记录失效。

## 当前依赖审计与发布边界

2026-11-21 的 npm registry 报告与 GitHub advisory API 已重新核对，不能沿用 10 月的 High=0 记录。

| 当前同日审计对象 | Low | Moderate | High | Critical |
| --- | ---: | ---: | ---: | ---: |
| 整合前 main 的原始 lockfile | 7 | 9 | 6 | 0 |
| 整合后 frozen lockfile | 7 | 9 | 5 | 0 |

两份 advisory 集合比较：本轮没有引入新的发现，消除的唯一项为 source-map-js `GHSA-68fv-2mgg-jv7q`。剩余 5 条 High 于 2026-10-20 至 2026-10-27 发布，均为 dev 依赖路径：

- Vite `7.3.5`：`GHSA-587h-7wmj-h5pm`，报告修复范围 `>=7.3.7`。
- jsdom 引入的 Undici `7.29.1`：`GHSA-xjj6-f33q-929c`、`GHSA-4w7w-5xrc-9h26`、`GHSA-2m5v-pch6-74hx`、`GHSA-qrxm-fqhp-jwvm`，报告修复范围 `>=7.30.1`。

这些是后续独立依赖修复候选，不是已接受风险。本轮不顺手升级依赖或放宽发布门禁。安全证据 job 的依赖报告按既有策略可以成功采集并标记 `REVIEW-REQUIRED`，不等于安全验收通过。旧 `v0.1.17-rc.1` 的 A15 证据保持原候选、原 review 与 pending 状态，不追溯改写。

## 后续交接

- 本轮只收口 #54–#57。#58–#65 核心 WF-09 留下一批，先明确栈顶与真实 Files / 编辑器、凭据 / 宏、终端 / 诊断、loopback 验收边界；开发整合与产品验收是两项决策。
- #66–#89 扩展栈保留。#89 `9d0d5cb` 的原生构建检查因固定 binutils 身份与安装版本漂移失败；不得改 pin 字符串或放宽 gate 来伪造成功。其 XDMCP 人工 PASS 不替代原生构建与发行验收。
- XDMCP 的三桌面人工 PASS、正式随包 X server 与跨平台产品化暂缓、回核心工作流的决定，保留在 `origin/build/wf09-07-resource-audit` 的 `.trellis/tasks/09-23-wf-00b-close-lifecycle/handoff-2026-11-21.md`；该开发交接尚未进入本轮 main，不要以 main 找不到文件为由丢弃已完成工作或恢复旧排期。
- #51 一次性 QA 明确不合；#12 Linux IME 暂缓；#53 仅旧规划，不能覆盖后续路线图。历史已整合分支不重复合并，本轮不删除或归档其它任务。
- 原有未跟踪的 Windows 构建任务、pnpm helper、Python 缓存与 binaries 保留，不纳入本轮提交；未跟踪文件不属于本轮交付。

本记录描述本机整合与验证，不预先宣称远端推送或联合 CI 成功。接续时核对 `main` 与 `origin/main` 的 SHA、#54–#57 的 PR 状态，并查询同一 main HEAD 的 CI；不以旧 run 代替。

完整本机日志、同日基线审计对照、官方 advisory 查询及原有文件校验快照位于忽略目录 `.trellis/.runtime/main-integration-20261121/`；全分支评估原始材料位于 `.trellis/.runtime/branch-integration-review-20261121/`，不提交原始扫描材料。
