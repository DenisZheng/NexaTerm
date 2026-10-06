import { t as tr } from "../../shared/i18n";
import type { RemoteCpuSummary } from "./monitorTypes";

const ordinaryThreadsPerCoreLimit = 2;

function positiveCount(value?: number | null) {
  return value && value > 0 ? value : null;
}

function logicalCpuCount(cpu: RemoteCpuSummary) {
  return positiveCount(cpu.logical_cores) || cpu.cores.length || null;
}

function shouldDisplayThreadOnlyTopology(cpu: RemoteCpuSummary) {
  const physical = positiveCount(cpu.physical_cores);
  const logical = logicalCpuCount(cpu);
  return !cpu.is_virtualized && physical != null && logical != null && logical > physical * ordinaryThreadsPerCoreLimit;
}

export function formatCoreShape(cpu: RemoteCpuSummary) {
  if (cpu.is_virtualized) {
    return tr("monitor.cpu.virtualized", { logical: formatLogicalCpuCount(cpu) });
  }

  if (shouldDisplayThreadOnlyTopology(cpu)) {
    return formatLogicalCpuCount(cpu);
  }

  const physical = positiveCount(cpu.physical_cores);
  const logical = logicalCpuCount(cpu);
  const physicalLabel = physical ? tr("monitor.cpu.physical", { count: physical }) : tr("monitor.cpu.physicalUnknown");
  const logicalLabel = logical ? tr("monitor.cpu.threads", { count: logical }) : tr("monitor.cpu.threadsUnknown");
  const sockets = cpu.sockets || 1;
  return tr("monitor.cpu.sockets", { count: sockets, physical: physicalLabel, logical: logicalLabel });
}

export function formatCpuTopologyBadge(cpu: RemoteCpuSummary) {
  const physical = positiveCount(cpu.physical_cores);
  const logical = logicalCpuCount(cpu);

  if (cpu.is_virtualized && logical) {
    return `${logical.toString()} vCPU`;
  }
  if (shouldDisplayThreadOnlyTopology(cpu) && logical) {
    return tr("monitor.cpu.threads", { count: logical });
  }
  if (physical && logical) {
    return tr("monitor.cpu.topology", { physical, logical });
  }
  if (physical) {
    return tr("monitor.cpu.physical", { count: physical });
  }
  if (logical) {
    return tr("monitor.cpu.threads", { count: logical });
  }
  return undefined;
}

export function formatLogicalCpuCount(cpu: RemoteCpuSummary) {
  const logical = logicalCpuCount(cpu);
  if (!logical) {
    return cpu.is_virtualized ? tr("monitor.cpu.vcpuUnknown") : tr("monitor.cpu.threadsUnknown");
  }
  return cpu.is_virtualized ? `${logical.toString()} vCPU` : tr("monitor.cpu.threads", { count: logical });
}
