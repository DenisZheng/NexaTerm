import { describe, expect, it } from "vitest";
import { createMacroRecorder } from "./macroRecorder";
import { createMacroPlan } from "./macroReplay";
import type { MultiExecTarget } from "../workspace/multiExec/targets";

const a: MultiExecTarget = { key: "ssh:a", sessionId: "fixture-a", title: "Fixture A", kind: "ssh", tabId: "a", ownerId: "fixture", binding: { kind: "ssh", tabId: "a" } };
const b = { ...a, key: "ssh:b", sessionId: "fixture-b", title: "Fixture B" };
function fixture() {
  let now = 0; const live = new Map([a, b].map((target) => [target.key, target]));
  const recorder = createMacroRecorder((key) => live.get(key) ?? null, () => now);
  return { recorder, live, setTime: (value: number) => { now = value; } };
}

describe("explicit command recording", () => {
  it("starts only for a current explicitly provided source, without implicit target selection", () => {
    const { recorder } = fixture(); expect(recorder.begin("pwd", true, [a.key])).toBeNull();
    expect(recorder.start({ ...a, sessionId: "stale" })).toBe(false);
    expect(recorder.start(a)).toBe(true); expect(recorder.begin("pwd", true, [b.key])).toBeNull(); expect(recorder.getSnapshot().steps).toEqual([]);
  });
  it("records exact successful commands and delays in submission order despite out-of-order completion", () => {
    const { recorder, setTime } = fixture(); recorder.start(a);
    const first = recorder.begin(" pwd ", true, [a.key]); setTime(350); const second = recorder.begin("whoami", true, [a.key]);
    recorder.finish(second, true); expect(recorder.getSnapshot().steps).toEqual([]);
    recorder.finish(first, true); expect(recorder.getSnapshot().steps).toEqual([{ command: " pwd ", delayMs: 0 }, { command: "whoami", delayMs: 350 }]);
    recorder.finish(first, true); expect(recorder.getSnapshot().steps).toHaveLength(2);
  });
  it("pauses at sensitive submission before acknowledgement and retains only a masked empty placeholder", () => {
    const { recorder } = fixture(); recorder.start(a);
    const ticket = recorder.begin("export TOKEN=synthetic-secret-marker", true, [a.key]);
    expect(recorder.getSnapshot().recording).toBe(false); expect(recorder.begin("synthetic-secret-marker", true, [a.key])).toBeNull();
    expect(JSON.stringify(recorder.getSnapshot())).not.toContain("synthetic-secret-marker");
    recorder.finish(ticket, true); expect(recorder.getSnapshot().steps).toEqual([{ command: "", delayMs: 0, masked: true }]);
    expect(createMacroPlan(recorder.getSnapshot().steps, [a]).error).toBe("sensitive");
  });
  it("does not retain raw command text in its async ticket", () => {
    const { recorder } = fixture(); recorder.start(a); const ticket = recorder.begin("printf 'fixture-marker'", true, [a.key]);
    expect(JSON.stringify(ticket)).not.toContain("fixture-marker");
  });
  it("keeps source-scoped history suppression through stop until clear, without suppressing another source", () => {
    const { recorder } = fixture(); recorder.start(a); recorder.begin("sudo id", true, [a.key]); recorder.stop();
    expect(recorder.omitAutomaticHistory([a.key])).toBe(true); expect(recorder.omitAutomaticHistory([b.key])).toBe(false);
    recorder.clear(); expect(recorder.omitAutomaticHistory([a.key])).toBe(false);
  });
  it("does not create a placeholder for a sensitive write that failed", () => {
    const { recorder } = fixture(); recorder.start(a); const ticket = recorder.begin("passwd", true, [a.key]); recorder.finish(ticket, false);
    expect(recorder.getSnapshot().steps).toEqual([]); expect(recorder.getSnapshot().reason).toBe("failed");
  });
  it("stops on partial sends and does not combine them into a later command", () => {
    const { recorder } = fixture(); recorder.start(a); expect(recorder.begin("partial", false, [a.key])).toBeNull();
    expect(recorder.getSnapshot().reason).toBe("partial"); expect(recorder.begin("Enter", true, [a.key])).toBeNull();
  });
  it("revokes pending tickets across stop, clear and restart", () => {
    const { recorder } = fixture(); recorder.start(a); const old = recorder.begin("pwd", true, [a.key]); recorder.stop(); recorder.start(b);
    recorder.finish(old, true); expect(recorder.getSnapshot().steps).toEqual([]);
    const current = recorder.begin("whoami", true, [b.key]); recorder.clear(); recorder.finish(current, true); expect(recorder.getSnapshot().source).toBeNull();
  });
  it("stops before admitting a disconnected or reconnected source", () => {
    const { recorder, live } = fixture(); recorder.start(a); const ticket = recorder.begin("pwd", true, [a.key]);
    live.set(a.key, { ...a, sessionId: "replacement" }); recorder.finish(ticket, true);
    expect(recorder.getSnapshot().reason).toBe("disconnected"); expect(recorder.getSnapshot().steps).toEqual([]); expect(recorder.begin("whoami", true, [a.key])).toBeNull();
  });
  it("preserves prior confirmed steps when a source disappears", () => {
    const { recorder, live } = fixture(); recorder.start(a); recorder.finish(recorder.begin("pwd", true, [a.key]), true); live.delete(a.key); recorder.reconcile();
    expect(recorder.getSnapshot().recording).toBe(false); expect(recorder.getSnapshot().steps).toHaveLength(1);
  });
  it("bounds unresolved requests and prevents the twenty-first step", () => {
    const { recorder } = fixture(); recorder.start(a);
    const pending = Array.from({ length: 20 }, () => recorder.begin("pwd", true, [a.key]));
    expect(recorder.begin("whoami", true, [a.key])).toBeNull(); expect(recorder.getSnapshot().reason).toBe("limit");
    pending.forEach((ticket) => recorder.finish(ticket, true)); expect(recorder.getSnapshot().steps).toEqual([]);
  });
  it("stops at byte and delay budgets without silently truncating command or wait", () => {
    const { recorder, setTime } = fixture(); recorder.start(a); expect(recorder.begin("密".repeat(5500), true, [a.key])).toBeNull();
    recorder.start(a); recorder.finish(recorder.begin("pwd", true, [a.key]), true); setTime(60001); recorder.finish(recorder.begin("whoami", true, [a.key]), true);
    expect(recorder.getSnapshot().steps).toEqual([{ command: "pwd", delayMs: 0 }]); expect(recorder.getSnapshot().reason).toBe("limit");
  });
  it("freezes public snapshots and releases subscription/owner state on dispose", () => {
    const { recorder } = fixture(); let changes = 0; const unsubscribe = recorder.subscribe(() => { changes += 1; }); recorder.start(a);
    expect(Object.isFrozen(recorder.getSnapshot())).toBe(true); unsubscribe(); const before = changes; recorder.dispose(); expect(changes).toBe(before); expect(recorder.getSnapshot().source).toBeNull();
  });
  it("enforces aggregate bytes and aggregate delay while keeping prior confirmed steps", () => {
    const { recorder, setTime } = fixture(); recorder.start(a);
    for (let i = 0; i < 4; i++) recorder.finish(recorder.begin("x".repeat(15000), true, [a.key]), true);
    expect(recorder.begin("x".repeat(15000), true, [a.key])).toBeNull(); expect(recorder.getSnapshot().steps).toHaveLength(4);
    recorder.start(a);
    for (let i = 0; i < 7; i++) { setTime(i * 60000); recorder.finish(recorder.begin("pwd", true, [a.key]), true); }
    expect(recorder.getSnapshot().steps).toHaveLength(6); expect(recorder.getSnapshot().reason).toBe("limit");
    expect(recorder.getSnapshot().steps[5].delayMs).toBe(60000);
  });
});
