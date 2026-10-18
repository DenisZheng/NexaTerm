# S2 下一步：Rsh 命令任务 owner

S1已有实际双连接传输并过原生36三平台；用户仍不能从UI运行Rsh。下一刀先完成owner，随后typed IPC和实际命令任务入口，不能把S1函数当作完整功能。以下是后续实现约束，不是当前已存在API。

复用审查：Rlogin已有main-window单次许可/UUIDv4租约、15秒reserve TTL、16handle/4worker、真实worker完成barrier及pull/ACK，不应再复制整套200行manager。优先提取确实共用的小型lease/registry或交付队列，并让既有Rlogin回归验证；Rlogin OOB/flush/resize/encoding保持专属，Rsh不能继承这些终端语义。当前DNS位于Rlogin owner内，Rsh hostname接入前提取共享数字IPv4/有界OS解析器并保留Rlogin错误映射和不可中断resolver实际归属测试，禁止复制resolver或丢弃仍运行的OS调用后假称已清理。

Rsh task：单次显式许可冻结目标、用户、编码与准确命令；命令正文只在该次瞬态request中，不写连接、快照、sync、历史、宏、日志、AI或MultiExec。reserve不IO，start只消费一次；取消/重复/旧generation/窗口销毁不可启动新连接或重放命令。ACK只进入initial_exchange_ready，不声称认证或命令成功。

输入操作须串行保留实际未写后缀；stdin EOF排在已接受的输入之后，只半关闭一次，此后拒绝新stdin；信号采用独立有界白名单FIFO并通过secondary普通写入。actor在输出满时仍推进cancel/信号/输入，不因stdout EOF丢stderr。两条输出必须公平读取，明确流标签和各自EOF，累计队列+flight+actor当前块+ACK尾部都计入预算，不能每层各自1MiB后倍增。pull一次一个flight，精准u64序号，只有实际renderer消费后ACK归还额度；status不消耗输出，重复或过期ACK不能跳过数据。

task phase区分reserved/starting/initial_exchange_ready/closing/closed/failed，stdin/stdout/stderr EOF另外报告；输出drain完成不生成remote exit code。close/shutdown_wait等实际两个FD、pending input/command、DNS及worker都释放后才返回；失败保留固定可重试状态。运行超时和建立15秒总截止分开设计，不自动重跑，取消网络不保证远端进程终止。

owner夹具须实际用S1双流：输出背压与另一流尾部、EOF输入排序、信号可取消、lease过期/并发start/许可拒绝/4worker、取消每建立阶段、task abort/窗口关闭等待真实资源。真实rshd、低端口权限集成和三主题WebView仍分别留证据。UI必须先在同一原型母版实现可点击流程，再接既有Radix/Lucide/token共享组件并lazy加载。
