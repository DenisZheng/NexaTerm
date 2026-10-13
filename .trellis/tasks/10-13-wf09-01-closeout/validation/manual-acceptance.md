# WF-09-01 集中桌面 / SFTP 验收

状态：**MANUAL_REQUIRED**。源码/mock/fixture smoke 不等于真实桌面或 SFTP 验收。

测试分支：`feat/wf09-01-sftp-transfer`，PR #58。测试开始时记录实际 `git rev-parse HEAD`，使用该源码编译的应用，不能把旧 `0.1.17-rc.1` 安装包当作本 PR 的证据。

## 环境和记录

使用专用 SSH 测试账号、空远程目录和独立本地目录；准备小文件、大文件和含子目录的文件夹。记录系统版本、应用 commit、构建命令、连接方式（不含凭据）、文件校验值和截图。不要覆盖日常数据或操作生产服务器。

| ID | 场景与通过条件 | 状态 |
| --- | --- | --- |
| W09-G01 | 本地选择、导航、上一级、刷新；首次读取错误可见；Windows drive/UNC 根不退到无效路径 | MANUAL_REQUIRED |
| W09-G02 | 本地文件和目录拖入远程目标、系统拖放上传；递归内容和校验值正确，出现进度/结果 | MANUAL_REQUIRED |
| W09-G03 | 远程文件和目录拖入本地当前目录/子目录；来源固定，保存到落点，校验值正确 | MANUAL_REQUIRED |
| W09-G04 | 上传/下载同名目标：rename、skip、overwrite；取消冲突不启动传输；预检失败可重试 | MANUAL_REQUIRED |
| W09-G05 | 两个不同连接以及同配置两实例/分屏：切换焦点、延迟选择文件，不串目标或任务 owner | MANUAL_REQUIRED |
| W09-G06 | 并发设为 2：暂停队列不启动新任务、在途继续；取消排队/在途任务，恢复后按限额继续 | MANUAL_REQUIRED |
| W09-G07 | owner 有任务时关闭：取消确认保留全部；确认只取消 owner；同配置 sibling 继续；确认期间完成的任务保留完成 | MANUAL_REQUIRED |
| W09-G08 | 断线失败、重连后重试；关闭 owner 后重试不转到 sibling；临时实例保存后排队任务继续使用新配置 | MANUAL_REQUIRED |
| W09-G09 | English/zh-CN、Light/Dark/system-dark：双栏、错误、冲突、队列按钮及取消确认均可读/可操作 | MANUAL_REQUIRED |

本轮提供“暂停队列”，在途任务不会暂停。字节级断点续传和原生 Explorer/Finder 拖出不属于本轮实现。

## 给本地 Claude Code 的执行说明

继续 9-23 workflow mainline，只验收 WF-09-01 / PR #58。拉取上述分支并记录 commit，按项目 Skill 执行已有 checks 后编译启动桌面应用。按 W09-G01–G09 集中运行，用隔离目录记录每项命令、目标、校验值、截图与结果。缺真实 SSH、另一平台或 GUI 判断时保持 MANUAL_REQUIRED/BLOCKED。源码测试不能替代产品运行结果。结果写入本任务 validation 目录；不修改 A15 或 PR #12/#54，不自动合并、打 tag 或发布。发现问题先报告，修复使用本任务分支并重新验证。

## 结果模板

```text
WF-09-01 集中验收
Commit：
系统 / 构建方式：
测试环境（不含凭据）：
W09-G01：PASS / FAIL / BLOCKED
W09-G02：PASS / FAIL / BLOCKED
W09-G03：PASS / FAIL / BLOCKED
W09-G04：PASS / FAIL / BLOCKED
W09-G05：PASS / FAIL / BLOCKED
W09-G06：PASS / FAIL / BLOCKED
W09-G07：PASS / FAIL / BLOCKED
W09-G08：PASS / FAIL / BLOCKED
W09-G09：PASS / FAIL / BLOCKED
问题与证据路径：
```
