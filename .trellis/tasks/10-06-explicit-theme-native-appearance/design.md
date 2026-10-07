# 诊断与修复设计

## 实证
真实 main Tauri Console：body=light、app-shell=light、native window=dark、prefers-color-scheme dark=true；body 与 shell 的 --mx-panel 同为 rgb(255 255 255 / 68%)。原生窗口暗色底层与亮色半透明 CSS 混合形成灰色。

## 假设与区分
1. 原生 appearance 未同步：CSS 与 native theme 不一致；同步原生主题应恢复亮色材质。
2. body 启动值滞留：应观察到 body=system、shell=light；实测排除，现有两个窗口的 useLayoutEffect 已同步 body。
3. CSS dark selector 泄漏：应观察到 CSS panel 仍为暗色；实测两端 panel 都为亮色透明值，当前主故障不支持此假设。

## 最小实现
收口 document appearance 应用与两个窗口的运行时 effect；启动同样使用该入口。补窄范围 Tauri setTheme 同步：light/dark 为显式值，system 传 null 解除覆盖，不能把 matchMedia 推导的颜色固化成系统模式。仅 main 与 vnc-runner-host 授权 window set-theme。保留 Windows WebView 背景同步与终端独立主题。

共享代码使用当前依赖，不新增依赖。原生主题失败记录非敏感 warning，不伪称同步成功。启动在显示窗口前等待原生主题应用；运行时仅主题值改变时同步原生层。
