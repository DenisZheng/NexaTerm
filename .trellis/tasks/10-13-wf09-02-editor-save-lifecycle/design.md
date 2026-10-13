# 设计

保留既有远程编辑 tabs 状态与 Monaco 边界。setter 同步维护最新 tabs ref，避免同事件内操作读取旧 render 闭包。纯状态 helper 区分提交内容和最新编辑；异步 operation ledger 只持 token/类型，不能成为第二套文件内容状态。

每个 tab 的 read/save 获取 operation token；save 不可重入，read 不与 save 竞态。读请求替换旧 read；关闭、连接级清理和组件卸载使 token 失效。完成/失败先检 token，旧回调不能设置状态、弹冲突或刷新目录。失效不表示后端 I/O 已取消。

save 请求捕获 content、path、connection 与 expected metadata。成功应用 metadata 并保存 captured content；dirty 使用 current content 比较，后续修改保留。输入变化期间 saveState 保持 saving；失败时保持内容与 dirty。冲突取消保持本地内容；overwrite 仅来自既有确认。

回滚仅回退本切片 shell 接线、state helper 与 ledger；不改 WF-09-01、数据库、workspace snapshot 或 Rust 文件协议。
