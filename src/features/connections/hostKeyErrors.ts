import type { HostKeyInfo } from "./connectionTypes";

export type HostKeyDecision = "unknown" | "changed";

export interface ParsedHostKeyError {
  decision: HostKeyDecision;
  hostKey: HostKeyInfo;
  oldFingerprint: string | null;
}

/**
 * 解析后端的主机密钥确认错误。
 *
 * 载荷来自 `AppError::details`（后端 `AppErrorDetails` 枚举，按 `kind` 判别），
 * 不是从 `raw_message` 里解析出来的：`raw_message` 已按 `design.md` §5.3 第 3 步
 * 从 IPC 线上移除，且它承载的是人类可读诊断文本，本就不该当作结构化数据通道。
 *
 * 载荷只作为「确认请求」的凭据来源；是否信任始终由用户显式决定，
 * 这里不合成指纹、也不改动 `code` 之外任何判定依据。
 */
export function parseHostKeyError(error: unknown): ParsedHostKeyError | null {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return null;
  }
  const code = (error as { code: unknown }).code;
  if (code !== "host_key_unknown" && code !== "host_key_changed") {
    return null;
  }
  const details = (error as { details?: unknown }).details;
  if (typeof details !== "object" || details === null || !("kind" in details)) {
    return null;
  }
  const payload = details as {
    kind: unknown;
    host_key?: unknown;
    old_fingerprint_sha256?: unknown;
  };
  // `code` 是权威判别字段，`details.kind` 必须与它一致：两者由后端同一处构造，
  // 一旦不一致说明契约被改坏，此时宁可不出确认卡片，也不能展示错的风险等级。
  const decision: HostKeyDecision = code === "host_key_changed" ? "changed" : "unknown";
  const expectedKind =
    decision === "changed" ? "host_key_changed" : "host_key_unknown";
  if (payload.kind !== expectedKind || !isHostKeyInfo(payload.host_key)) {
    return null;
  }
  if (decision === "changed") {
    // 指纹缺失时宁可判定为「未确认」：changed 分支会向用户并排展示新旧指纹，
    // 缺一个就会弱化风险提示。
    if (typeof payload.old_fingerprint_sha256 !== "string") {
      return null;
    }
    return {
      decision,
      hostKey: payload.host_key,
      oldFingerprint: payload.old_fingerprint_sha256,
    };
  }
  return { decision, hostKey: payload.host_key, oldFingerprint: null };
}

export function isHostKeyInfo(value: unknown): value is HostKeyInfo {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const info = value as Partial<HostKeyInfo>;
  return (
    typeof info.host === "string" &&
    typeof info.port === "number" &&
    typeof info.key_algorithm === "string" &&
    typeof info.fingerprint_sha256 === "string" &&
    typeof info.public_key === "string"
  );
}
