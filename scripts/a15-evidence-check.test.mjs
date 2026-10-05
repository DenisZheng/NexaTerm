import assert from "node:assert/strict";
import test from "node:test";
import { collectA15Blockers, evaluateA15Evidence, PLATFORM_KEYS } from "./a15-evidence-check.mjs";

function passEvidence() {
  const platform = {
    build:"pass", install:"pass", launch:"pass", brand:"pass", locale:"pass", theme:"pass",
    upgrade:"pass", rollback:"pass", artifactHash:"pass",
  };
  return {
    predecessor:{A09:"pass",A10:"pass"},
    automated:{finalCi:"pass",securityCriticalHigh:"pass",license:"pass"},
    platforms:{
      "windows-x64":{...platform,authenticode:"pass"},
      "macos-arm64":{...platform,developerId:"pass",notarization:"pass"},
      "linux-x64":{...platform},
    },
    migration:{coreAppData:"pass",webviewSettings:"pass",noSilentOverwrite:"pass",vault:"pass",rollback:"pass"},
    performance:{startup:"pass",idleCpu:"pass",memoryVsMxterm:"pass",tenSshWorkload:"pass",resourceRelease:"pass",failureIsolation:"pass"},
    updater:{signedMetadata:"pass",upgrade:"pass",rollbackRecovery:"pass"},
    signoff:{status:"pass"},
  };
}

test("all three required platforms are explicit", () => {
  assert.deepEqual(PLATFORM_KEYS, ["windows-x64","macos-arm64","linux-x64"]);
});

test("A09/A10 remain hard blockers", () => {
  const evidence=passEvidence();
  evidence.predecessor.A09="pending";
  evidence.predecessor.A10="pending";
  const blockers=collectA15Blockers(evidence).map(x=>x.label);
  assert.ok(blockers.some(x=>x.startsWith("A09 ")));
  assert.ok(blockers.some(x=>x.startsWith("A10 ")));
  assert.equal(evaluateA15Evidence(evidence).eligible,false);
});

test("review/pending release or performance evidence blocks signoff", () => {
  const evidence=passEvidence();
  evidence.platforms["macos-arm64"].notarization="pending";
  evidence.performance.memoryVsMxterm="review";
  const result=evaluateA15Evidence(evidence);
  assert.equal(result.eligible,false);
  assert.equal(result.blockers.length,2);
});

test("complete evidence permits explicit pass signoff", () => {
  const result=evaluateA15Evidence(passEvidence());
  assert.equal(result.eligible,true);
  assert.equal(result.validSignoff,true);
  assert.equal(result.blockers.length,0);
});
