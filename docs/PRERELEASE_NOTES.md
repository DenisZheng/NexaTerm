# NexaTerm 预发布试用说明

此版本供早期试用，不代表 A15 三平台正式发布验收完成。

- Windows 安装包没有 Authenticode 签名，可能出现“未知发布者”或 SmartScreen 提示。
- macOS 安装包没有 Apple Developer ID 签名和公证，Gatekeeper 可能阻止首次打开。
- Linux 产物由 CI 构建，目前没有真实 Linux 桌面安装/交互验收。
- 尚未完成旧版 mXterm 的真实升级、数据迁移、回滚和完整性能验收；请先使用测试配置。
- updater 产物保留独立签名，下载文件可用 SHA256SUMS.txt 校验；该签名不等于 Windows/macOS 平台签名。
- 预发布不进入稳定版 latest 更新渠道。请从本 Release 页面手动下载；尚无正式 Release 时，应用内检查更新可能暂不可用。

Windows/macOS 安装与基本功能验收结果须在公开草稿前补充到本页，并注明所测系统版本和产物。当前文本不声明任何真实安装验收已经通过。
