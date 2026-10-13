# 设计

传输仍由既有 store/controller 管理。增加可选 ownerInstanceId，仅保存在内存。关闭规划同时收到 closing instance IDs 与 released connection IDs，带 owner 项按实例匹配，无 owner 历史项沿用连接规则。确认仍重算计划。

shell 在发起选择/metadata/批量流程前固定 connection 与 owner；执行前核对 owner 仍存在。重试使用原 owner，不跟随焦点。临时保存仅重绑 connection 和 retry，owner 不变。Rust IPC 保持 connection ID 与 transfer ID，不传凭据或新增快照字段。

双栏内部拖放通过共享 typed payload 解析器传递文件 entry、连接与 owner；本地落点指定 downloadRoot 并关闭分组/时间戳，冲突预检与下载使用同一请求。导航请求按 generation 防迟到覆盖，错误保留列表。

队列暂停使用 controller flag，既有排队任务保留，不终止在途 I/O。恢复只调用原 drain，不创建第二套任务状态。按钮沿用传输面板已有共享样式、i18n、可访问名称，无布局或主题重设计。

回滚：回退本切片，保留 A/B；没有数据库、workspace snapshot 或 Rust 协议迁移。
