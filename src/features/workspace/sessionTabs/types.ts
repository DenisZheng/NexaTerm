import type {
  RdpLaunchPreview,
  RdpLaunchResult,
  VncLaunchPreview,
  VncLaunchResult,
} from "../../connections/connectionTypes";

/**
 * 会话 tab 类型 —— Task 04 第二刀 2a：从 WorkspaceShell 原样迁出，字段与语义未改。
 * WF-01 切片 2：`TerminalTab.index` 改名为 `ordinal`（语义不变，名称不再暗示排序位）。
 * `TStep` 是连接向导的步骤状态，其类型链（ConnectionStepState → 连接弹窗类型）仍归 WorkspaceShell，
 * 这里用泛型参数留位，避免把连接弹窗拖进 workspace seam。
 */
export interface TerminalTab<TStep = unknown> {
  connectionStep?: TStep | null;
  error?: string | null;
  id: string;
  connectionId: string;
  /** 每个连接内的实例编号（0 起，创建时取 max+1，之后不变），用于标题“终端 N”；不是排序位。 */
  ordinal: number;
  requestId?: string;
  sessionId?: string;
  status: string;
  title: string;
  type: "connecting" | "terminal";
  warmupOutput: number[];
}

export type RdpSessionStatus = "launching" | "external" | "embedded" | "native" | "error";

export interface RdpSessionTab {
  connectionId: string;
  createdAt: number;
  error?: string | null;
  id: string;
  message?: string | null;
  preview?: RdpLaunchPreview | null;
  result?: RdpLaunchResult | null;
  status: RdpSessionStatus;
  title: string;
}

export type VncSessionStatus = "launching" | "embedded" | "windowed" | "external" | "error";

export interface VncSessionTab {
  connectionId: string;
  createdAt: number;
  error?: string | null;
  id: string;
  message?: string | null;
  preview?: VncLaunchPreview | null;
  result?: VncLaunchResult | null;
  status: VncSessionStatus;
  title: string;
  windowLabel?: string | null;
}

export interface ConnectionSessionSummary {
  connectionId: string;
  tabs: Array<{ id: string }>;
}

/** 工作区当前显示的会话类型；与目标布局的统一 tab 栏 `kind` 同源。 */
export type WorkspaceMode = "home" | "ssh" | "local" | "rdp" | "vnc";

export type WorkbenchTabKind = "terminal" | "file";

export interface UnifiedWorkbenchTab {
  id: string;
  kind: WorkbenchTabKind;
}
