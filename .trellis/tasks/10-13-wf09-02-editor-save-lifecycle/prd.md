# WF-09-02A：远程编辑保存生命周期

用户打开远程 UTF-8 文件，保存期间继续编辑、重复按保存或关闭/重新打开文件时，实际已写入内容与未保存修改始终区分，迟到请求不污染新标签。

继续 09-23 workflow mainline，依据 WS-F01/F05/F08/F09 和已批准 WF-09-02 规划。堆叠在 WF-09-01 / PR #58 @ `83db4bf`（CI #582 SUCCESS）上；真实验收按维护者 2026-10-13 指示后续集中执行。PR #12/#54 与 A15 不变，不自动合并。

## 验收
- W09-02A-01：保存成功只把本次提交的 content 记为 savedContent；在途后续编辑仍 dirty，保留关闭确认。
- W09-02A-02：保存期间重复按钮/快捷键只发一次 write；编辑不解锁写入槽位。
- W09-02A-03：失败/冲突保留最新编辑与旧 savedContent；冲突覆盖必须沿用显式确认。
- W09-02A-04：关闭/重开同路径后，旧 read/write 完成或失败不更新新标签、不弹旧冲突。
- W09-02A-05：reload/discard 不与在途 save 并发；加载或缺 editable metadata 时 Monaco 只读，保存按钮与实际保存使用同一守卫；卸载后迟到回调无 UI 副作用。
- W09-02A-06：从活动 Files pane 取打开文件的连接，不复用其它 pane 的 activeConnection。
- W09-02A-07：source/lazy/type/build/相关与全量测试通过；真实 SFTP/GUI 未验收，按集中清单保留 MANUAL_REQUIRED。

## 切片边界

复用已有 Monaco、remote_file_read/write、mtime/size 冲突检查与未保存确认。此切片不新增 UI 布局、Rust IPC 或持久化格式。另存为属于后续 WF-09-02B，不能把 A 完成写成整个 WF-09-02 完成。
