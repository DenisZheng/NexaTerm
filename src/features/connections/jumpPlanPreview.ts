import type { ConnectionProfile, ConnectionProfileInput } from "./connectionTypes";

export interface JumpPlanIssue {
  code: "connection_jump_cycle" | "connection_jump_depth_exceeded" | "connection_jump_missing";
  detail: string;
  title: string;
}

export interface JumpPlanPreview {
  issue: JumpPlanIssue | null;
  labels: string[];
}

function labelForConnection(connection: Pick<ConnectionProfile, "name" | "host" | "port" | "username">) {
  return connection.name?.trim() || `${connection.username || "user"}@${connection.host}:${connection.port.toString()}`;
}

function targetLabel(form: ConnectionProfileInput) {
  return form.name?.trim() || `${form.username || "user"}@${form.host || "target"}:${form.port.toString()}`;
}

export function buildJumpPlanPreview(
  form: ConnectionProfileInput,
  connections: ConnectionProfile[],
  targetConnectionId = "",
): JumpPlanPreview {
  const target = targetLabel(form);
  const jumpId = form.jump?.kind === "ssh_jump" ? form.jump.jump_connection_id?.trim() || "" : "";
  if (!jumpId) {
    return { issue: null, labels: [target] };
  }

  const byId = new Map(connections.map((connection) => [connection.id, connection]));
  const visited = new Set(targetConnectionId ? [targetConnectionId] : []);
  const jumps: ConnectionProfile[] = [];
  let currentId = jumpId;

  while (currentId) {
    if (visited.has(currentId)) {
      return {
        issue: {
          code: "connection_jump_cycle",
          detail: "所选跳板链会回到当前连接或形成循环，请改用其他跳板机。",
          title: "跳板链存在循环",
        },
        labels: [...jumps.map(labelForConnection).reverse(), target],
      };
    }
    if (jumps.length >= 2) {
      return {
        issue: {
          code: "connection_jump_depth_exceeded",
          detail: "当前最多支持两级 SSH 跳板，请缩短已保存连接的跳板链。",
          title: "跳板层级超过上限",
        },
        labels: [...jumps.map(labelForConnection).reverse(), target],
      };
    }
    visited.add(currentId);
    const current = byId.get(currentId);
    if (!current) {
      return {
        issue: {
          code: "connection_jump_missing",
          detail: "跳板链引用的已保存连接不存在，请重新选择跳板机。",
          title: "跳板机连接不存在",
        },
        labels: [...jumps.map(labelForConnection).reverse(), target],
      };
    }
    jumps.push(current);
    currentId =
      current.jump?.kind === "ssh_jump" ? current.jump.jump_connection_id?.trim() || "" : "";
  }

  return { issue: null, labels: [...jumps.map(labelForConnection).reverse(), target] };
}

export function jumpCandidateWouldCycle(
  candidateId: string,
  targetConnectionId: string,
  connections: ConnectionProfile[],
) {
  const byId = new Map(connections.map((connection) => [connection.id, connection]));
  const visited = new Set<string>();
  let currentId = candidateId;
  while (currentId) {
    if (currentId === targetConnectionId || visited.has(currentId)) return true;
    visited.add(currentId);
    const current = byId.get(currentId);
    if (!current || current.jump?.kind !== "ssh_jump") return false;
    currentId = current.jump.jump_connection_id?.trim() || "";
  }
  return false;
}

export function validateJumpPlanSelection(
  form: ConnectionProfileInput,
  connections: ConnectionProfile[],
  targetConnectionId = "",
) {
  return buildJumpPlanPreview(form, connections, targetConnectionId).issue;
}
