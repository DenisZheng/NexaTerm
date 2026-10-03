# WF-05A 设计

## 复用现有 provider

Windows backend 已通过 `wsl.exe -l -q` 探测发行版，并为每个发行版生成 `kind = "wsl"` 的 `LocalTerminalProfile`，启动仍走统一 `local_terminal_open`。05A 不复制或替换这条路径。

## 入口投影

新增纯前端投影：
- `kind !== "wsl"` → Local terminals；
- `kind === "wsl"` → WSL；
- WSL section 只在 Windows 显示；
- loading / detection failure / 未检测到发行版均显示显式状态。

当前 backend 对“wsl.exe 不存在”和“存在但没有 distribution”都可能表现为零 profile，因此 05A-1 文案只承诺“不可用或未检测到发行版”，不伪造更细原因。05A-2 再扩 provider capability contract。

## 状态所有权

入口只投影现有 `localTerminalProfiles`，不新增第二份会话状态。选择 profile 继续调用 `openLocalTerminalByProfile`，因此实例 ID、Split 与 MultiExec identity 保持现有模型。
