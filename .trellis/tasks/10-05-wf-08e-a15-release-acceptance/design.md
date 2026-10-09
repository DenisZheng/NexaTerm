# WF-08E Design

## Evidence template

`A15_EVIDENCE_TEMPLATE.json` 是最终 release candidate 证据的唯一结构化入口。

平台项统一要求 build/install/launch/brand/locale/theme/upgrade/rollback/hash；Windows 增加 Authenticode，macOS 增加 Developer ID + notarization/staple。

## Validator

`scripts/a15-evidence-check.mjs`：
- 枚举所有 A15 blocker；
- A09/A10 永远作为硬前置；
- `review` 与 `blocked` 和 `pending` 一样阻止最终 PASS；
- `--allow-pending` 仅用于检查未完成证据文件结构，不代表发布通过；
- 零 blocker 且 `signoff.status=pass` 才是有效最终签字。

## Real acceptance sequence

1. 先完成 A09/A10 Windows 真实 Tauri。
2. 生成同一 commit 的三平台 release candidate artifacts。
3. 验证签名/公证/hash。
4. 每平台 clean install + launch。
5. 每平台 language/theme/brand。
6. 旧 mXterm → NexaTerm migration。
7. updater upgrade + rollback/recovery。
8. 执行 WF-08D packaged performance workload。
9. 汇总 Security/License/final CI。
10. validator 零 blocker 后由维护者签署 A15。

## No silent downgrade

任何平台/凭据/硬件缺失都保留 pending/blocked，不能用其它平台结果替代。


## 首版预发布通道

复用 release.yml，引入集中 release-policy.mjs 分类：精确的 vMAJOR.MINOR.PATCH 是正式 tag，vMAJOR.MINOR.PATCH-(alpha|beta|rc).N 是预发布 tag，其余 tag 拒绝。任何 tag 均须与 package.json / Tauri / Cargo 版本完全一致。非 tag 手动触发仅构建 artifact，不发布。

预发布 tag 跳过平台证书导入/验证，保留 updater 密钥与 .sig、SHA256、许可证检查；创建 draft=true、prerelease=true、make_latest=false 的 GitHub Release，附平台签名限制和验收范围说明。正式 tag 保留原证书门禁与发布行为。发布判定在 policy job 产生输出，build/publish 使用同一输出，不散落不同 tag 判断规则。

不改 updater 稳定端点；只有预发布且没有正式 Release 时，应用内稳定更新检查可能暂不可用，预发布使用 GitHub 手动下载。新通道只提供候选产物，人工安装验收后才能公开草稿。
