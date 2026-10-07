# 显式主题与原生窗口外观同步

## 用户流程
macOS 系统 Dark → NexaTerm System → Light → Dark → System；应用 chrome、Home、Sessions/Files、Settings、菜单和弹窗与选择一致，终端独立配色不改变。

## 范围
- main d16610a2，独立分支 fix/explicit-theme-native-appearance。
- 修复实际同步源头，不逐块补 CSS、不改透明度/布局、不更改 terminalTheme.scheme。
- Startup、运行时设置、body Portal 与 app-shell 使用一致的外观规则。
- 验收 Home、Sessions、Files、Settings、Toolbar、dropdown/select/context menu/tooltip、New Session、Quick Open、Connection/Confirm Dialog。
- 关联 A15 发布外观验证，WS-E09/E10；不扩大其它产品功能，不触碰 PR #12；README 文案可继续，截图等本修复合入 main 后再拍。

## 授权
用户已明确同意建任务并继续分析修复，随后确认“已经恢复了”。用户选择“先开主题修复 PR，合入后拍图”，已授权独立提交、推送与创建 PR；不得自行合并。
