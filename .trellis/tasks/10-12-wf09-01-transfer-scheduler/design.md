# 设计

继续使用现有 controller refs 和 Zustand store，不新增调度器或状态副本。
入队先验证 mounted、queued 与任务 ID 未被占用；出队再次核对 store。
使用 Promise 链包住任务调用，同步抛错进入统一 catch/finally。调用前再次核对取消/卸载状态。
controller 的 effect cleanup 阻止 drain，释放 queued/task 闭包，取消其拥有的 queued/running 项；running 槽位由 finally 释放。仅卸载整个 controller 时清理，Files 面板隐藏不影响传输。
现有 IPC、进度批处理、错误展示和 conflict policy 保持。取消请求是 best effort，不能写成后端已确认停止；未知 transfer id 或已在 preflight 的情况由已有任务活动检查收尾。
