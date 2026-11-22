import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { activateInputMethod, inputMethodReady } from "./linux-ime-control.mjs";
import { waitFor } from "./linux-ime-smoke.mjs";

const reply = (body = "") => `method return time=123.0 sender=:1.7 -> destination=:1.8 serial=9 reply_serial=2\n   ${body}`;
const busName = "org.freedesktop.DBus";
const fcitxInterface = "org.fcitx.Fcitx.Controller1";

function fcitxDouble({ states = [0], current = "pinyin", owner = ":1.7", fail, malformed } = {}) {
  const calls = [];
  let stateIndex = 0;
  const run = (command, args) => {
    calls.push([command, args]);
    assert.equal(command, "dbus-send");
    assert.deepEqual(args.slice(0, 3), ["--session", "--print-reply", "--reply-timeout=3000"]);
    const method = args[5];
    if (fail === method) throw new Error(`D-Bus failed: ${method}`);
    if (malformed?.method === method) return malformed.output;
    if (method === `${busName}.GetNameOwner`) {
      assert.deepEqual(args.slice(3), [`--dest=${busName}`, "/org/freedesktop/DBus", method, "string:org.fcitx.Fcitx5"]);
      return reply(`string "${owner}"`);
    }
    assert.equal(args[3], `--dest=${owner}`);
    assert.equal(args[4], "/controller");
    switch (method) {
      case `${fcitxInterface}.State`:
        return reply(`int32 ${states[Math.min(stateIndex++, states.length - 1)]}`);
      case `${fcitxInterface}.CurrentInputMethod`: return reply(`string "${current}"`);
      case `${fcitxInterface}.SetCurrentIM`:
        assert.deepEqual(args.slice(6), ["string:pinyin"]);
        return reply();
      case `${fcitxInterface}.Activate`: return reply();
      default: assert.fail(`Unexpected method ${method}`);
    }
  };
  return { run, calls };
}

function ibusDouble({ address = "unix:abstract=/tmp/ibus-private", current = "libpinyin", setError, setReply = reply() } = {}) {
  const calls = [];
  const run = (command, args) => {
    calls.push([command, args]);
    if (command === "ibus") {
      if (args[0] === "address") return address;
      assert.deepEqual(args, ["engine"], "must not call the CLI engine setter with its XKB side effect");
      return current;
    }
    assert.equal(command, "dbus-send");
    assert.deepEqual(args, [
      `--bus=${address}`, "--print-reply", "--reply-timeout=3000", "--dest=org.freedesktop.IBus",
      "/org/freedesktop/IBus", "org.freedesktop.IBus.SetGlobalEngine", "string:libpinyin",
    ]);
    if (setError) throw setError;
    return setReply;
  };
  return { run, calls };
}

for (const state of [0, 1, 2]) {
  test(`Fcitx daemon readiness accepts state ${state} after finding an existing owner`, () => {
    const fake = fcitxDouble({ states: [state] });
    assert.deepEqual(inputMethodReady("fcitx5", fake.run), { owner: ":1.7", state });
    assert.equal(fake.calls.length, 2);
  });
}

test("missing Fcitx owner cannot pass readiness or auto-activate a daemon", () => {
  const fake = fcitxDouble({ fail: `${busName}.GetNameOwner` });
  assert.throws(() => inputMethodReady("fcitx5", fake.run), /GetNameOwner/);
  assert.equal(fake.calls.length, 1);
});

test("a disappearing unique owner is a failure, not an activation through a well-known name", () => {
  const fake = fcitxDouble({ fail: `${fcitxInterface}.State` });
  assert.throws(() => inputMethodReady("fcitx5", fake.run), /State/);
  assert.equal(fake.calls[1][1][3], "--dest=:1.7");
});

for (const output of [reply("int32 9"), reply('string "0"'), "0", ""]) {
  test(`malformed Fcitx state cannot be mistaken for readiness: ${JSON.stringify(output)}`, () => {
    const fake = fcitxDouble({ malformed: { method: `${fcitxInterface}.State`, output } });
    assert.throws(() => inputMethodReady("fcitx5", fake.run), /Invalid Fcitx State|Unexpected D-Bus reply/);
  });
}

test("a well-known name is not accepted as Fcitx's unique owner", () => {
  assert.throws(() => inputMethodReady("fcitx5", fcitxDouble({ owner: "org.fcitx.Fcitx5" }).run), /unique owner/);
});

test("state zero is daemon-ready but not Chinese-input-ready", () => {
  const fake = fcitxDouble();
  assert.throws(() => activateInputMethod("fcitx5", fake.run), /no focused input context.*state=0/);
  assert.equal(fake.calls.length, 2);
});

test("Fcitx activation requires both active state and pinyin readback", () => {
  const fake = fcitxDouble({ states: [1, 2] });
  assert.deepEqual(activateInputMethod("fcitx5", fake.run), { owner: ":1.7", state: 2, engine: "pinyin" });
  assert.equal(fake.calls.length, 6);
});

for (const options of [{ states: [1, 1] }, { states: [1, 2], current: "keyboard-us" }]) {
  test(`incorrect Fcitx activation fails: ${JSON.stringify(options)}`, () => {
    assert.throws(() => activateInputMethod("fcitx5", fcitxDouble(options).run), /activation readback/);
  });
}

test("a genuine Fcitx activation error is not ignored", () => {
  const fake = fcitxDouble({ states: [1], fail: `${fcitxInterface}.Activate` });
  assert.throws(() => activateInputMethod("fcitx5", fake.run), /D-Bus failed.*Activate/);
});

test("activation is retried when the input context becomes focused", async () => {
  const fake = fcitxDouble({ states: [0, 1, 2] });
  let tick = 0;
  const result = await waitFor(() => activateInputMethod("fcitx5", fake.run), "activation", 10, {
    now: () => tick, pause: async () => { tick += 1; }, intervalMs: 1,
  });
  assert.equal(result.engine, "pinyin");
  assert.equal(fake.calls.filter(([, args]) => args[5].endsWith("SetCurrentIM")).length, 1);
});

test("IBus uses SetGlobalEngine on its private bus, not the XKB-coupled CLI setter", () => {
  const fake = ibusDouble();
  assert.deepEqual(activateInputMethod("ibus", fake.run), { engine: "libpinyin" });
  assert.equal(fake.calls.length, 3);
});

test("IBus D-Bus errors remain failures even when readback would already match", () => {
  const fake = ibusDouble({ setError: new Error("SetGlobalEngine failed") });
  assert.throws(() => activateInputMethod("ibus", fake.run), /SetGlobalEngine failed/);
  assert.equal(fake.calls.length, 2);
});

test("IBus success without libpinyin readback is not activation", () => {
  assert.throws(() => activateInputMethod("ibus", ibusDouble({ current: "xkb:us::eng" }).run), /engine readback/);
});

test("an empty IBus address cannot silently use the session bus", () => {
  const fake = ibusDouble({ address: "" });
  assert.throws(() => activateInputMethod("ibus", fake.run), /empty bus address/);
  assert.equal(fake.calls.length, 1);
});

test("malformed IBus replies are not success", () => {
  assert.throws(() => activateInputMethod("ibus", ibusDouble({ setReply: "" }).run), /Unexpected D-Bus reply/);
});

test("IBus registration probes exact engine names", () => {
  const run = (command, args) => {
    assert.equal(command, "ibus");
    assert.deepEqual(args, ["list-engine", "--name-only"]);
    return "xkb:us::eng\nlibpinyin\nxkb:de::ger";
  };
  assert.deepEqual(inputMethodReady("ibus", run), { engine: "libpinyin" });
  assert.throws(() => inputMethodReady("ibus", () => "not-libpinyin"), /not registered/);
});

test("unsupported engines fail closed", () => {
  assert.throws(() => inputMethodReady("other", () => assert.fail()), /Unsupported/);
  assert.throws(() => activateInputMethod("other", () => assert.fail()), /Unsupported/);
});

test("native runner uses the tested control helpers inside bounded polls", () => {
  const source = readFileSync(new URL("./linux-ime-smoke.mjs", import.meta.url), "utf8");
  assert.match(source, /poll\(\(\) => inputMethodReady\(engine, run\)/);
  assert.match(source, /poll\(\(\) => activateInputMethod\(engine, run\)/);
  assert.doesNotMatch(source, /run\("ibus", \["engine", "libpinyin"\]\)/);
  assert.doesNotMatch(source, /run\("fcitx5-remote"/);
  for (const kind of ["compositionstart", "compositionupdate", "compositionend"]) assert.ok(source.includes(kind));
  assert.match(source, /data\.includes\(expected\)/);
});
