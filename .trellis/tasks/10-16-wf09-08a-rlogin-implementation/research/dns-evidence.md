# Rlogin DNS 实现与证据（进行中）

基于#77已验证代码13eb8d9及文档收口4b62d1f；沿用本任务WS规则和验收编号。

Destination统一验证远端canonical IPv4/ASCII主机名、端口与本地IPv4；配置保存/导入只做语法和BSD字段验证，保留大小写/尾点，不发DNS。非法数字/十六进制简写不转作主机名。reserve固定目标和encoding，start actor解析一次并固定首个有效IPv4，DNS/bind/connect/握手共用原15s截止；不改高端口、不加依赖或fallback。

每manager共享4项resolver额度，实际blocking OS worker持有额度；session actor和worker lease等待其实际完成。取消/截止后迟到结果只报固定取消/超时，不能拨号；取消不伪称强制终止系统解析，close仍等待真实清理。IPv4直接绕过DNS额度。解析最多扫描16个地址，IPv6/无有效IPv4固定失败，状态不含OS文字或地址表。

已添加11项native DNS行为测试（语法、cap、真实localhost、固定错误、gated取消/调用方drop/原截止及实际SessionManager close屏障）和1项真实SQLite hostname CRUD/sync/reopen回归，以及1项前端冻结hostname/许可回归；本地无Rust，原生/存储测试必须等本切片CI，尚不计通过。

本地前端131文件1105通过/1既有todo，脚本188通过/3既有环境skip，类型/4GB标准build/CI全部source门禁/协议切换/line-budget/diff与30项Trellis上下文通过。母版DOM验证固定hostname许可、变更表单不改本次目标、DNS说明和实际清理状态；不是WebView或主题视觉验收。首次DOM测试选错动作container ID，修正harness后通过，未改变产品代码以迁就断言。

完整三平台Rust/native、安全、许可证和fixture证据待本切片Draft结果。DNS成功不等于rlogind互通；Windows精确flush、真实服务端、XDMCP随包引擎及Rsh仍有开发/验收工作。
