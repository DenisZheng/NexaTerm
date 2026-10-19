# X server source review inputs (X0)

## 1. Scope

`scripts/xserver_source_review.py` collects fixed upstream source evidence for X0. It never extracts, builds, executes or distributes the upstream implementation. This is independent of the application runner and does not enable any bundled/desktop capability. No license-policy exemption is introduced.

## 2. Signatures and entry points

`python scripts/xserver_source_review.py --cache-dir <scratch> --report <json>` loads only the repository's `scripts/xserver/upstream-source.json` and public release key. Cache defaults to a temporary directory; `--offline` requires the exact cached archive/signature. No CLI URL, key, algorithm or approval override exists.

`verify_signature(archive, signature, key, signing)` runs isolated `gpg --no-options --no-autostart --batch --dearmor`, then `gpgv`; no agent/keyserver/trust-store lookup or weak-crypto override. `inspect_archive(archive, source)` streams regular-file hashes and checks fixed file anchors, never extracts files.

## 3. Data and resource contract

- Fixed HTTPS archive/signature URLs on `xorg.freedesktop.org`, exact byte sizes and SHA256 before parsing; redirects outside that host fail. Downloads use a 30-second socket timeout and a 120-second budget checked before/after reads (a blocked socket read can run until its timeout), with atomic cache replacement. Invalid existing cache fails instead of silently replacing evidence.
- Public key SHA256, full signing/primary fingerprints, signature algorithms and signature epoch must match the manifest. Exactly one `VALIDSIG`, one `GOODSIG`, exit zero and no error/revoked/expired status are required. GPG subprocess budget: 30 seconds each.
- Archive budget: 2,000 entries, 40 MiB total regular bytes, 42 MiB actual decompressed tar including metadata/padding, 1 MiB selected review file; canonical paths under exactly `xorg-server-21.1.25`, no duplicate paths, links, devices or traversal. Read through archive end and require pinned member/file/directory counts, byte total and selected file hashes. All regular-file hashes enter the report; no source text is emitted.
- Report schema 1: `status=REVIEW-REQUIRED`, `integrityVerified=true`, `distributionApproved=false`, `bundled=false`. Signature DSA-1024/SHA-1 is recorded as a pending cryptographic review, never silently upgraded to approval. A verified source archive does not prove native compilation, dependency/license closure, runtime imports, packaging or desktop success.
- A failed attempt replaces an old report with `FAIL`, `integrityVerified=false` and a fixed error code. No raw subprocess output, identity, local paths, credentials or source text enter reports. Artifact upload allows only the report JSON.

## 4. Error matrix

| Input/result | Report | Exit |
| --- | --- | --- |
| Exact files, signature and archive structure verified | REVIEW-REQUIRED | 0 (collection only) |
| Missing offline cache, bad hash/size, redirected URL, download failure | FAIL | 1 |
| Missing tool, timeout, nonzero GPG exit, mismatched/expired/revoked signature | FAIL | 1 |
| Invalid archive path/type, duplicate, budget/count/anchor mismatch | FAIL | 1 |
| Cannot write fresh report | No successful report | 1 |

## 5. Good / base / bad

Good: official fixed source and detached signature, pinned public key, real `gpgv` verification and bounded complete inventory produce review inputs. Base: repeat offline with exact cached inputs gives identical source inventory. Bad: a previously successful report plus corrupt cache or failed verifier must become FAIL, including a verifier that prints VALIDSIG but exits nonzero.

## 6. Validation

Unit tests exercise cache corruption, output/status failures, wrong signer/algorithms/time, path traversal/links/duplicates/expansion limits, changed file anchors, stale reports and mandatory pending approval. Dedicated CI runs those tests and the real upstream/GPG integration on Ubuntu, with read-only checkout and JSON-only artifacts. A mock status test is not signature verification evidence.

## 7. Wrong / correct

Wrong: treat valid OpenPGP integrity or a Windows build target as permission to distribute an entire dependency tree; use `--allow-weak-*`, disable a verifier or execute downloaded build scripts during this collection step.

Correct: fail closed on collection errors, retain explicit legacy-crypto/license/build review items, pin all inputs and inspect actual build outputs in the next phase before adopting a component.
