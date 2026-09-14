export type McpConnectionExposureMode = "all" | "custom";

export interface McpRemoteServiceStatus {
  enabled: boolean;
  running: boolean;
  /** 实际生效并传给 sidecar 的监听地址。 */
  host: string;
  /** 用户保存的原始地址，可能与 host 不同。 */
  host_stored: string;
  /** host 是否因未确认暴露风险而被降级为 loopback。 */
  host_downgraded: boolean;
  port: number;
  url: string;
  sse_url: string;
  pid?: number | null;
  token_saved: boolean;
  token_preview?: string | null;
  error?: string | null;
  healthy: boolean;
  started_at?: string | null;
  last_health_at?: string | null;
  restart_count: number;
  consecutive_failures: number;
  log_path?: string | null;
}

export interface McpRemoteLogOutput {
  content: string;
  path: string;
  truncated: boolean;
  updated_at: string;
}

export interface McpUpdateBlockerStatus {
  process_count: number;
  managed_remote_running: boolean;
}

export interface McpLocalNetworkInfo {
  primary_ip?: string | null;
  ip_addresses: string[];
}

export interface McpSettings {
  enabled: boolean;
  expose_connections: boolean;
  ssh_operations_enabled: boolean;
  allow_dangerous_commands: boolean;
  remote_enabled: boolean;
  /** 实际生效的监听地址。展示与生成客户端配置时用这个。 */
  remote_host: string;
  /**
   * 用户保存的原始地址。**表单与保存请求必须用它**——
   * remote_host 是生效值，未确认时已被降级为 loopback，
   * 若把它当作输入回传，任何一次无关保存都会静默改写用户保存的地址。
   */
  remote_host_stored: string;
  /** 生效值是否因未确认暴露风险而被降级为 loopback。 */
  remote_host_downgraded: boolean;
  /** 用户是否已确认过非本机监听地址的暴露风险。 */
  remote_exposure_acknowledged: boolean;
  remote_port: number;
  remote_token?: string | null;
  remote_token_saved: boolean;
  remote_token_preview?: string | null;
  generated_remote_token?: string | null;
  remote_status?: McpRemoteServiceStatus | null;
  connection_exposure_mode: McpConnectionExposureMode;
  exposed_connection_ids: string[];
}

/**
 * loopback 判定，与后端 `mcp::is_loopback_host` 保持严格一致
 * （`localhost` / `127.0.0.1` / `::1`，精确匹配）。
 *
 * 前端只用它决定是否展示风险提示；真正的强制在 `save_settings` 里，
 * 两者判定必须同源，否则会出现「界面没提示、后端却拒绝」或更糟的反向情况。
 */
export function isLoopbackHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

export const defaultMcpSettings: McpSettings = {
  enabled: false,
  expose_connections: false,
  ssh_operations_enabled: false,
  allow_dangerous_commands: false,
  remote_enabled: false,
  remote_host: "127.0.0.1",
  remote_host_stored: "127.0.0.1",
  remote_host_downgraded: false,
  remote_exposure_acknowledged: false,
  remote_port: 8765,
  remote_token: null,
  remote_token_saved: false,
  remote_token_preview: null,
  generated_remote_token: null,
  remote_status: null,
  connection_exposure_mode: "all",
  exposed_connection_ids: [],
};
