# 设计

新增只读 `local_file_list` Tauri command，输入用户选择的目录，返回名称、完整路径和有限类型信息；复用 `LocalPathMetadata` 的本地路径校验语义，不返回文件内容、权限或凭据。

新增 `LocalFilePanel` 作为纯 UI 组件：根目录由用户选择，导航状态只保存在组件内存；加载中、错误、空目录、文件与目录行都显式呈现。路径输入只允许定位到已存在目录，失败保留当前列表并显示错误。

Files 侧栏将本地面板与现有 `RemoteFilesView` 组成双栏。源面板拖放只写入 `application/x-nexaterm-local-file` 的路径元数据；远程面板只接受该类型并调用现有 `uploadNativeDroppedPaths`，因此不复制上传、冲突或队列逻辑。

本地 command 不修改 workspace snapshot schema；快照仍只记录远程导航。新增 i18n key 必须同时写入 en 与 zh-CN，并通过现有 i18n 门禁。
