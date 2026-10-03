# WF-06A 设计

## 复用

现有 `TunnelManager` 已拥有：
- rule store；
- local / dynamic TcpListener；
- remote forward request/cancel；
- reusable SSH forward session；
- runtime task；
- stopped/starting/running/failed/credential_required 状态；
- credential/Host Key 错误路径。

因此 06A 不重写上述逻辑。

## lifecycle 缺口

当前 `stop_running(rule_id)` 能正确：
- abort local/dynamic accept task；
- cancel remote forward；
- clear remote-forward target；
- close reusable SSH session。

但 workspace “关闭该 connection 全部会话”/“删除 connection”没有按 `connection_id` 调用 tunnel manager。

新增 `tunnel_stop_connection`：
1. 从规则 store 找出该 connection 的规则；
2. 对每条规则调用既有 `stop_running`；
3. 将状态收敛为 stopped；
4. 返回这些规则的最新状态。

前端删除 connection 时等待 stop；普通 close-all-sessions 路径发起 stop，不影响其它 connection 的 tunnel。

## 入口

`tools.tunnels` 已由 WF-01 接入 toolbar/menu 与 action registry。06A source gate 固定这个入口，不重复创建第二个 tunnel 入口。
