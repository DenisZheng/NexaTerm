import type { ConnectionProfile } from "../connections/connectionTypes";
import type { TunnelRule } from "./tunnelTypes";

type TunnelConnectionSummary = Pick<ConnectionProfile, "host" | "id" | "name" | "port">;

export interface TunnelRuleConnectionState {
  canStart: boolean;
  connection: TunnelConnectionSummary | null;
  label: string;
}

export function resolveTunnelRuleConnection(
  rule: TunnelRule,
  connections: readonly TunnelConnectionSummary[],
): TunnelRuleConnectionState {
  const connection =
    connections.find((candidate) => candidate.id === rule.connection_id) || null;
  if (!connection) {
    return {
      canStart: false,
      connection: null,
      label: "连接不存在",
    };
  }
  return {
    canStart: true,
    connection,
    label: connection.name || `${connection.host}:${connection.port.toString()}`,
  };
}
