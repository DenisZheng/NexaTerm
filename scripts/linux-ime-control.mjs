// Control the native daemons, independently of WebView/page readiness.
// Ubuntu 22.04 ships IBus 1.5.26 and Fcitx5 5.0.14. In those versions:
// - Fcitx State=0 is normal before any input context has received focus.
// - `ibus engine NAME` also runs optional setxkbmap work AFTER SetGlobalEngine;
//   a default-layout engine can therefore be selected yet produce exit 1.
// Use the actual D-Bus control interfaces and independently verify activation.

const busName = "org.freedesktop.DBus";
const fcitxInterface = "org.fcitx.Fcitx.Controller1";

function dbusCall(run, bus, destination, objectPath, method, args = []) {
  const output = run("dbus-send", [
    bus, "--print-reply", "--reply-timeout=3000", `--dest=${destination}`,
    objectPath, method, ...args,
  ]);
  if (!/^method return(?:\s|$)/.test(output)) {
    throw new Error(`Unexpected D-Bus reply for ${method}: ${JSON.stringify(output)}`);
  }
  return output.split(/\r?\n/).slice(1).join("\n").trim();
}

function stringReply(body, description) {
  const match = /^string "([^"\\\r\n]*)"$/.exec(body);
  if (!match) throw new Error(`Invalid ${description}: ${JSON.stringify(body)}`);
  return match[1];
}

function fcitxOwner(run) {
  // Query the bus itself, not the activatable Fcitx service. Calling
  // fcitx5-remote before our child owns the name can start a competing daemon.
  const owner = stringReply(dbusCall(run, "--session", busName,
    "/org/freedesktop/DBus", `${busName}.GetNameOwner`, ["string:org.fcitx.Fcitx5"]), "Fcitx owner");
  if (!/^:[A-Za-z0-9_.-]+$/.test(owner)) throw new Error(`Invalid Fcitx unique owner: ${owner}`);
  return owner;
}

function fcitxCall(run, owner, method, args) {
  // Address the unique owner, so even a death between probes cannot activate
  // another daemon through the well-known name. Process health is also checked.
  return dbusCall(run, "--session", owner, "/controller", `${fcitxInterface}.${method}`, args);
}

function fcitxState(run, owner) {
  const body = fcitxCall(run, owner, "State");
  const match = /^int32 ([012])$/.exec(body);
  if (!match) throw new Error(`Invalid Fcitx State reply: ${JSON.stringify(body)}`);
  return Number(match[1]);
}

export function inputMethodReady(engine, run) {
  if (engine === "ibus") {
    if (!/^libpinyin$/m.test(run("ibus", ["list-engine", "--name-only"]))) {
      throw new Error("IBus libpinyin is not registered yet");
    }
    return { engine: "libpinyin" };
  }
  if (engine === "fcitx5") {
    const owner = fcitxOwner(run);
    // State 0 is valid daemon readiness, NEVER successful activation.
    return { owner, state: fcitxState(run, owner) };
  }
  throw new Error(`Unsupported input method: ${engine}`);
}

export function activateInputMethod(engine, run) {
  if (engine === "ibus") {
    const address = run("ibus", ["address"]);
    if (!address) throw new Error("IBus returned an empty bus address");
    // Use IBus's PRIVATE bus, not the desktop session bus. This calls the same
    // SetGlobalEngine API as the CLI, without its unrelated XKB-layout step.
    // A failed D-Bus call still throws; there is no ignored exit status/fallback.
    dbusCall(run, `--bus=${address}`, "org.freedesktop.IBus", "/org/freedesktop/IBus",
      "org.freedesktop.IBus.SetGlobalEngine", ["string:libpinyin"]);
    const current = run("ibus", ["engine"]);
    if (current !== "libpinyin") throw new Error(`IBus engine readback: ${JSON.stringify(current)}`);
    return { engine: current };
  }
  if (engine === "fcitx5") {
    const owner = fcitxOwner(run);
    if (fcitxState(run, owner) === 0) throw new Error("Fcitx has no focused input context yet (state=0)");
    fcitxCall(run, owner, "SetCurrentIM", ["string:pinyin"]);
    fcitxCall(run, owner, "Activate");
    const state = fcitxState(run, owner);
    // CurrentInputMethod is supported by 5.0.14; fcitx5-remote -n is newer.
    const current = stringReply(fcitxCall(run, owner, "CurrentInputMethod"), "Fcitx input method");
    if (state !== 2 || current !== "pinyin") {
      throw new Error(`Fcitx activation readback: state=${state}, engine=${JSON.stringify(current)}`);
    }
    return { owner, state, engine: current };
  }
  throw new Error(`Unsupported input method: ${engine}`);
}
