# A15 / WF-08 发布候选验收辅助报告（0.1.17-rc.1，Windows）

- 日期：2026-10-11（+0800）
- 候选：tag `v0.1.17-rc.1` → commit `6e341f0e8ccb457ad53d10efb40e1ca0eb8bdeb9`（PR #49 merge commit）
- 本地基线：`main @ 2d2fe23ca18ff5678d3576ee0a00d7dfb7c02d7f`，与 `origin/main`（GitHub）同步；tag 之后 main 仅 `docs/SECURITY_REVIEW.md` 变更（+13/-1），产品代码与工作流无变化
- 性质：自动化辅助验收 + 维护者人工 GUI 验收记录。自动化 PASS 仅代表可自动验证层面；GUI 结论来自维护者 2026-10-11 的确认（§1.7）；签名、公证、升级、回滚仍按 §5 记录为未验证
- 边界：未修改产品代码、未创建/合并 PR、未触碰 PR #12；按维护者 2026-10-11 指示回填 `A15_EVIDENCE_CURRENT.json`（Windows rc.1 证据，securityCriticalHigh=review）并随本报告提交推送；本地原有 0.1.17（10-05 本地构建）安装已被 rc.1 就地覆盖（见 §3）
- 完整日志：`.trellis/.runtime/a15-rc-2026-10-11/`（运行时目录，不提交；索引见文末）

## 1. 自动化 PASS

### 1.1 发布工作流与版本一致性

- PR #49（feat/unsigned-prerelease）已 MERGED（2026-10-09T12:54:27Z，mergeCommit `6e341f0e`），release.yml 结构核对通过：policy 版本/通道判定 → 三平台 build（stable tag 强制 Authenticode / Developer ID+公证）→ prepare（SHA256SUMS.txt、latest.json、source 包、许可证）→ publish。
- 本地复跑 `release-policy`（`GITHUB_REF=refs/tags/v0.1.17-rc.1`）：`{"version":"0.1.17-rc.1","tag":"v0.1.17-rc.1","publish":true,"prerelease":true,"platformSigning":false,"draft":true,"makeLatest":"false"}`。
- 版本一致性：`package.json` / `src-tauri/tauri.conf.json` / `src-tauri/Cargo.toml` / tag / Release 名 / `latest.json.version` / 安装后 PE ProductVersion 全部为 `0.1.17-rc.1`。
- Release workflow run `37933368276`（push tag v0.1.17-rc.1）：policy、build linux-x64、build macos-arm64、build windows-x64、prepare、publish 全部 success。
- CI run `37933143667`（6e341f0，tag 提交）：Frontend / Security / License / Rust×3 / fixtures 全部 success（package-windows 按设计 skipped）。
- CI run `38028097806`（main@2d2fe23，当前 main）：success。
- Release 当前状态：非草稿 Pre-release，published 2026-10-09T12:56:27Z，`make_latest=false`（`/releases/latest` 解析不含它，见 §2.2），共 24 个资产。

### 1.2 产物下载与 SHA256（Windows）

下载文件与 `SHA256SUMS.txt` 全部核对通过（`sha256sum -c` OK，并用独立 `sha256sum` 复算一致）：

| 产物 | 文件 | 大小(字节) | SHA256 | 校验 |
| --- | --- | --- | --- | --- |
| Windows 安装包 | `NexaTerm_0.1.17-rc.1_x64-setup-windows-x64.exe` | 17,506,215 | `acee2c7d543b0f0a7314e4313a2be098c8d2b016a229f1374c98a55af381741b` | OK |
| Portable ZIP | `NexaTerm-portable-windows-x64.zip` | 29,428,009 | `0655f4502403ebbc35be59bc44b763d2091be25be35a3904fba01c9253bcbea2` | OK |
| updater 元数据 | `latest.json` | 1,977 | `3f22fb95667e163f1ea5e05b2d7245935171eb1072a02654631898d3bc7eb1d2` | OK |

### 1.3 updater 签名配置（密码学验证）

- 配置：`tauri.conf.json` → `plugins.updater.pubkey`（minisign keyId `27655F1FD82345C6`），endpoint `https://github.com/DenisZheng/NexaTerm/releases/latest/download/latest.json`，windows installMode `passive`。
- 用配置中的 pubkey 对 `.sig` 做 Ed25519（BLAKE2b-512 prehash）验证：**Windows 安装包 VALID、macOS `NexaTerm-macos-arm64.app.tar.gz` VALID**；Linux AppImage `.sig` keyId 匹配（产物未下载，未做完整密码学验证）。
- `latest.json` 三平台 signature 与各自 `.sig` 文件内容逐字一致；三平台 updater 产物（exe / app.tar.gz / AppImage）均带非空 `.sig`。
- 说明：updater 签名有效 ≠ Windows/macOS 平台签名（后者为 BLOCKED，见 §5）。

### 1.4 许可证与 third-party notices

- 本地 `license-inventory` 检查通过：210 npm + 710 Cargo 包，0 项策略问题。
- 本地生成的 `THIRD_PARTY_LICENSES.generated.md` 与 Release 资产 `THIRD_PARTY_LICENSES-windows-x64.generated.md` **逐字节一致**；`license-inventory.json` 除 `generated_at` 时间戳外一致。
- Release 资产包含 `LICENSE`、`THIRD_PARTY_LICENSES.md` 及三平台 generated md / inventory json；portable ZIP 内也含两份许可证文件。

### 1.5 本机自动化测试套件（36 步，33 PASS）

对齐 CI frontend job 并加定向测试；33 项 PASS（3 项 FAIL 均为同一组 locale 断言，见 §2.1）：

- 通过项：pnpm install --frozen-lockfile、line-budget、`pnpm run check`（tsc）、`pnpm run build`（tsc && vite build）、`test:scripts`（含 release-policy、release-signing-source、mobaxterm-import-source、a15-evidence-check、prepare-tauri-signing-key 等脚本测试）、tauri-capabilities、tauri-csp、startup-boundary、i18n-new-entry、workspace-snapshot、wf02a/02b、wf03、wf04b（批量/Split）、wf04c（MultiExec）、wf05a/05b/05c、wf06a/06b/06c、wf07（workspace restore 契约）、wf08a/08b（迁移基线/跨品牌）/08c/08d/08e、`test:release`、licenses、mobaxterm-vitest、i18n-vitest、workspace split/multiExec/restore 定向 vitest（13/15 文件通过）、prerelease-policy-tests（16/16）、a15-evidence-check（--allow-pending）。
- Rust：`cargo test --workspace --locked` **424 通过 / 0 失败**（404 lib + 19 + 1；warning 为既有 unused import，无 error）。
- MobaXterm 多 Session / 逐行用户名：Rust 11 项全过，含 `mixed_users_can_be_imported_in_one_batch_with_row_specific_usernames`、`empty_row_username_cannot_fall_back_or_partially_import`、`missing_ssh_username_is_reported_as_user_input_not_parse_failure`、`cp1252_session_names_are_decoded`、`import_rejects_file_changed_after_preview`、`row_override_rechecks_exact_duplicate_and_never_overwrites_same_name` 等；前端 `mobaxtermImportModel.test.ts` 与脚本源码契约测试同步通过。
- English / zh-CN 字典一致性：`i18n.test.ts`（键集合一致 + resolveLocale/translate 行为）PASS；actionbar 字典由 `actionPresentation.test.ts` 与 `workspace-chrome-layout-source.test.mjs` 覆盖并通过。
- 10 SSH / Split / MultiExec / workspace restore 的**可执行层**：split（3 文件）、multiExec（5 文件）、restore（7 文件）vitest 与全部相关源码契约检查通过；真实 10 SSH GUI 工作负载无法自动执行（见 §3）。
- A15 证据契约：`check:wf08e` PASS；`a15-evidence-check --allow-pending` 输出 `eligible:false, declared:pending, validSignoff:false`；回填前 44 项 blocker（22 pending + 22 blocked），回填 Windows rc.1 证据后 35 项（12 pending + 22 blocked + 1 review，见 §5）——契约仍拒绝提前签字。

### 1.6 本机安装与启动（Windows 11 10.0.26300 x64）

- 静默安装 `setup.exe /S`：**exit 0**；卸载注册项 DisplayVersion `0.1.17-rc.1`；桌面/开始菜单快捷方式已刷新；PE ProductVersion/FileVersion `0.1.17-rc.1`。
- 安装版主程序 36,647,424 字节，SHA256 `A1B7340AB4D3D190B1278928FA7DEA18476E5A36E349C9100285C1C5F074C656`；portable 主程序同尺寸，SHA256 `B5C4EF10BCF3DDA485BDB665CE5049D6F209FFE694098DA7B14B041524CB3CA0`；两者逐字节对比**仅差 3 字节**（偏移 28704883–28704885，NSIS bundle type `NSS` vs `UNK`），即同一构建。
- 两侧 `nexaterm-mcp.exe`（10,104,832 字节，`16A569E9…4672`）与 `mxterm-mcp.exe`（10,126,848 字节，`321A66B4…4761`）哈希完全一致。
- 启动安装版：进程正常（PID 6620，窗口标题 `NexaTerm`，Responding=True，36 个 msedgewebview2 子进程），`CloseMainWindow` 后进程全部退出（0 残留）。
- 启动 portable 版：进程正常（PID 22240，窗口标题 `NexaTerm`，Responding=True），关闭后 0 残留；portable 目录内未新增文件；两个实例启动后 `%APPDATA%\com.nexaterm.app` 时间戳更新（正常写入），旧数据目录未被修改。
- Authenticode：安装包与安装后主程序均 `NotSigned`（预发布通道按设计无平台签名，非验收通过项）。

### 1.7 人工 GUI 验收（维护者确认，2026-10-11）

维护者在本机 Windows 11 对 rc.1 Windows 产物完成人工验收并确认通过（原话：“人工验收也过了”）。以下 PASS 均为维护者确认，助手未独立观察 GUI：

| 项目 | 状态 |
| --- | --- |
| 安装 | PASS（静默安装 exit 0 + 维护者确认） |
| 启动 | PASS（进程/窗口验证 + 维护者确认） |
| 品牌 | PASS（维护者确认） |
| English（含第一轮残留问题复验） | PASS（维护者确认） |
| 简体中文 | PASS（维护者确认） |
| Light | PASS（维护者确认） |
| Dark | PASS（维护者确认） |
| 布局与交互观感 | PASS（维护者确认） |

本次确认不覆盖 10 SSH 工作负载、性能采样、升级/回滚、平台签名与公证，这些项目保持 §3 / §5 的状态。

## 2. 自动化 FAIL

### 2.1 本地 vitest 7 项失败 —— 系统语言（zh-CN）环境相关

- 失败：`pnpm test` 共 610 项中 7 失败 / 602 通过 / 1 todo。4 个文件：`connectionDialogSubmit.test.ts`（3）、`a14RestartAcceptance.test.ts`（2）、`shellHydration.test.ts`（1）、`tunnelRuleConnectionState.test.ts`（1）。
- 现象：断言英文文案（如 "Save and connect"、"no longer exists"、"automatic reconnect is disabled"），实际返回中文（"连接失败"、"保存的连接或终端配置已不存在…"等）。
- 根因（已核实）：本机 Node 24 的 `navigator.language = "zh-CN"` → i18n `resolveLocale("system", …)` 解析为 zh-CN → `t()` 返回中文；这些测试断言英文常量。CI（Ubuntu 英文环境）同一提交 `37933143667` Frontend checks success，故**非 RC 回归，属测试对系统语言敏感**。
- 处置建议（需维护者决定，本次未改代码）：为受影响测试固定 locale（如测试内显式注入 en），或放宽为断言键而非文案。

### 2.2 updater 端点 `releases/latest/download/latest.json` 当前 404

- 检查结果：`https://github.com/DenisZheng/NexaTerm/releases/latest/download/latest.json` → **HTTP 404**；tag 固定地址 `…/releases/download/v0.1.17-rc.1/latest.json` → 200，内容与签名均有效。
- 原因：仓库当前只有 Pre-release（policy `make_latest=false`），GitHub `/releases/latest` 不解析到预发布。
- 关联事实：Release 说明（`docs/PRERELEASE_NOTES.md`）已明确写入“尚无正式 Release 时，应用内检查更新可能暂不可用”，故此项**可能是已声明的预期状态**；但 rc.1 内置的更新检查在出现 stable release 前确实不可用，updater 升级验收相应保持 BLOCKED（§5）。需维护者确认该端点策略是否满足预期（例如后续为预发布通道使用 tag 固定端点）。

## 3. 无法自动判断 / 需要维护者肉眼确认（MANUAL_REQUIRED）

- **GUI 验收**：已由维护者于 2026-10-11 确认通过，详见 §1.7（本会话无 GUI 控制/截图能力，自动化部分只验证进程与窗口存在）。
- **交互式安装提示**：本次用 `/S` 静默安装，未单独记录 SmartScreen / “未知发布者”提示；预发布无 Authenticode，出现该类提示属预期，不计入验收项。
- **10 SSH + Split/SFTP/Transfer/Monitoring、资源释放、失败隔离、性能采样**（`tests/performance/wf08d-workload.json`）：需真实 SSH 目标 + GUI 驱动。本机 fixture 未运行（WSL Ubuntu-24.04 stopped；端口 2222/2223/2224/2323 关闭；docker 不在 PATH），且无 GUI 自动化，无法执行。
- **portable ZIP 内容卫生**：ZIP 共 2707 条目、解压后约 79 MB，其中约 21 MB 为构建残留（`nexaterm.pdb` 15 MB、`mxterm_mcp.pdb` 6 MB、`.d`、`.fingerprint/` 2688 项、`nsis/` staging、`.cargo-*.lock`），且 zip 条目使用反斜杠路径分隔符（部分非 Windows 解压工具兼容性）。功能不受影响；维护者已于 2026-10-11 要求精简该残留，作为后续构建脚本任务处理。
- **公开 Release 说明**：正文写明“Windows/macOS 安装与基本功能验收结果须在公开草稿前补充到本页”，当前尚未补充；是否引用本报告结论更新由维护者决定。
- **本机安装状态变更**：原有 0.1.17（10-05 本地构建）安装已被 rc.1 就地覆盖，安装目录 `_up_` 保留 10/5 旧内容；如需恢复旧版需重新安装。

- **安全审计登记（回填证据时发现）**：RC 提交 `6e341f0e` 的 CI 安全产物显示 npm 新增 1 项 dev-only High（`GHSA-68fv-2mgg-jv7q`，source-map-js，经 vite/postcss 与 jsdom 构建/测试链引入，不进发布产物），尚未登记进 `docs/SECURITY_REVIEW.md`；Rust 8 项 cargo-deny advisory（含 `RUSTSEC-2023-0071`）均已在该文档 §7/§7.1 登记接受。按“未修复 High 不得进入 release gate”口径，已把 A15 证据 `automated.securityCriticalHigh` 由 pass 改为 review，待维护者评审后登记接受或升级依赖。

## 4. 安装包信息和 SHA256（汇总）

- commit：`6e341f0e8ccb457ad53d10efb40e1ca0eb8bdeb9`（tag `v0.1.17-rc.1`，PR #49 merge）；构建来源 run `37933368276`
- 版本号：`0.1.17-rc.1`（package.json / tauri.conf.json / Cargo.toml / tag / Release / PE 版本一致）

| 对象 | 文件 / 路径 | 大小(字节) | SHA256 |
| --- | --- | --- | --- |
| 安装包 | `NexaTerm_0.1.17-rc.1_x64-setup-windows-x64.exe` | 17,506,215 | `acee2c7d543b0f0a7314e4313a2be098c8d2b016a229f1374c98a55af381741b` |
| Portable ZIP | `NexaTerm-portable-windows-x64.zip` | 29,428,009 | `0655f4502403ebbc35be59bc44b763d2091be25be35a3904fba01c9253bcbea2` |
| updater 元数据 | `latest.json` | 1,977 | `3f22fb95667e163f1ea5e05b2d7245935171eb1072a02654631898d3bc7eb1d2` |
| 安装后主程序 | `%LOCALAPPDATA%\NexaTerm\nexaterm.exe` | 36,647,424 | `A1B7340AB4D3D190B1278928FA7DEA18476E5A36E349C9100285C1C5F074C656` |
| portable 主程序 | `…\portable\nexaterm.exe` | 36,647,424 | `B5C4EF10BCF3DDA485BDB665CE5049D6F209FFE694098DA7B14B041524CB3CA0` |
| sidecar（两侧一致） | `nexaterm-mcp.exe` | 10,104,832 | `16A569E970B1CD8B85FE8B5CF4EA81399163560D7482113B6A4E55C10FDB4672` |
| sidecar（两侧一致） | `mxterm-mcp.exe` | 10,126,848 | `321A66B455F28777EDCED07E1923E6519A547382AFD6AD3783A0C38B2BA14761` |

- 校验结果：前三项与 `SHA256SUMS.txt` 及独立复算一致（OK）；安装/portable 主程序仅 3 字节 bundle type 差异；sidecar 完全一致。
- 签名状态：Authenticode `NotSigned`（预期）；updater minisign 签名 VALID（§1.3）。
- 下载留档：`.trellis/.runtime/a15-rc-2026-10-11/downloads/`

## 5. 当前仍未验证的签名、公证、升级、回滚项目

| 项目 | 状态 | 说明 |
| --- | --- | --- |
| Windows Authenticode | BLOCKED | 无签名证书；预发布通道按设计不签名 |
| macOS Developer ID / notarization+staple | BLOCKED | 无 Apple 开发者账号与机器；CI 仅构建产物 |
| Linux 真实桌面安装/启动 | BLOCKED | 无 Linux 机器（CI 构建通过不替代） |
| mXterm → NexaTerm 迁移（core app data / webview settings / vault / no-silent-overwrite / migration rollback） | BLOCKED | 无旧版安装包与真实旧数据；本机未发现旧数据目录，未执行任何迁移 |
| 历史版本升级 / 回滚 | BLOCKED | 无历史正式版本可比；本次仅“本地 0.1.17 就地覆盖安装 rc.1”，不构成升级验收 |
| updater 升级 / rollback-recovery | BLOCKED | 端点 404（§2.2）+ 无旧版安装；updater 元数据本身签名有效 |
| 打包版性能（startup / idle CPU / 内存对比 mXterm / 10 SSH / 资源释放 / 失败隔离） | MANUAL_REQUIRED | 需 GUI + 真实 SSH + mXterm 基线 |
| A15 最终签字 | PENDING | `A15_EVIDENCE_CURRENT.json` 已回填 rc.1 候选与 Windows 证据（build/install/launch/brand/locale/theme/artifactHash=pass；securityCriticalHigh=review），剩余 35 项 blocker（12 pending + 22 blocked + 1 review），`check:wf08e` PASS，`validSignoff:false` |

## 证据日志索引（`.trellis/.runtime/a15-rc-2026-10-11/`）

- `logs/frontend-checks-summary.txt` 及逐步 `*.log`（00–35，含 05 vitest 全量、23/33 定向）
- `logs/cargo-test.log`（Rust 424 项）、`logs/windows-install.log`、`logs/windows-launch.log`、`logs/portable-zip-listing.log`
- `downloads/`（安装包、portable ZIP、SHA256SUMS.txt、latest.json、.sig、许可证文件）、`portable/`（解包产物）、`licenses/`（本地生成）、`release-policy.out`
- `verify-minisign.mjs`（updater 签名验证工具，运行时辅助脚本）
