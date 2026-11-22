# 设计

复用现有 Radix 命名弹窗和 mini-action/Tooltip，使用 Lucide Copy 图标及既有 token 样式，不引入新视觉体系。ui-ux-pro-max 未安装，已检查仓库与可用技能；本次沿用现有组件，不新增布局/颜色/样式。

Save As 申请既有 editor operation 的 save token，绑定源标签本次生命周期。弹窗未提交可取消并释放 token；提交后禁止重复提交/改名/关闭弹窗，提示 Saving，但 Monaco 的保存期间新输入仍由已有状态 helper 保留。关闭源标签使 token 失效；失效不是后端取消。失败恢复源状态，保留弹窗/token 供换名重试。

新增 typed remote_file_save_as IPC，输入仅 connection_id/path/content，后端按既有配置解析连接，无前端凭据。内容经 stdin 写私有临时目录内文件，trap 清理；POSIX link 精确发布目标，不使用 ln 的目录目标语义，不使用先建空文件再覆盖写入。link 缺失/不支持时安全失败，不降级为覆盖。已有目标统一 remote_file_exists；其它错误 remote_file_save_as_failed。

成功前检查 token 和目标标签占用；迁移源编辑器到确定的 connection/path id，使用 submittedContent 与当前 buffer 比较 dirty，metadata/path/name 来自后端结果。活动标签只在仍指向源 id 时切换。目标在途被其它动作打开时保留源，不创建重复标签，明确提示已创建副本。原文件的内容、版本、权限均不被改写，新文件使用私有权限。

回滚仅回退本切片接线、IPC 与 builder，不改变 WF-09-01、A15、数据库、snapshot 或 release gate。
