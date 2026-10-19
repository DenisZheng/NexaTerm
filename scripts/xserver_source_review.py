#!/usr/bin/env python3
"""固定 X0 源码输入的只读核验；成功采集不代表发行批准。"""

import argparse
import hashlib
from http.client import HTTPException
import json
import lzma
import os
from pathlib import Path, PurePosixPath
import subprocess
import tarfile
import tempfile
import time
from urllib.parse import urlsplit
from urllib.request import build_opener, HTTPRedirectHandler


ASSETS = Path(__file__).resolve().parent / "xserver"
MAX_MEMBERS = 2000
MAX_BYTES = 40 * 1024 * 1024
MAX_TAR_BYTES = 42 * 1024 * 1024
MAX_ANCHOR = 1024 * 1024
PENDING = [
    "legacy-signature-algorithms",
    "per-file-and-dependency-licenses",
    "native-windows-build",
    "runtime-imports-and-resources",
    "packaging-signing-and-desktop",
]


class ReviewError(Exception):
    """只携带可写入报告的固定错误码。"""


def require(condition, code):
    if not condition:
        raise ReviewError(code)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def verify_file(path, size, expected):
    require(path.is_file() and path.stat().st_size == size, "INPUT_SIZE")
    hasher = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(65536), b""):
            hasher.update(chunk)
    require(hasher.hexdigest() == expected, "INPUT_SHA256")


def check_url(url):
    parsed = urlsplit(url)
    require(
        parsed.scheme == "https"
        and parsed.netloc == "xorg.freedesktop.org"
        and parsed.path.startswith("/releases/individual/xserver/")
        and not parsed.query and not parsed.fragment,
        "DOWNLOAD_URL",
    )


class OfficialRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, url):
        check_url(url)
        return super().redirect_request(request, response, code, message, headers, url)


def cached_input(cache, item, offline):
    require(Path(item["name"]).name == item["name"], "INPUT_NAME")
    path = cache / item["name"]
    if not path.exists():
        require(not offline, "OFFLINE_INPUT_MISSING")
        check_url(item["url"])
        cache.mkdir(parents=True, exist_ok=True)
        temporary = None
        try:
            deadline = time.monotonic() + 120
            with build_opener(OfficialRedirect()).open(item["url"], timeout=30) as response:
                check_url(response.url)
                with tempfile.NamedTemporaryFile(dir=cache, delete=False) as stream:
                    temporary = Path(stream.name)
                    size = 0
                    while True:
                        require(time.monotonic() < deadline, "DOWNLOAD_TIMEOUT")
                        chunk = response.read(65536)
                        require(time.monotonic() < deadline, "DOWNLOAD_TIMEOUT")
                        if not chunk:
                            break
                        size += len(chunk)
                        require(size <= item["size"], "DOWNLOAD_SIZE")
                        stream.write(chunk)
            verify_file(temporary, item["size"], item["sha256"])
            temporary.replace(path)
        except ReviewError:
            raise
        except (OSError, ValueError, HTTPException) as error:
            raise ReviewError("DOWNLOAD_FAILED") from error
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)
    verify_file(path, item["size"], item["sha256"])
    return path


def run_tool(arguments):
    try:
        result = subprocess.run(
            arguments, capture_output=True, text=True, timeout=30, check=False,
            env={**os.environ, "LC_ALL": "C"},
        )
    except FileNotFoundError as error:
        raise ReviewError("VERIFIER_MISSING") from error
    except subprocess.TimeoutExpired as error:
        raise ReviewError("VERIFIER_TIMEOUT") from error
    require(result.returncode == 0, "VERIFIER_EXIT")
    return result.stdout


def parse_signature_status(output, signing):
    records = [line.split()[1:] for line in output.splitlines() if line.startswith("[GNUPG:] ")]
    # 仅接受已知成功过程状态，未知/错误/过期/撤销状态不能成为成功。
    allowed = {"NEWSIG", "KEY_CONSIDERED", "SIG_ID", "GOODSIG", "VALIDSIG", "TRUST_UNDEFINED", "TRUST_FULLY", "TRUST_ULTIMATE"}
    require(records and all(row and row[0] in allowed for row in records), "SIGNATURE_STATUS")
    valid = [row for row in records if row[0] == "VALIDSIG"]
    good = [row for row in records if row[0] == "GOODSIG"]
    require(len(valid) == 1 and len(good) == 1, "SIGNATURE_COUNT")
    row = valid[0]
    require(len(row) == 11, "SIGNATURE_STATUS")
    require(row[1] == signing["fingerprint"] and row[10] == signing["fingerprint"], "SIGNATURE_SIGNER")
    require(good[0][1] == signing["fingerprint"][-16:], "SIGNATURE_SIGNER")
    require(row[3] == str(signing["signatureEpoch"]) and row[4] == "0", "SIGNATURE_TIME")
    require(row[7:10] == [str(signing["publicKeyAlgorithm"]), str(signing["digestAlgorithm"]), "00"], "SIGNATURE_ALGORITHM")
    return {
        "fingerprint": row[1], "epoch": int(row[3]),
        "publicKeyAlgorithm": int(row[7]), "digestAlgorithm": int(row[8]),
        "keyBits": signing["keyBits"],
    }


def verify_signature(archive, signature, key, signing):
    verify_file(key, signing["keySize"], signing["keySha256"])
    with tempfile.TemporaryDirectory(prefix="nexaterm-x0-gpg-") as home:
        Path(home).chmod(0o700)
        arguments = ["gpg", "--no-options", "--no-autostart", "--batch", "--homedir", home]
        metadata = run_tool(arguments + ["--with-colons", "--show-keys", str(key)])
        public = [row.split(":") for row in metadata.splitlines() if row.startswith("pub:")]
        fingerprints = [row.split(":")[9] for row in metadata.splitlines() if row.startswith("fpr:")]
        require(len(public) == 1 and fingerprints and fingerprints[0] == signing["fingerprint"], "KEY_IDENTITY")
        require(public[0][2:4] == [str(signing["keyBits"]), str(signing["publicKeyAlgorithm"])], "KEY_ALGORITHM")
        keyring = str(Path(home) / "release-key.gpg")
        run_tool(arguments + ["--output", keyring, "--dearmor", str(key)])
        status = run_tool([
            "gpgv", "--homedir", home, "--keyring", keyring, "--status-fd", "1",
            str(signature), str(archive),
        ])
        return parse_signature_status(status, signing)


class ArchiveBudget:
    """同时限制 tar 元数据/填充的实际解压量，而非只统计普通文件。"""

    def __init__(self, stream, limit=None):
        self.stream = stream
        self.remaining = MAX_TAR_BYTES if limit is None else limit

    def read(self, size=-1):
        maximum = self.remaining + 1
        data = self.stream.read(maximum if size < 0 else min(size, maximum))
        self.remaining -= len(data)
        require(self.remaining >= 0, "ARCHIVE_BUDGET")
        return data


def inspect_archive(archive, source):
    with lzma.open(archive, "rb") as raw:
        budget = ArchiveBudget(raw)
        return inspect_tar(budget, source)


def inspect_tar(budget, source):
    inventory, seen = {}, set()
    count, directories, total = 0, 0, 0
    with tarfile.open(fileobj=budget, mode="r|") as tar:
        for member in tar:
            count += 1
            require(count <= MAX_MEMBERS, "ARCHIVE_BUDGET")
            name = member.name.rstrip("/") if member.isdir() else member.name
            path = PurePosixPath(name)
            require(
                name and "\\" not in name and str(path) == name
                and not path.is_absolute() and ".." not in path.parts
                and path.parts[0] == source["root"],
                "ARCHIVE_PATH",
            )
            require(name not in seen, "ARCHIVE_DUPLICATE")
            seen.add(name)
            require(member.isdir() or member.isreg(), "ARCHIVE_TYPE")
            if member.isdir():
                require(member.size == 0, "ARCHIVE_TYPE")
                directories += 1
                continue
            require(len(path.parts) > 1, "ARCHIVE_PATH")
            relative = str(path.relative_to(source["root"]))
            total += member.size
            require(0 <= member.size and total <= MAX_BYTES, "ARCHIVE_BUDGET")
            if relative in source["anchors"]:
                require(member.size <= MAX_ANCHOR, "ARCHIVE_BUDGET")
            hasher = hashlib.sha256()
            stream = tar.extractfile(member)
            require(stream is not None, "ARCHIVE_READ")
            size = 0
            with stream:
                for chunk in iter(lambda: stream.read(65536), b""):
                    size += len(chunk)
                    hasher.update(chunk)
            require(size == member.size, "ARCHIVE_READ")
            inventory[relative] = {"size": size, "sha256": hasher.hexdigest()}
    # tar 会在终止块停止；剩余填充/压缩流仍须计入解压预算并读至 EOF。
    while budget.read(65536):
        pass
    require(
        (count, len(inventory), directories, total)
        == (source["members"], source["regularFiles"], source["directories"], source["regularBytes"]),
        "ARCHIVE_COUNTS",
    )
    require(all(inventory.get(name, {}).get("sha256") == sha for name, sha in source["anchors"].items()), "ARCHIVE_ANCHOR")
    require(all(str(PurePosixPath(source["root"]) / name) not in seen for name in source["absent"]), "ARCHIVE_ABSENT")
    return {"members": count, "regularFiles": len(inventory), "directories": directories, "regularBytes": total, "files": inventory}


def collect(cache, offline):
    manifest_bytes = (ASSETS / "upstream-source.json").read_bytes()
    manifest = json.loads(manifest_bytes)
    require(manifest["schema"] == 1, "MANIFEST_SCHEMA")
    archive = cached_input(cache, manifest["archive"], offline)
    signature = cached_input(cache, manifest["signature"], offline)
    signing = manifest["signing"]
    signature_info = verify_signature(archive, signature, ASSETS / signing["keyFile"], signing)
    inventory = inspect_archive(archive, manifest["source"])
    return {
        "schema": 1, "status": "REVIEW-REQUIRED", "integrityVerified": True,
        "distributionApproved": False, "bundled": False, "pendingReview": PENDING.copy(),
        "component": manifest["component"], "version": manifest["version"],
        "manifestSha256": digest(manifest_bytes),
        "archive": manifest["archive"], "signature": manifest["signature"],
        "verifiedSignature": signature_info, "inventory": inventory,
        "reviewAnchors": manifest["source"]["anchors"],
        "confirmedAbsent": manifest["source"]["absent"],
    }


def write_report(path, report):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, delete=False) as stream:
            temporary = Path(stream.name)
            json.dump(report, stream, indent=2, sort_keys=True)
            stream.write("\n")
        temporary.replace(path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def main(arguments=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache-dir", type=Path)
    parser.add_argument("--offline", action="store_true")
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args(arguments)
    # 先移除旧结果；即使后续原子替换失败，也不能遗留成功报告。
    try:
        args.report.unlink(missing_ok=True)
    except OSError:
        print("FAIL: REPORT_WRITE")
        return 1
    try:
        with tempfile.TemporaryDirectory(prefix="nexaterm-x0-source-") as scratch:
            report = collect(args.cache_dir or Path(scratch), args.offline)
        code = 0
    except (ReviewError, OSError, ValueError, KeyError, IndexError, tarfile.TarError, EOFError, lzma.LZMAError) as error:
        report = {
            "schema": 1, "status": "FAIL", "integrityVerified": False,
            "distributionApproved": False, "bundled": False,
            "error": str(error) if isinstance(error, ReviewError) else "COLLECTION_FAILED",
        }
        code = 1
    try:
        write_report(args.report, report)
    except OSError:
        print("FAIL: REPORT_WRITE")
        return 1
    print(report["status"] + ": " + report.get("error", "SOURCE_INTEGRITY_ONLY"))
    return code


if __name__ == "__main__":
    raise SystemExit(main())
