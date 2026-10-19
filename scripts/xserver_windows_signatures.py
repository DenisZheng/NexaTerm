"""固定依赖的离线公钥/签名校验；密码学一致性不等于发行批准。"""

import argparse
from http.client import HTTPException
import json
from pathlib import Path
import re
import tempfile
import time

from xserver_source_review import ASSETS, ReviewError, digest, require, run_tool, verify_file, write_report
from xserver_windows_sources import download_component


class SignatureStatusError(ReviewError):
    def __init__(self, records):
        super().__init__("DEPENDENCY_SIGNATURE_STATUS")
        self.status_kinds = sorted({row[0] if row and re.fullmatch(r"[A-Z_]{1,64}", row[0])
                                    else "INVALID_STATUS" for row in records})


def certificate_keys(output, certificate, signing, now):
    keys, current = {}, None
    for line in output.splitlines():
        row = line.split(":")
        if row[0] in {"pub", "sub"}:
            require(len(row) > 11, "DEPENDENCY_KEY_METADATA")
            current = {"type": row[0], "validity": row[1], "bits": int(row[2]),
                       "algorithm": int(row[3]), "created": int(row[5]),
                       "expires": int(row[6] or 0), "capabilities": row[11]}
        elif row[0] == "fpr" and current is not None:
            require(len(row) > 9 and row[9] not in keys, "DEPENDENCY_KEY_METADATA")
            keys[row[9]] = current
            current = None
    primaries = [fingerprint for fingerprint, key in keys.items() if key["type"] == "pub"]
    require(primaries == [certificate["primaryFingerprint"]], "DEPENDENCY_PRIMARY_KEY")
    require(signing["fingerprint"] in keys, "DEPENDENCY_SIGNING_KEY")
    for fingerprint in {certificate["primaryFingerprint"], signing["fingerprint"]}:
        key = keys[fingerprint]
        require(key["validity"] not in {"r", "e", "d", "i"}
                and key["created"] <= signing["epoch"] <= now
                and (not key["expires"] or key["expires"] > now), "DEPENDENCY_KEY_LIFETIME")
    require(keys[signing["fingerprint"]]["algorithm"] == signing["algorithm"]
            and "s" in keys[signing["fingerprint"]]["capabilities"], "DEPENDENCY_KEY_ALGORITHM")
    require(keys[certificate["primaryFingerprint"]]["bits"] == certificate["primaryBits"]
            and keys[certificate["primaryFingerprint"]]["algorithm"] == certificate["primaryAlgorithm"], "DEPENDENCY_PRIMARY_ALGORITHM")
    return keys


def signature_status(output, certificate, signing, keys):
    records = [line.split()[1:] for line in output.splitlines() if line.startswith("[GNUPG:] ")]
    allowed = {"NEWSIG", "KEY_CONSIDERED", "SIG_ID", "GOODSIG", "VALIDSIG",
               "NOTATION_NAME", "NOTATION_FLAGS", "NOTATION_DATA", "KEYEXPIRED"}
    if not records or not all(row and row[0] in allowed for row in records):
        raise SignatureStatusError(records)
    # 固定证书含旧子钥；仅允许确实属于非当前主钥/签署钥的过期时间提示。
    unrelated_expiries = {str(key["expires"]) for fingerprint, key in keys.items()
                          if fingerprint not in {certificate["primaryFingerprint"], signing["fingerprint"]}
                          and key["expires"]}
    expiry_notes = [row[1:] for row in records if row[0] == "KEYEXPIRED"]
    require(all(len(row) == 1 and row[0] in unrelated_expiries for row in expiry_notes), "DEPENDENCY_EXPIRED_KEY")
    good = [row for row in records if row[0] == "GOODSIG"]
    valid = [row for row in records if row[0] == "VALIDSIG"]
    require(len(good) == len(valid) == 1 and len(valid[0]) == 11, "DEPENDENCY_SIGNATURE_COUNT")
    row = valid[0]
    require(row[1] == signing["fingerprint"] and row[10] == certificate["primaryFingerprint"]
            and len(good[0]) >= 2 and good[0][1] == signing["fingerprint"][-16:], "DEPENDENCY_SIGNATURE_SIGNER")
    require(row[3:5] == [str(signing["epoch"]), "0"], "DEPENDENCY_SIGNATURE_TIME")
    require(row[7:10] == [str(signing["algorithm"]), str(signing["digest"]), "00"], "DEPENDENCY_SIGNATURE_ALGORITHM")
    return {"fingerprint": row[1], "primaryFingerprint": row[10], "epoch": int(row[3]),
            "algorithm": int(row[7]), "digest": int(row[8]),
            "unrelatedExpiredKeyNotes": [int(note[0]) for note in expiry_notes],
            "legacyPrimaryAlgorithm": certificate["primaryAlgorithm"] == 17,
            "legacyDigest": signing["digest"] == 2, "distributionApproved": False}


def verify_dependency(archive, signature, certificate, signing):
    key = ASSETS / certificate["file"]
    verify_file(key, certificate["size"], certificate["sha256"])
    with tempfile.TemporaryDirectory(prefix="nexaterm-x0-dependency-gpg-") as home:
        Path(home).chmod(0o700)
        arguments = ["gpg", "--no-options", "--no-autostart", "--batch", "--homedir", home]
        metadata = run_tool(arguments + ["--with-colons", "--show-keys", str(key)])
        keys = certificate_keys(metadata, certificate, signing, int(time.time()))
        keyring = str(Path(home) / "dependency.gpg")
        run_tool(arguments + ["--output", keyring, "--dearmor", str(key)])
        status = run_tool(["gpgv", "--homedir", home, "--keyring", keyring,
                           "--status-fd", "1", str(signature), str(archive)])
        return signature_status(status, certificate, signing, keys)


def collect_dependencies(cache, offline, report=None):
    raw = (ASSETS / "windows-sources.json").read_bytes()
    manifest = json.loads(raw)
    cache.mkdir(parents=True, exist_ok=True)
    result = []
    if report is not None:
        report.update({"manifestSha256": digest(raw), "components": result})
    for component in manifest["components"]:
        if report is not None:
            report.update({"component": component["name"], "stage": "verify-dependency"})
        root = component["root"]
        signing = component["signature"]
        if offline:
            require((cache / (root + ".tar.xz")).is_file()
                    and (cache / (root + ".tar.xz.sig")).is_file(), "DEPENDENCY_OFFLINE_INPUT")
        archive = download_component(component, cache)
        signature = download_component(signing, cache, root + ".tar.xz.sig")
        certificate = manifest["certificates"][signing["certificate"]]
        result.append({"name": component["name"], "sourceSha256": component["sha256"],
                       "signatureSha256": signing["sha256"], "certificateSha256": certificate["sha256"],
                       **verify_dependency(archive, signature, certificate, signing)})
    return {"manifestSha256": digest(raw), "components": result}


def main(arguments=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--offline", action="store_true")
    args = parser.parse_args(arguments)
    args.report.unlink(missing_ok=True)
    report = {"schema": 1, "status": "FAIL", "dependencySignaturesVerified": False,
              "distributionApproved": False, "bundled": False,
              "pendingReview": ["legacy-signing-algorithms-and-maintainer-identity", "per-file-licenses", "runtime-and-resource-closure"]}
    code = 1
    try:
        report.update(collect_dependencies(args.cache, args.offline, report))
        report.update({"dependencySignaturesVerified": True, "status": "REVIEW-REQUIRED"})
        code = 0
    except (ReviewError, OSError, ValueError, KeyError, HTTPException) as error:
        report["error"] = str(error) if isinstance(error, ReviewError) else "DEPENDENCY_VERIFICATION_FAILED"
        if isinstance(error, SignatureStatusError):
            report["signatureStatusKinds"] = error.status_kinds
    write_report(args.report, report)
    print(report["status"], len(report.get("components", [])), report.get("error", ""))
    if "signatureStatusKinds" in report:
        print("GPG status kinds:", ",".join(report["signatureStatusKinds"]))
    return code


if __name__ == "__main__":
    raise SystemExit(main())
