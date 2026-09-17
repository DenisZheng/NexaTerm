# 安全扫描与审计证据契约

## 1. 范围与触发

修改安全脚本、工具版本、扫描规则、依赖审计策略或 `.github/workflows/ci.yml` 的 `security` job 时适用。

- 密钥检测是硬门禁；当前代码与完整 checkout 中所有可达 refs/HEAD 的历史都扫描，包含 merge diff。
- npm/Rust 依赖发现本阶段只报告，输出 `REVIEW-REQUIRED`，不是风险接受或发布批准。
- 工具缺失、网络失败、浅克隆、无效/不完整报告必须非零退出；不能用 `continue-on-error`、空数组或忽略列表伪装通过。
- 不修改 Vault、应用依赖或 CSP；GUI、许可证、`cargo audit` 和发布门禁仍需单独验收。

## 2. 命令与入口

从仓库根目录运行：

```powershell
pnpm run check:secrets
pnpm run audit:npm
pnpm run audit:rust
$env:RUN_SECURITY_INTEGRATION='1'
node --test scripts/security-report.test.mjs
```

- `security-check.mjs <secrets|npm|rust>`：执行、写报告及退出码的唯一入口。
- `security-report.mjs`：机器报告校验和安全字段投影；不得透传子进程的任意 stdout/stderr。
- `security-tools.json`：Gitleaks/cargo-deny 的版本、官方发布资产名和固定 SHA256。更新时同时核验官方发布记录，不使用 `latest` 下载。
- `install-security-tool.ps1 -Tool <gitleaks|cargo-deny> -Destination <临时工具目录>`：仅支持 Windows/Linux x64；SHA256 不符或解压失败立即终止，保留安装包中的许可文件。不安装全局工具，不修改应用 lockfile。
- 环境变量 `GITLEAKS_BIN` / `CARGO_DENY_BIN` 可指定工具绝对路径；否则使用 PATH。版本不符拒绝运行。cargo-deny 还需 `cargo`、正确的 `CARGO_HOME` / `RUSTUP_HOME`。
- Windows 的 pnpm 调用走固定参数的 `invoke-pnpm-audit.ps1`：Node 的 `spawnSync('pnpm.cmd', ..., {shell:false})` 会报 EINVAL，且不能假设 `npm_execpath` 总存在。禁止改成拼接用户输入的 shell 字符串。

## 3. 报告与扫描契约

输出为 `logs/security/{secrets,npm,rust}.json`，`schemaVersion=1`：

- 公共字段：`check`、`collectedAt`、`status`、`context.commit`、`context.trackedChanges`、原始字节的 manifests/lockfiles SHA256、工具版本。
- 成功采集附 `findings`、计数、命令及底层退出码；故障附稳定 `error` 码，不存原始异常消息。
- 密钥报告只含 `rule/file/startLine/endLine/commit/scope`。严禁写 `Secret`、`Match`、源码片段、作者/提交说明，严禁直接上传 Gitleaks 原始报告。
- npm 保留 GHSA ID、严重度、包名、影响/修复范围、实际版本和依赖路径；Rust 保留 RustSec ID、类别、CVSS、crate 版本与来源依赖图，不保留任意 diagnostic message/notes/labels。
- npm 始终保留数字 `registryId`；没有 GHSA URL 时 `id=null`，不能丢弃该 advisory。pnpm 无法从影响范围推断修复范围时省略 `patched_versions`，归档为 `patchedVersions=null`（未知，不表示已修复或确认无修复版本）。这些合法缺省仍应输出 `REVIEW-REQUIRED`。
- npm 各严重度计数必须与对应 advisory 数逐项相等；不是按版本数/依赖路径数计数，也不能只比较“总数是否大于零”。不一致报 `npm_counts_mismatch`。
- 当前代码按 `git ls-files --stage -z` 枚举并复制到临时目录，不扫描未跟踪 `.env`、依赖缓存和构建结果。新文件须先暂存才能进入此范围；已跟踪但未提交的修改会被扫描。
- 拒绝 shallow checkout、冲突 index、submodule 或符号链接导致的不完整范围。Git 历史明确指定 `--all --full-history -m --no-ext-diff --no-textconv`；不自动 fetch 或读取远端私密配置。
- `security-reviewed-fixtures.json` 中的豁免必须同时匹配规则、文件及命中源码行的 SHA256（仅统一 CRLF/LF），且有理由。更换 token/源码即失效；不得按整个目录、任意行号或批量历史 baseline 放行。Gitleaks inline allow 和 `.gitleaksignore` 不作为旁路。
- Rust 先显式 `fetch db` 成功，再 `--workspace --locked --format json check --show-stats advisories`；固定配置覆盖所有 unmaintained/unsound 依赖，不设置 ignore。检查结束的 summary、diagnostic 和退出码必须一致。

## 4. 状态与错误矩阵

| 场景 | JSON 状态 | 包装命令退出码 |
|---|---|---|
| 完整密钥扫描无未豁免命中 | PASS | 0 |
| 密钥命中 | FAIL | 1 |
| 完整依赖报告没有发现 | PASS | 0 |
| 依赖有 advisory/维护状态等发现 | REVIEW-REQUIRED | 0（只代表采集成功） |
| 工具不存在 | ENVIRONMENT-BLOCKED | 1 |
| 版本不符、工具崩溃/超时、联网失败 | FAIL | 1 |
| JSON 缺失/损坏、计数或退出码不一致 | FAIL | 1 |
| 历史不完整/索引冲突/不支持的文件范围 | FAIL | 1 |

Gitleaks 用 `--exit-code 10` 区分命中与工具异常；pnpm audit exit 1 和 cargo-deny exit 1 只有在完整报告通过校验后才允许转为 `REVIEW-REQUIRED`。不能仅凭 exit 1 推断“只是漏洞”。

## 5. 正常、边界与拒绝用例

- 正常：全历史及当前受跟踪文件无密钥；官方审计报告附版本、commit、lockfile hash。
- 边界：测试夹具只在具体源码哈希一致时豁免，并计入 `reviewedFixtures`；依赖有漏洞但报告采集成功，标记待评估而不是已修复。
- 拒绝：密钥曾提交后又删除仍必须被历史扫描发现；浅克隆不能代替完整历史；缺工具或残留旧报告不能产生 PASS。

## 6. 验证要求

- 常规脚本单测覆盖字段脱敏、精确豁免、报告结构/计数/退出码、缺工具和超时；npm 须覆盖合法可选字段缺失、严重度错位、总数错误及同一 advisory 多版本不重复计数。
- `RUN_SECURITY_INTEGRATION=1` 使用真实固定版本 Gitleaks 和临时 Git 仓库，覆盖提交后删除的假密钥、dirty tracked 文件、未跟踪 `.env` 不读取、浅克隆和旧报告覆盖。故意命中只生成在临时仓库，不向项目提交可用 token。
- 测试调用真实 CLI 时必须从子进程环境移除 `GITHUB_STEP_SUMMARY`，并断言预置摘要未被改写；不得把故意触发的 fixture `FAIL` 写入实际 Actions 摘要。生产 CLI 的摘要写入行为保持不变。
- CI 的 Security evidence job 必须安装工具后执行这些集成测试，不能把默认跳过真实工具测试当作完整验收。
- CI 使用完整 checkout、`contents: read`、`persist-credentials: false`；失败后用 `always()` 继续其它独立采集和上传，不使用 `continue-on-error`。
- artifact 仅允许三个 JSON 报告，保留 14 天；不要上传整个 `logs/` 或临时扫描目录。报告状态同步到 Actions step summary。

## 7. 错误与正确做法

错误：捕获 audit 的任何非零退出后返回 `[]`，把“未成功执行”显示成“没有漏洞”；直接上传 scanner 原始报告；为 CI 全绿添加整个 `tests/` 排除项。

正确：先校验报告完成性和退出码，明确区分 `REVIEW-REQUIRED` 与 `FAIL/ENVIRONMENT-BLOCKED`；仅保存白名单字段，对确认为固定测试输入的单个源码指纹留审计理由。

工具来源：
- https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1
- https://github.com/gitleaks/gitleaks/blob/v8.30.1/LICENSE （MIT）
- https://github.com/EmbarkStudios/cargo-deny/releases/tag/0.20.2
