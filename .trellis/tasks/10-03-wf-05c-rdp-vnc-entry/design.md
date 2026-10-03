# WF-05C 设计

## 复用现有 provider

RDP:
- Windows：优先 embedded `mstsc_activex`，不满足条件时真实回退 external `mstsc`。
- Linux：external FreeRDP。
- macOS：external Windows App / Microsoft Remote Desktop / 系统 .rdp handler。
- 现有 `rdp_test_runner` 已返回 platform、available_runners、default_runner、supports_embedded 与 setup_hint。

VNC:
- `novnc` 永远作为内置 runner 暴露，启动本地 WebSocket bridge 到目标 VNC TCP endpoint。
- 可探测 RealVNC/TigerVNC/custom external viewer。
- 现有 `vnc_test_runner` 返回 platform、available_runners、default_runner、supports_embedded。

WF-05C 不复制这些 provider，只把 probe 结果投影到统一入口和生命周期证据。

## capability 投影

前端新增纯模型，将 runner probe 映射成用户可读状态：
- available embedded；
- available external；
- available embedded + external fallback；
- unavailable / missing runner；
- probe failed。

入口可以打开配置对话框，但状态必须同时说明“当前平台实际可用方式”。

## 实例与关闭

RDP/VNC workspace 继续使用各自现有 session tab owner：
- 普通打开可激活已有同 profile session；
- explicit new instance 调用 startRdpSession/startVncSession；
- close 先通知 backend runner/bridge，再从 workspace owner 删除。
RDP/VNC 不加入 terminal Split/MultiExec，因为它们不是 terminal input targets。

## A11

WF-05C 完成后，A11 的 Local/WSL、Serial/Telnet、RDP/VNC 三阶段均具备自动化边界和真实操作清单；届时再与 A09/A10 一起集中验收。
