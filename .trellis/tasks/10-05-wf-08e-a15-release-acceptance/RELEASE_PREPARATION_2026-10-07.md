# A15 发布验收准备（2026-10-07）

## 候选与自动化

- 接续已有 WF-08E，不新建任务、不改运行时代码。
- 候选提交：`b7afa0d653dc06691b08cc1f20b29278f4920711`，版本仍为 0.1.17；尚无正式 tag。
- CI #560：https://github.com/DenisZheng/NexaTerm/actions/runs/37588599585 。已 SUCCESS（2026-10-07 再次核对），包括三平台 Rust、fixtures、Frontend、Security、License。
- 本次发布证据使用 CURRENT.json；10 月 5 日旧基线与已完成 A09/A10 证据保留在既有报告中。旧 final CI PASS 不迁移到新 SHA。

## 已确认准备缺口

只查询 GitHub secret 名称，没有读取密钥值。

- 仓库级 secret 只有 `TAURI_SIGNING_PRIVATE_KEY`，只证明已配置，不证明签名可用。
- 未配置 `WINDOWS_CERTIFICATE` / `WINDOWS_CERTIFICATE_PASSWORD`。
- 未配置 `APPLE_CERTIFICATE` / `APPLE_CERTIFICATE_PASSWORD` / `APPLE_ID` / `APPLE_PASSWORD` / `APPLE_TEAM_ID`。
- GitHub environments 列表为空；GitHub Releases 列表为空。
- 维护者已确认：有 Windows 机器，无 Linux 机器；没有 Windows 签名证书、Apple 开发者账号，也未保留旧版安装包和数据。本机为 macOS，可作为 macOS 测试环境。
- Windows/macOS 可先验证无平台签名的测试包安装、启动、语言/主题及性能；不能记录 Authenticode / Developer ID / 公证通过。
- Linux CI 构建可继续，但真实桌面安装/交互保持 blocked。
- 历史版本迁移、升级/回滚及旧版内存对比目前缺少真实基线。后续如从固定历史源码重建旧版并创建测试数据，应明确标为重建基线，不冒充历史用户数据。

## 发布路径边界

当前 release.yml 的非 tag workflow_dispatch 可构建三平台测试产物，不创建 GitHub Release；该路径跳过 Authenticode、Developer ID、公证检查，不能作为签名发布通过的证据。

推送 v* tag 会校验版本、要求真实平台证书并自动公开 GitHub Release。不得将该操作当作单纯预构建，也不得在证书未准备好时用其探测环境。

## 后续顺序

1. 等 CI #560 成功，核对 main 是否仍为该 SHA，再固定本轮验收候选。
2. 确认三平台机器、签名凭据准备情况、旧版安装包与测试数据来源；只使用测试副本进行迁移和回滚。
3. 明确测试包预验与正式签名发布的执行时点；正式 tag/version 与发布操作单独列出具体方案供维护者确认。
4. 同一候选三平台生成包并核对 SHA256，依次完成安装/启动、品牌/语言/主题、迁移、升级恢复、性能工作负载。
5. 回填真实证据；运行 a15-evidence-check，全部 blocker 清零后由维护者最终签字。

本次未打 tag、未触发打包、未发布 Release、未截图、未改证书或用户数据。准备记录不代表 A15 通过。

## 当前建议的最小可执行批次

待 CI #560 成功后，使用现有 Release workflow 的非 tag workflow_dispatch 构建候选测试包（执行前再次核对 ref 的 SHA）。不会创建公开 Release，Windows/macOS 平台签名项继续 blocked；updater 签名能否成功需看构建结果。

优先交付 Windows 与 macOS 测试包及 SHA256，让维护者按安装、启动、语言、主题、基本连接、性能顺序验收。Linux、历史升级/迁移和签名发布保留缺口，不修改 A15 通过标准。尚未获得本批打包触发确认，未执行 workflow_dispatch。


## 预发布通道实施更新

维护者已批准实现首版无平台证书 Pre-release。当前本地候选版本已设为 0.1.17-rc.1；尚未提交，因此 CURRENT.json 中 b7afa0d / 0.1.17 只记录上一已验证基线，不代表新候选构建已验证。新提交的 CI 和实际构建必须重新留证。

新工作流仅允许 alpha/beta/rc 数字后缀进入无平台证书通道，并创建非 latest 的草稿。普通正式 tag 的证书要求保留；上文关于原 workflow 的描述为修改前基线。公开草稿仍需真实安装验收，不自动公开或修改 A15 签字。
