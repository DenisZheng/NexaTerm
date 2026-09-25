export type LocalTerminalProfileKind =
  | "powershell"
  | "powershell_core"
  | "cmd"
  | "wsl"
  | "git_bash"
  | "bash"
  | "zsh"
  | "fish"
  | "pwsh"
  | "custom";

export interface LocalTerminalProfile {
  id: string;
  name: string;
  kind: LocalTerminalProfileKind | string;
  platform: string;
  source: string;
  command: string;
  args: string[];
  cwd?: string | null;
  env: Record<string, string>;
  icon: string;
  hidden: boolean;
  detected: boolean;
}

export interface LocalTerminalProfileInput {
  id?: string;
  name: string;
  kind: LocalTerminalProfileKind | string;
  platform: string;
  source: string;
  command: string;
  args: string[];
  cwd?: string | null;
  env: Record<string, string>;
  icon: string;
  hidden: boolean;
  detected: boolean;
}

export interface LocalTerminalOpenRequest {
  request_id?: string;
  profile?: LocalTerminalProfileInput;
  cols: number;
  rows: number;
  cwd?: string;
}

export interface WindowsPtyInfo {
  backend: "conpty" | "winpty";
  build_number?: number | null;
}

export interface LocalTerminalSettings {
  ctrlVPaste: boolean;
  defaultProfileId: string | null;
  hiddenProfileIds: string[];
  customProfiles: LocalTerminalProfileInput[];
  reopenLastLocalWorkspace: boolean;
}

export interface LocalTerminalTab {
  id: string;
  source?: "local" | "telnet" | "serial";
  profileId: string;
  profileKind: string;
  /**
   * 同一 profile（telnet / serial 为同一连接）内的实例编号，0 起、创建时取 max+1，之后不变；
   * 用于顶层实例标签标题（WS-E11），不是排序位。`title` 由它经 `displayOrdinal` 生成（WF-01 切片 3 统一）。
   */
  ordinal: number;
  title: string;
  requestId?: string;
  sessionId?: string;
  status: string;
  error?: string | null;
  warmupOutput: number[];
}
