import { XdmcpError, type XdmcpApi, type XdmcpPhase, type XdmcpReason, type XdmcpRequest, type XdmcpStatus } from "./xdmcpTypes";
import { xdmcpFailure } from "./xdmcpWire";

export interface XdmcpSnapshot {
  generation: number;
  phase: Exclude<XdmcpPhase, "reserved"> | "idle" | "cleanup_failed";
  display: number | null;
  reason: XdmcpReason | null;
}
interface Attempt { id: string | null; cancelled: boolean; cleanup: Promise<void> | null; }

/** 私有句柄只在 owner 内；公开快照不携带路径、地址、许可或原生 id。 */
export class XdmcpSessionOwner {
  private state: XdmcpSnapshot = Object.freeze({ generation: 0, phase: "idle", display: null, reason: null });
  private listeners = new Set<() => void>();
  private attempt: Attempt | null = null;
  private work: Promise<void> | null = null;
  private stopping: Promise<void> | null = null;
  private disposed = false;
  constructor(private readonly api: XdmcpApi, private readonly pause = () => new Promise<void>(resolve => setTimeout(resolve, 500))) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(change: Partial<XdmcpSnapshot>) {
    const next = { ...this.state, ...change };
    if ((Object.keys(next) as (keyof XdmcpSnapshot)[]).every(key => next[key] === this.state[key])) return;
    this.state = Object.freeze(next);
    for (const listener of this.listeners) listener();
  }
  private current(attempt: Attempt) {
    if (attempt !== this.attempt || attempt.cancelled || this.disposed) throw new XdmcpError("cancelled");
  }
  connect(request: XdmcpRequest): Promise<void> {
    if (this.disposed || this.work || this.stopping || this.attempt?.id) return Promise.reject(new XdmcpError("busy"));
    if (!request.allow_external || !request.allow_network) return Promise.reject(new XdmcpError("consent_required"));
    const attempt: Attempt = { id: null, cancelled: false, cleanup: null };
    this.attempt = attempt;
    this.publish({ generation: this.state.generation + 1, phase: "starting", display: null, reason: null });
    const work = this.execute(attempt, Object.freeze({ ...request }));
    this.work = work;
    void work.then(() => { if (this.work === work) this.work = null; }, () => { if (this.work === work) this.work = null; });
    return work;
  }
  private observe(attempt: Attempt, status: XdmcpStatus) {
    if (status.id !== attempt.id || status.phase === "reserved") throw new XdmcpError("invalid_response");
    this.publish({ phase: status.phase, display: status.display, reason: status.reason });
    if (status.phase === "closed" || status.phase === "failed") {
      attempt.id = null;
      return true;
    }
    return false;
  }
  private async execute(attempt: Attempt, request: XdmcpRequest) {
    try {
      const capability = await this.api.capabilities(); this.current(attempt);
      if (!capability.external) throw new XdmcpError("unavailable");
      attempt.id = await this.api.reserve(); this.current(attempt);
      const status = await this.api.start(attempt.id, request); this.current(attempt);
      if (this.observe(attempt, status)) return;
      while (true) {
        await this.pause(); this.current(attempt);
        const statuses = await this.api.status(); this.current(attempt);
        const observed = statuses.find(row => row.id === attempt.id);
        if (!observed) throw new XdmcpError("expired");
        if (this.observe(attempt, observed)) return;
      }
    } catch (error) {
      try { await this.cleanup(attempt); }
      catch (cleanupError) {
        this.publish({ phase: "cleanup_failed", reason: xdmcpFailure(cleanupError) });
        throw new XdmcpError("cleanup_failed");
      }
      this.publish({ phase: attempt.cancelled ? "closed" : "failed", reason: attempt.cancelled ? "cancelled" : xdmcpFailure(error) });
      if (!attempt.cancelled) throw new XdmcpError(xdmcpFailure(error));
    }
  }
  private cleanup(attempt: Attempt): Promise<void> {
    if (attempt.cleanup) return attempt.cleanup;
    if (!attempt.id) return Promise.resolve();
    const id = attempt.id;
    const work = Promise.resolve().then(() => this.api.stop(id)).then(() => { if (attempt.id === id) attempt.id = null; });
    attempt.cleanup = work;
    void work.then(() => { attempt.cleanup = null; }, () => { attempt.cleanup = null; });
    return work;
  }
  cancel(): Promise<void> { return this.stop(); }
  close(): Promise<void> { this.disposed = true; return this.stop(); }
  private stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    const attempt = this.attempt;
    if (!attempt) { this.publish({ phase: "closed" }); return Promise.resolve(); }
    attempt.cancelled = true;
    this.publish({ phase: "stopping" });
    const work = (async () => {
      // stop 先于等待中的 start/status；晚到 reserve 由 execute 负责精确回收。
      await Promise.allSettled([this.cleanup(attempt), this.work]);
      if (attempt.id) {
        this.publish({ phase: "cleanup_failed", reason: "cleanup_failed" });
        throw new XdmcpError("cleanup_failed");
      }
      this.publish({ phase: "closed", reason: "cancelled" });
    })();
    this.stopping = work;
    void work.then(() => { this.stopping = null; }, () => { this.stopping = null; });
    return work;
  }
}
