import type { XdmcpSessionOwner } from "../xdmcp/XdmcpSessionOwner";

interface Slot { owner: Promise<XdmcpSessionOwner>; closing: Promise<void> | null; closed: boolean; }
export class XdmcpWorkspaceSessions {
  private slots = new Map<string, Slot>();
  private disposed = false;
  constructor(private readonly load = () => import("../xdmcp/xdmcpRuntime")) {}
  activate() { this.disposed = false; }
  open(id: string) {
    if (this.disposed || this.slots.has(id)) throw new Error("xdmcp_unavailable");
    const owner = Promise.resolve().then(() => this.load()).then(runtime => runtime.createXdmcpSession());
    // 模块失败由 get 的面板显示；在面板挂载前关闭也必须观察 rejection。
    void owner.catch(() => undefined);
    this.slots.set(id, { owner, closing: null, closed: false });
  }
  get(id: string) { return this.slots.get(id)?.owner ?? Promise.reject(new Error("xdmcp_expired")); }
  close(id: string): Promise<void> {
    const slot = this.slots.get(id);
    if (!slot) return Promise.resolve();
    if (slot.closing) return slot.closing;
    // 懒模块未能加载时未创建 native owner，允许移除失败的空标签。
    const work = slot.owner.then(owner => owner.close(), () => undefined).then(() => { slot.closed = true; });
    slot.closing = work;
    void work.then(() => { slot.closing = null; }, () => { slot.closing = null; });
    return work;
  }
  forget(id: string) {
    const slot = this.slots.get(id);
    if (slot && !slot.closed) throw new Error("xdmcp_cleanup_failed");
    this.slots.delete(id);
  }
  async dispose() {
    this.disposed = true;
    const slots = [...this.slots];
    const results = await Promise.allSettled(slots.map(async ([id, slot]) => {
      await this.close(id);
      if (this.slots.get(id) === slot) this.forget(id);
    }));
    if (results.some(result => result.status === "rejected")) throw new Error("xdmcp_cleanup_failed");
  }
}
