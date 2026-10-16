# Implementation
Implement pure structured classification and bilingual extracted failure details; wire one error owner and workflow index; test mappings, spoofed raw text, unknown/forward target identity, rendering and reset. Run types/tests/build/lazy/i18n/snapshot/line gates. Update specs/Draft PR63, then automatically continue remaining WF09. No merge/release, manual acceptance deferred.

## Evidence
- Structured classification, destination/jump identity, phase advice, separate safe diagnostic ID and workflow index implemented. Existing Host Key/credential prompts and retry owner preserved.
- Focused21 tests PASS; final mapping includes jump private key errors as authentication. TypeScript noEmit and startup/i18n/snapshot/line/diff gates PASS.
- Local full run had871 PASS/1 todo and3 existing macro UI wait timeouts under concurrent resource load; affected macro suites re-run alone10 PASS. A second reduced-worker full run hit an existing AppActionBar5000ms limit. Local Vite transforms also stalled; stopped remaining local full/build to avoid repeated oversubscription. No test assertion, production timeout or CI gate modified. These local full/build runs are not claimed passing; remote CI is required before closure.
- Baseline1e979de CI #598 all seven executing jobs SUCCESS. New frontend commit CI pending; true GUI/SSH/theme acceptance remains deferred. User authorized continuous remaining WF09 work without per-cut confirmation.
