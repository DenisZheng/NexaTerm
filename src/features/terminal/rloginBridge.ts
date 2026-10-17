import { RLOGIN_MAX_CHUNK, RloginBridgeError } from "./rloginTypes";
import type { RloginAck, RloginBridgeErrorCode, RloginReadReply, RloginReadRequest, RloginResizeRequest,
  RloginStatus, RloginWindow, RloginWriteRequest } from "./rloginTypes";
import { compareRloginCounter, invalidRloginResponse, parseRloginRead, rloginId } from "./rloginWire";
export interface RloginClient {
  read(request: RloginReadRequest): Promise<RloginReadReply>;
  write(request: RloginWriteRequest): Promise<void>;
  resize(request: RloginResizeRequest): Promise<void>;
  close(id: string): Promise<void>;
}
type Pending = { ack: RloginAck; bytes: Uint8Array | null; stage: "ready" | "writing" };
type LocalPhase = "active" | "closing" | "closed" | "close_failed";
const owners = new Set<string>();
// 一个对象只拥有一个reservation generation；重新连接必须新建对象。
export class RloginBridge {
  readonly reservationId: string;
  private phase: LocalPhase="active";
  private error: RloginBridgeErrorCode | null=null;
  private epoch="0";
  private sequence="0";
  private pending: Pending | null=null;
  private ack: RloginAck | null=null;
  private lastStatus: RloginStatus | null=null;
  private reading: Promise<RloginStatus | null> | null=null;
  private writing: Promise<void> | null=null;
  private resizing: Promise<void> | null=null;
  private closing: Promise<void> | null=null;
  constructor(id: string, private readonly client: RloginClient) {
    this.reservationId=rloginId(id);
    if (owners.has(id) || owners.size >= 16) throw new RloginBridgeError("rlogin_bridge_busy");
    owners.add(id);
  }
  snapshot() {
    return {phase:this.phase,error:this.error,epoch:this.epoch,frame:this.pending?.stage ?? null,
      awaitingAck:this.ack !== null,status:this.lastStatus && {...this.lastStatus}};
  }
  poll(): Promise<RloginStatus | null> {
    if (this.phase !== "active") return Promise.resolve(null);
    if (this.reading) return this.reading;
    const work=this.read(); this.reading=work;
    void work.then(() => { this.reading=null; }, () => { this.reading=null; });
    return work;
  }
  private async read(): Promise<RloginStatus | null> {
    const sentEpoch=this.epoch, sentAck=this.ack;
    try {
      const raw=await this.client.read({reservation_id:this.reservationId,epoch:sentEpoch,ack:sentAck && {...sentAck}});
      if (this.phase !== "active") return null;
      const reply=parseRloginRead(raw);
      if (compareRloginCounter(reply.epoch,this.epoch)<0 || reply.requires_reset !== (reply.epoch !== sentEpoch)) throw invalidRloginResponse();
      if (sentAck && this.ack === sentAck) this.ack=null;
      this.epoch=reply.epoch;
      if (reply.requires_reset && this.pending?.stage === "ready") {
        this.ack=this.pending.ack; this.pending=null;
      }
      if (reply.frame) {
        if (this.pending || this.ack || compareRloginCounter(reply.frame.sequence,this.sequence)<=0) throw invalidRloginResponse();
        this.sequence=reply.frame.sequence;
        this.pending={ack:{epoch:reply.frame.epoch,sequence:reply.frame.sequence},bytes:Uint8Array.from(reply.frame.data),stage:"ready"};
      }
      // 未发送的新ACK仍属于backend flight；不得被迟到的无ACK响应清掉。
      if (reply.awaiting_ack !== !!(this.pending || this.ack)) throw invalidRloginResponse();
      const {epoch,phase,reason,awaiting_ack,finished}=reply;
      this.lastStatus={epoch,phase,reason,awaiting_ack,finished};
      if (finished) void this.close().catch(() => {});
      return {...this.lastStatus};
    } catch (error) {
      if (this.phase !== "active") return null;
      const code=error instanceof RloginBridgeError ? error.code : "rlogin_bridge_read_failed";
      this.stop(code); throw new RloginBridgeError(code);
    }
  }
  render(write: (bytes: Uint8Array, onParsed: () => void) => void): boolean {
    const frame=this.pending;
    if (this.phase !== "active" || !frame || frame.stage !== "ready" || !frame.bytes) return false;
    frame.stage="writing"; const bytes=frame.bytes; frame.bytes=null;
    let completed=false;
    try {
      write(bytes, () => {
        if (completed) return; completed=true;
        if (this.phase !== "active" || this.pending !== frame) return;
        this.pending=null; this.ack=frame.ack;
      });
    } catch {
      this.stop("rlogin_bridge_render_failed"); throw new RloginBridgeError("rlogin_bridge_render_failed");
    }
    return true;
  }
  write(bytes: Uint8Array): Promise<void> {
    this.active();
    if (this.writing) return Promise.reject(new RloginBridgeError("rlogin_bridge_busy"));
    if (!(bytes instanceof Uint8Array) || bytes.length>RLOGIN_MAX_CHUNK) return Promise.reject(invalidRloginResponse());
    // 仅一个在途副本；没有隐式字符串转换、输入重放或无限promise链。
    const data=Array.from(bytes);
    const work=Promise.resolve().then(() => {
      this.active(); return this.client.write({reservation_id:this.reservationId,data});
    }).catch(() => {
      if (this.phase === "active") this.stop("rlogin_bridge_write_failed");
      throw new RloginBridgeError(this.phase === "active" ? "rlogin_bridge_write_failed" : this.error ?? "rlogin_bridge_closed");
    });
    this.writing=work; void work.then(() => {this.writing=null;}, () => {this.writing=null;}); return work;
  }
  resize(window: RloginWindow): Promise<void> {
    this.active();
    if (this.resizing) return Promise.reject(new RloginBridgeError("rlogin_bridge_busy"));
    const pinned={...window};
    const work=Promise.resolve().then(() => {
      this.active(); return this.client.resize({reservation_id:this.reservationId,window:pinned});
    }).catch(() => {
      if (this.phase === "active") this.stop("rlogin_bridge_resize_failed");
      throw new RloginBridgeError(this.error ?? "rlogin_bridge_closed");
    });
    this.resizing=work; void work.then(() => {this.resizing=null;}, () => {this.resizing=null;}); return work;
  }
  private active() { if (this.phase !== "active") throw new RloginBridgeError("rlogin_bridge_closed"); }
  private stop(code: RloginBridgeErrorCode) { this.error=code; void this.close().catch(() => {}); }
  close(): Promise<void> {
    if (this.closing) return this.closing;
    if (this.phase === "closed") return Promise.resolve();
    this.phase="closing"; this.pending=null; this.ack=null;
    const issued=[this.reading,this.writing,this.resizing].filter((p): p is Promise<void> | Promise<RloginStatus | null> => p !== null);
    const native=Promise.resolve().then(() => this.client.close(this.reservationId));
    const work=Promise.allSettled([native,...issued]).then(results => {
      if (results[0].status === "rejected") {
        this.phase="close_failed"; this.error ??= "rlogin_bridge_close_failed"; throw new RloginBridgeError("rlogin_bridge_close_failed");
      }
      this.phase="closed"; owners.delete(this.reservationId);
    });
    this.closing=work;
    void work.then(() => {this.closing=null;}, () => {this.closing=null;}); return work;
  }
}
