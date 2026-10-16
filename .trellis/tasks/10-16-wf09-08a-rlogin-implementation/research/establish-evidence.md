# 原生建立 adapter 执行证据

[Draft #70](https://github.com/DenisZheng/NexaTerm/pull/70)，基于 #69。初始代码a5fdf67f7be84697ced2f06ac7a4b4c87a90d8ac；完整能力仍未开放。

## 首轮与根因

[原生 #10](https://github.com/DenisZheng/NexaTerm/actions/runs/38935223031)：Linux33项全过，macOS32通过/1失败，Windows结果另列。失败是ACK尾部遇urgent flush的接管场景，不是字段或握手字节编码。

E/B边界根因：Darwin EV_CLEAR会清除一次性内核通知，原NativeSocket.poll_ready把它当作可反复查询的level状态，却未在owner内保留pending。新测试先观察就绪、完成ACK，再交付reader，暴露了通知在接管前被消费的问题。只删除预检查或允许错误尾部数据通过会掩盖契约缺陷，不能采用。

已修：Monitor保留pending urgent，观察/peek均不清除，只有NativeSocket.urgent(false)实际消费成功才清除。保留原接管flush断言并在共用原生探针追加“重复观察、peek之后仍就绪”的回归；探针通过生产NativeSocket封装消费，不绕过其状态。该Cell随独占socket移动，不向并行reader共享。无deadline增加、无skip、无生产数据过滤。

## 当前结果

修复后的三平台原生与完整应用CI待执行。需分别记录实际低端口公共adapter路径（Windows可用或Unix真实拒绝）与普通socket上的协议交换；后者不算低源端口或真实rlogind互通。
