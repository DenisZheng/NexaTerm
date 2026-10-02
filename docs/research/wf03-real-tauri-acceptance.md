# WF-03 真实 Tauri 验收记录

日期：2026-10-02。沿用主线任务 `09-23-nexaterm-workflow-mainline` 和子任务 `10-01-wf-03-files-daily-flow`。

## 环境与证据边界

- 分支：`feat/wf03a-left-files-view`；修复基线：`87ca9f4194463bb1fbb484c41004d6cde9bf0d8f`。
- macOS 27.0.1，当前源码运行 `pnpm run tauri:dev`，真实桌面 Tauri 应用。电脑操作工具不能识别该开发程序，GUI 步骤由用户操作并反馈；未使用浏览器 preview 替代。
- 基线 [CI #195](https://github.com/DenisZheng/NexaTerm/actions/runs/36877823332) 成功，仅覆盖上述提交；本次修复的 CI 以包含修复提交的后续运行结果为准。
- 用户明确不用容器，授权沿用现有 SSH profile 和专用验收目录。远端为 ImmortalWrt，目录 `/root/nexaterm-wf03/acceptance-20261002`；用户回报 `FIXTURE_READY=YES`。
- 初始文件包括 `pane-a/A-1.txt`～`A-80.txt`、`pane-b/B-1.txt`～`B-80.txt` 和 33 字节的 `editor-conflict.txt`（`version=1`、`origin=wf03-acceptance`）。
- 本机保险库启动阻塞已解除，独立证据见 [启动恢复记录](./wf03-vault-startup-gate.md)。

## A05：PASS（用户实际操作确认）

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| 同 profile 两实例目录隔离 | PASS | 同一保存 profile 的两个独立 SSH 实例分别进入 pane-a、pane-b |
| 快速 A/B focus 切换 | PASS | 按至少连续 16 次切换的步骤验收，用户确认 A/B 都正确 |
| Files 跟随当前 pane | PASS | 每个实例分别启用跟随；A 显示 A 文件，B 显示 B 文件 |
| sibling context 不串 | PASS | 两个实例分别保留目录，焦点切换未互相覆盖 |
| disconnect 不借 sibling Files | PASS | A 执行 exit，B 保持连接；用户确认断线隔离通过 |
| reconnect 保持逻辑 owner | PASS | A 原 pane 按 Enter 重连，A 改到验收根目录，B 保持 pane-b；用户确认通过 |

人工反馈依次为“OK了，A/B都正确”和对断线/原 pane 重连/目录跟随步骤的“通过”。GUI 没有稳定制造网络延迟逆序响应；该竞态由已有自动化强制覆盖，不宣称有人工网络竞态证据。未向终端发送隐藏 pwd 或其它探测命令。

## A06：PASS（真实缺陷修复后由用户复验）

### 复现、实际结果与根因

1. 从左侧 Files 打开 `editor-conflict.txt`，实际提示“远程文件信息读取失败。”，未进入编辑器；预期打开 Monaco 并显示初始内容。
2. 远端 `ls -l` 确认文件为 `-rw-------`、33 字节；`wc -c` 返回 33。
3. GNU `stat -c %Y`、BSD `stat -f %m` 均报命令不存在，`busybox stat -c %Y` 报 applet 不存在，均退出 127。
4. Files 下载显示“100% 完成”；`success` 的现有中文标签就是“完成”。本机下载文件为 33 字节，mtime 09:05:35，内容与初始 fixture 逐字节一致，确认 SFTP 下载真实落盘。
5. 调用链为 `RemoteFileManager::read_file → metadata → build_remote_metadata_command`。读取正文前，mtime shell 探测以 exit 4 失败，映射为 `remote_file_metadata_failed`。根因是编辑元数据依赖远端 stat；不是文件不存在或 pane owner 串线。可通过缺少 stat 的真实 shell 稳定复现。

### 修复与验证

- `remote_files/metadata.rs` 仅在上述 exit 4 时通过现有 SFTP 连接能力读取属性。必须有普通文件类型和真实 size/mtime；缺字段报错，不用零值假装成功。沿用凭据、跳板机与 Host Key 校验，并关闭临时 SFTP 会话。
- `check_write_version` 保持 mtime 或 size 任一变化即冲突，只有明确 overwrite 才绕过版本比较。
- 编辑保存使用刚读取的文件 mode，使无 stat 环境仍保留 `600`。内容走 stdin，同目录临时文件后替换；chmod 失败不覆盖原文件。
- `cargo test --manifest-path src-tauri/Cargo.toml --locked --offline --lib remote_files`：35/35 通过，含 11 项新回归。覆盖真实 shell 缺 stat、严格字段校验、回退分支、错误传播、mtime/size 冲突、明确 overwrite、权限保留和失败清理。
- `node scripts/check-remote-file-editor-source.mjs`、`node scripts/check-wf03-left-files-source.mjs`、`node scripts/check-line-budget.mjs`：通过。预算文件未修改。
- Tauri watcher 已完成修复后的 Rust 编译并重新运行。用户重新连接并打开原文件后确认“能打开，内容正确”；随后确认冲突提示与三个按钮出现、取消和重新加载“两项都正确”，对 dirty close 三步验收回复“正常”。
- 属性弹窗/悬浮信息使用独立的 `entry_metadata`，仍依赖 stat，不属于本次已修复或已通过范围。未安装远端软件、改变 UI 文案或扩展 SFTP 架构。

| A06 项目 | 当前状态 |
| --- | --- |
| 修复后能打开测试文件 | PASS：用户确认内容正确 |
| mtime/size 冲突触发 | PASS：本地增加 local-edit=1 后，由外部 SSH 改写同文件；保存时出现冲突 |
| 未静默覆盖 | PASS：取消后本地修改保留，外部 SSH cat 确认远端仍为 version=2 |
| 重新加载 / 覆盖保存 / 取消入口 | PASS：用户确认提示和三个按钮均出现 |
| 至少一个冲突处理路径 | PASS：取消后不写远端；再次保存并重新加载后显示 version=2，用户确认两项都正确 |
| dirty close 提示 | PASS：增加 dirty-close=1 后关闭文件，明确提示丢弃修改 |
| dirty close 取消后内容保留 | PASS：取消后编辑器和 dirty-close=1 均保留 |
| 明确放弃后正常关闭，SSH / Files 不受影响 | PASS：再次关闭并放弃后正常，用户确认三步验收结果 |

“覆盖保存”已确认入口存在，实际 GUI 处理路径为取消与重新加载；显式 overwrite 的版本检查逻辑由 Rust 回归测试覆盖，未将它写成已执行的人工覆盖保存。

## 剩余边界

- WS-F03、WS-F09 仍待产品确认，未改变默认策略。
- 不 merge PR #24/#25，不开始 WF-04。不因记录勾选单独创建提交。
- 没有启动容器，无 Docker fixture 需要 down；用户已确认专用远端目录 `/root/nexaterm-wf03/acceptance-20261002` 清理完成。下载测试文件属于本次下载产物。
- 当前结论：WF-03 工程范围内的 A05/A06 真实 Tauri GUI 验收已完成；新修复提交后的 CI 仍需单独核对，WS-F03/WS-F09 不因验收通过变成已批准。
