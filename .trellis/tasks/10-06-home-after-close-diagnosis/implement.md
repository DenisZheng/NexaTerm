# Home 空白修复执行计划

维护者已确认本方案；原始故障与内存单变量实验见 diagnosis.md。

1. [x] 从最新 origin/main @ 17a4365f 新建 fix/home-after-close-null-connection 独立工作树。
2. [x] 沿用已有 scripts/wf07-ssh-output.test.mjs 的真实 shell 函数提取测试方式，补类型守卫及真实 controller 渲染回归；先记录失败。
3. [x] 应用单行存在性检查与必要说明，保持历史 profile 默认 SSH 语义；原始复现和新增测试通过。
4. [x] 运行 pnpm check、pnpm test、pnpm test:scripts、Home/startup source gates、pnpm build、git diff --check，审查启动 chunk 与调用点。
5. [x] 将类型守卫不能把空对象作为默认协议实体的教训补到前端状态规范。
6. [x] 停止原故障开发会话，启动此独立修复版本；检查真实 Home 显示并交付维护者执行关闭回归。
7. [x] 仅暂存本任务目标代码、测试、规范和记录；维护者于 2026-10-06 授权本地提交，不推送、不合并 PR #44。人工关闭回归仍待确认。

不新增依赖，不改 Vault/secret_missing，不改变关闭顺序、effect followUp 契约或 UI 布局。该分支不包含 PR #44 的 Files follow snapshot 改动，不能用于替代 WF-07 A/B 冷启动验收。
