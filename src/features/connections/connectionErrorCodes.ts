/**
 * 连接类错误的稳定分类。
 *
 * 背景（`design.md` §5.3 第 1 步）：前端原先靠 `raw_message.toLowerCase()` 匹配
 * "connection refused" / "unreachable" / "reset" / "timed out" 等英文片段来判断
 * 失败原因。这些文本由操作系统生成、随系统语言变化（中文 Windows 给的是
 * 「连接的主机没有反应」，所以旧代码不得不再硬编码 `10060` 和中文片段），
 * 既不可测试也拦不住新的措辞。
 *
 * 现在分类由后端在拿得到 `io::ErrorKind` 的那一层完成，写进稳定的 `code`：
 * `{站点}_{connect_refused|connect_unreachable|connect_reset|connect_timeout}`，
 * 站点如 `terminal` / `terminal_tcp` / `remote_exec` / `tunnel_ssh` /
 * `remote_sftp` / `jump` / `proxy`。前端只读 `code`，不再解析错误文本。
 */
export type ConnectionNetworkKind =
  | "timeout"
  | "refused"
  | "unreachable"
  | "reset";

/** 从稳定 code 解析网络层失败原因；不是网络类失败时返回 null。 */
export function connectionNetworkKind(code: string): ConnectionNetworkKind | null {
  if (code.endsWith("_connect_timeout")) {
    return "timeout";
  }
  if (code.endsWith("_connect_refused")) {
    return "refused";
  }
  if (code.endsWith("_connect_unreachable")) {
    return "unreachable";
  }
  if (code.endsWith("_connect_reset")) {
    return "reset";
  }
  return null;
}

/**
 * 是否为「连接阶段」失败（TCP/代理/跳板建链，尚未进入主机密钥与认证）。
 *
 * 认证、通道、PTY 等阶段的超时（`terminal_auth_timeout` 等）不算在内——
 * 它们有各自的阶段与修复建议。
 */
export function isConnectionStageError(code: string): boolean {
  return (
    connectionNetworkKind(code) !== null ||
    code === "terminal_connect_failed" ||
    code === "terminal_tcp_connect_failed" ||
    code === "remote_exec_connect_failed" ||
    code === "tunnel_ssh_connect_failed" ||
    code === "remote_sftp_connect_failed" ||
    code === "jump_connect_failed" ||
    code.startsWith("proxy_")
  );
}

/** 建链超时判定：只认稳定 code，不再匹配 OS 文本。 */
export function isConnectTimeoutCode(code: string): boolean {
  return connectionNetworkKind(code) === "timeout";
}

/** 从错误对象读取诊断 ID；后端在 `AppError::new` 内生成，用于对上内部日志。 */
export function errorDiagnosticId(error: unknown): string {
  if (typeof error !== "object" || error === null || !("diagnostic_id" in error)) {
    return "";
  }
  const value = (error as { diagnostic_id: unknown }).diagnostic_id;
  return typeof value === "string" ? value : "";
}
