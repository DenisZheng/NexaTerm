import {
  defaultAdvancedConfig,
  defaultJumpConfig,
  defaultProxyConfig,
  type ConnectionProfile,
} from "./connectionTypes";

export interface QuickConnectTarget {
  canonicalAddress: string;
  host: string;
  port: number;
  username?: string;
}

export type QuickConnectParseResult =
  | { kind: "empty" }
  | { kind: "invalid"; code: "address" | "password" | "port" }
  | { kind: "valid"; target: QuickConnectTarget };

const DEFAULT_SSH_PORT = 22;

export function parseQuickConnectAddress(input: string): QuickConnectParseResult {
  const value = input.trim();
  if (!value) return { kind: "empty" };
  if (/\s/.test(value)) return { kind: "invalid", code: "address" };

  if (value.toLowerCase().startsWith("ssh://")) {
    if (/^ssh:\/\/[^/@:]+:[^@]+@/i.test(value)) {
      return { kind: "invalid", code: "password" };
    }
    try {
      const url = new URL(value);
      if (url.protocol !== "ssh:" || url.password || url.search || url.hash) {
        return { kind: "invalid", code: url.password ? "password" : "address" };
      }
      if (url.pathname && url.pathname !== "/") return { kind: "invalid", code: "address" };
      const host = stripIpv6Brackets(url.hostname);
      if (!isValidHost(host)) return { kind: "invalid", code: "address" };
      const port = url.port ? Number(url.port) : DEFAULT_SSH_PORT;
      if (!isValidPort(port)) return { kind: "invalid", code: "port" };
      const username = decodeUrlUsername(url.username);
      return {
        kind: "valid",
        target: buildTarget(host, port, username || undefined),
      };
    } catch {
      const port = trailingPortCandidate(value);
      return { kind: "invalid", code: port !== null && !isValidPort(port) ? "port" : "address" };
    }
  }

  if (value.includes("://") || /[/?#\\]/.test(value)) {
    return { kind: "invalid", code: "address" };
  }

  const at = value.lastIndexOf("@");
  if (at !== value.indexOf("@")) return { kind: "invalid", code: "address" };
  const username = at >= 0 ? value.slice(0, at) : "";
  const hostInput = at >= 0 ? value.slice(at + 1) : value;
  if (username.includes(":")) return { kind: "invalid", code: "password" };
  if (at >= 0 && !username) return { kind: "invalid", code: "address" };

  const bracketedIpv6 = hostInput.startsWith("[") && hostInput.endsWith("]");
  if (hostInput.includes(":") && !bracketedIpv6) return { kind: "invalid", code: "address" };
  const host = stripIpv6Brackets(hostInput);
  if (!isValidHost(host)) return { kind: "invalid", code: "address" };

  return {
    kind: "valid",
    target: buildTarget(host, DEFAULT_SSH_PORT, username || undefined),
  };
}

export function shouldOfferQuickConnect(input: string, savedMatchCount: number) {
  const value = input.trim();
  return Boolean(
    value &&
      (value.toLowerCase().startsWith("ssh://") || value.includes("@") || savedMatchCount === 0),
  );
}

export function isQuickConnectCredentialError(code?: string | null) {
  return Boolean(
    code &&
      (code.startsWith("terminal_auth") ||
        code.startsWith("terminal_private_key") ||
        code === "credential_prompt_required"),
  );
}

export function buildTemporaryConnectionProfile(
  contextRef: string,
  target: QuickConnectTarget,
): ConnectionProfile {
  const username = target.username || "";
  return {
    id: contextRef,
    name: username ? `${username}@${target.host}` : target.host,
    protocol: "ssh",
    host: target.host,
    port: target.port,
    username,
    credential_mode: "prompt",
    prompt_auth_kind: "password",
    proxy: { ...defaultProxyConfig },
    jump: { ...defaultJumpConfig },
    advanced: { ...defaultAdvancedConfig },
    is_favorite: false,
    created_at: "temporary",
    updated_at: "temporary",
  };
}

function buildTarget(host: string, port: number, username?: string): QuickConnectTarget {
  const displayHost = host.includes(":") ? `[${host}]` : host;
  return {
    canonicalAddress: `ssh://${username ? `${encodeURIComponent(username)}@` : ""}${displayHost}:${port.toString()}`,
    host,
    port,
    username,
  };
}

function stripIpv6Brackets(value: string) {
  return value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1) : value;
}

function isValidHost(host: string) {
  return Boolean(host && !/\s/.test(host) && !/[/?#@\\]/.test(host));
}

function isValidPort(port: number) {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

function trailingPortCandidate(value: string) {
  const match = value.match(/:(\d+)(?:[/?#]|$)/);
  return match ? Number(match[1]) : null;
}

function decodeUrlUsername(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}
