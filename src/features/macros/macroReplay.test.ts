import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMacroPlan, MACRO_LIMITS, runMacro, type MacroStep } from "./macroReplay";
import type { MultiExecTarget } from "../workspace/multiExec/targets";

const target = (id: string): MultiExecTarget => ({ key: `ssh:${id}`, sessionId: `session-${id}`, title: `Fixture ${id}`, kind: "ssh", tabId: id, ownerId: "fixture", binding: { kind: "ssh", tabId: id } });
const a = target("a"), b = target("b");
function plan(steps: MacroStep[] = [{ command: "pwd", delayMs: 0 }], targets = [a, b]) {
  const created = createMacroPlan(steps, targets); if (!created.plan) throw new Error(created.error); return created.plan;
}
function fixture() {
  const live = new Map([a, b].map((item) => [item.key, item]));
  const runtime = { resolveTarget: (key: string) => live.get(key) ?? null, write: vi.fn(async (_session: string, _command: string) => {}) };
  return { runtime, live, controller: new AbortController() };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe("macro preview", () => {
  it("copies and freezes exact commands and concrete session identities", () => {
    const steps = [{ command: "  printf 'fixture'\n pwd  ", delayMs: 120 }]; const targets = [{ ...a }];
    const preview = plan(steps, targets); steps[0].command = "changed"; targets[0].sessionId = "new-session";
    expect(preview.steps[0].command).toBe("  printf 'fixture'\n pwd  "); expect(preview.targets[0].sessionId).toBe(a.sessionId);
    expect(Object.isFrozen(preview.steps[0])).toBe(true); expect(Object.isFrozen(preview.targets)).toBe(true);
  });
  it("requires explicit distinct sessions and bounded steps", () => {
    expect(createMacroPlan([], [a]).error).toBe("steps");
    expect(createMacroPlan(Array.from({ length: 21 }, () => ({ command: "pwd", delayMs: 0 })), [a]).error).toBe("steps");
    for (const targets of [[], [a, a], [a, { ...b, sessionId: a.sessionId }], Array.from({ length: 21 }, (_, i) => target(String(i)))])
      expect(createMacroPlan([{ command: "pwd", delayMs: 0 }], targets).error).toBe("targets");
  });
  it("rejects hidden controls, blank commands and byte limits, allowing multiline text", () => {
    for (const command of ["  ", "pwd\r", "\x1b[31mpwd", "\u009b31mpwd", "\0", "密".repeat(5500)])
      expect(createMacroPlan([{ command, delayMs: 0 }], [a]).error).toBe("command");
    expect(createMacroPlan(Array.from({ length: 5 }, () => ({ command: "x".repeat(15000), delayMs: 0 })), [a]).error).toBe("command");
    expect(createMacroPlan([{ command: "printf '\tfixture'\npwd", delayMs: 0 }], [a]).plan).toBeDefined();
  });
  it("validates integer delay and total waiting budget", () => {
    for (const delayMs of [-1, 0.5, NaN, Infinity, 60001]) expect(createMacroPlan([{ command: "pwd", delayMs }], [a]).error).toBe("delay");
    expect(createMacroPlan(Array.from({ length: 6 }, () => ({ command: "pwd", delayMs: 60000 })), [a]).error).toBe("delay");
  });
});

describe("macro replay", () => {
  it("writes steps and targets in order after the reviewed delay, preserving text", async () => {
    const { runtime, controller, live } = fixture();
    const run = runMacro(plan([{ command: " pwd ", delayMs: 200 }, { command: "whoami", delayMs: 300 }]), runtime, controller.signal);
    live.set("ssh:new", target("new"));
    await vi.advanceTimersByTimeAsync(199); expect(runtime.write).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); expect(runtime.write.mock.calls).toEqual([[a.sessionId, " pwd \r"], [b.sessionId, " pwd \r"]]);
    await vi.advanceTimersByTimeAsync(300); expect((await run).status).toBe("completed");
    expect(runtime.write.mock.calls.slice(2)).toEqual([[a.sessionId, "whoami\r"], [b.sessionId, "whoami\r"]]); expect(vi.getTimerCount()).toBe(0);
  });
  it("rechecks the whole target set before starting any writes", async () => {
    const { runtime, live, controller } = fixture(); live.delete(b.key);
    const result = await runMacro(plan(), runtime, controller.signal);
    expect(result.deliveries).toEqual([{ step: 0, key: b.key, status: "disconnected" }]); expect(runtime.write).not.toHaveBeenCalled();
  });
  it("does not hand a delayed write to a reconnected session", async () => {
    const { runtime, live, controller } = fixture(); const run = runMacro(plan([{ command: "pwd", delayMs: 500 }]), runtime, controller.signal);
    live.set(a.key, { ...a, sessionId: "replacement" }); await vi.advanceTimersByTimeAsync(500);
    expect((await run).status).toBe("failed"); expect(runtime.write).not.toHaveBeenCalled();
  });
  it("stops after a failed target without persisting or returning the native error", async () => {
    const { runtime, controller } = fixture(); runtime.write.mockRejectedValueOnce(new Error("synthetic-secret-marker"));
    const run = runMacro(plan([{ command: "pwd", delayMs: 0 }, { command: "whoami", delayMs: 0 }]), runtime, controller.signal);
    await vi.runAllTimersAsync(); const result = await run;
    expect(result.status).toBe("failed"); expect(runtime.write).toHaveBeenCalledTimes(1); expect(JSON.stringify(result)).not.toContain("synthetic-secret-marker");
  });
  it("cancels waiting and clears its timer", async () => {
    const { runtime, controller } = fixture(); const run = runMacro(plan([{ command: "pwd", delayMs: 500 }]), runtime, controller.signal);
    controller.abort(); expect((await run).status).toBe("cancelled"); expect(vi.getTimerCount()).toBe(0); expect(runtime.write).not.toHaveBeenCalled();
  });
  it("cancels remaining writes while retaining an already submitted write outcome", async () => {
    const { runtime, controller } = fixture(); let finish!: () => void;
    runtime.write.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const run = runMacro(plan(), runtime, controller.signal); await vi.advanceTimersByTimeAsync(0); controller.abort(); finish();
    const result = await run; expect(result.status).toBe("cancelled"); expect(result.deliveries[0].status).toBe("written"); expect(runtime.write).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  });
  it("reports timeout as uncertain and never sends the next step or retries late writes", async () => {
    const { runtime, controller } = fixture(); let reject!: (error: Error) => void;
    runtime.write.mockImplementationOnce(() => new Promise<void>((_, fail) => { reject = fail; }));
    const run = runMacro(plan(), runtime, controller.signal); await vi.advanceTimersByTimeAsync(MACRO_LIMITS.writeTimeoutMs);
    const result = await run; expect(result.deliveries[0].status).toBe("timed_out"); reject(new Error("late synthetic failure"));
    await Promise.resolve(); expect(runtime.write).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  });
});
