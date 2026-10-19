#!/usr/bin/env python3
"""在真实Windows UCRT64私有prefix构建固定X server；不批准发行。"""

import argparse
import hashlib
from http.client import HTTPException
import json
import lzma
import os
from pathlib import Path, PurePosixPath
import re
import struct
import subprocess
import tarfile
from urllib.parse import urlsplit
from urllib.request import build_opener, HTTPRedirectHandler

from xserver_source_review import ArchiveBudget, ASSETS, ReviewError, collect, digest, require, verify_file, write_report


MAX_ENTRIES = 5000
MAX_EXPANDED = 80 * 1024 * 1024
SYSTEM_DLLS = {
    "advapi32.dll", "bcrypt.dll", "comctl32.dll", "comdlg32.dll", "crypt32.dll",
    "dwmapi.dll", "gdi32.dll", "imm32.dll", "iphlpapi.dll", "kernel32.dll",
    "msvcrt.dll", "ntdll.dll", "ole32.dll", "oleaut32.dll", "rpcrt4.dll",
    "secur32.dll", "setupapi.dll", "shell32.dll", "shlwapi.dll", "ucrtbase.dll",
    "user32.dll", "userenv.dll", "version.dll", "winmm.dll", "ws2_32.dll",
    "wtsapi32.dll", "normaliz.dll", "dnsapi.dll",
}


def check_source_url(url):
    parsed = urlsplit(url)
    allowed = {"xorg.freedesktop.org": "/releases/individual/", "xcb.freedesktop.org": "/dist/"}
    require(parsed.scheme == "https" and parsed.netloc in allowed and not parsed.query
            and not parsed.fragment and parsed.path.startswith(allowed[parsed.netloc]), "SOURCE_URL")


class SourceRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, url):
        check_source_url(url)
        return super().redirect_request(request, response, code, message, headers, url)


def run(arguments, cwd, *, timeout=900, capture=False):
    print("BUILD:", " ".join(str(a) for a in arguments), flush=True)
    try:
        result = subprocess.run([str(a) for a in arguments], cwd=cwd, text=True,
                                capture_output=capture, timeout=timeout, check=False)
    except subprocess.TimeoutExpired as error:
        raise ReviewError("BUILD_TIMEOUT") from error
    except OSError as error:
        raise ReviewError("BUILD_TOOL") from error
    if result.returncode != 0 and capture:
        print(result.stdout[-4000:], result.stderr[-4000:], flush=True)
    require(result.returncode == 0, "BUILD_EXIT")
    return result.stdout + result.stderr if capture else ""


def download_component(component, cache):
    path = cache / (component["root"] + ".tar.xz")
    if not path.exists():
        check_source_url(component["url"])
        temporary = path.with_suffix(".part")
        try:
            with build_opener(SourceRedirect()).open(component["url"], timeout=30) as response, temporary.open("wb") as output:
                check_source_url(response.url)
                size = 0
                while chunk := response.read(65536):
                    size += len(chunk)
                    require(size <= component["size"], "SOURCE_SIZE")
                    output.write(chunk)
            verify_file(temporary, component["size"], component["sha256"])
            temporary.replace(path)
        finally:
            temporary.unlink(missing_ok=True)
    verify_file(path, component["size"], component["sha256"])
    return path


def extract_component(archive, parent, root, licenses):
    require(not (parent / root).exists(), "SOURCE_ALREADY_EXISTS")
    with lzma.open(archive, "rb") as raw:
        budget = ArchiveBudget(raw, MAX_EXPANDED)
        try:
            return extract_tar(budget, parent, root, licenses)
        except ReviewError as error:
            if str(error) == "ARCHIVE_BUDGET":
                raise ReviewError("SOURCE_BUDGET") from error
            raise


def extract_tar(budget, parent, root, licenses):
    seen, total, anchors = set(), 0, {}
    with tarfile.open(fileobj=budget, mode="r|") as tar:
        for member in tar:
            require(len(seen) < MAX_ENTRIES, "SOURCE_BUDGET")
            name = member.name.rstrip("/") if member.isdir() else member.name
            path = PurePosixPath(name)
            require(name and str(path) == name and not path.is_absolute()
                    and ".." not in path.parts and "\\" not in name
                    and path.parts[0] == root, "SOURCE_PATH")
            require(name not in seen, "SOURCE_DUPLICATE")
            seen.add(name)
            require(member.isdir() or member.isreg(), "SOURCE_TYPE")
            target = parent.joinpath(*path.parts)
            if member.isdir():
                require(member.size == 0, "SOURCE_TYPE")
                target.mkdir(parents=True, exist_ok=True)
                continue
            total += member.size
            require(0 <= member.size and total <= MAX_EXPANDED, "SOURCE_BUDGET")
            target.parent.mkdir(parents=True, exist_ok=True)
            hasher = hashlib.sha256()
            with tar.extractfile(member) as source, target.open("wb") as output:
                for chunk in iter(lambda: source.read(65536), b""):
                    output.write(chunk)
                    hasher.update(chunk)
            target.chmod(0o755 if member.mode & 0o111 else 0o644)
            # Autotools发行归档依赖生成文件的相对时间；保留固定输入元数据。
            os.utime(target, (member.mtime, member.mtime))
            relative = str(path.relative_to(root))
            if relative in licenses:
                require(hasher.hexdigest() == licenses[relative], "SOURCE_LICENSE")
                anchors[relative] = hasher.hexdigest()
    while budget.read(65536):
        pass
    require(anchors == licenses, "SOURCE_LICENSE")
    return {"members": len(seen), "regularBytes": total, "licenseFiles": anchors}


def pe_imports(path, work):
    data = path.read_bytes()
    require(len(data) >= 64 and data[:2] == b"MZ", "PE_HEADER")
    offset = struct.unpack_from("<I", data, 60)[0]
    require(offset + 26 <= len(data) and data[offset:offset + 4] == b"PE\0\0", "PE_HEADER")
    require(struct.unpack_from("<H", data, offset + 4)[0] == 0x8664
            and struct.unpack_from("<H", data, offset + 24)[0] == 0x20B, "PE_ARCHITECTURE")
    output = run(["objdump", "-p", path], work, capture=True)
    imports = re.findall(r"^\s*DLL Name:\s*(\S+)\s*$", output, re.MULTILINE)
    require(imports, "PE_IMPORTS_MISSING")
    require(all(re.fullmatch(r"[A-Za-z0-9_.-]+\.dll", name, re.IGNORECASE) for name in imports), "PE_IMPORT_NAME")
    return sorted(set(name.lower() for name in imports))


def inspect_closure(server, providers, work):
    pending, visited, result = [server], set(), []
    while pending:
        path = pending.pop()
        name = path.name.lower()
        if name in visited:
            continue
        visited.add(name)
        imports = pe_imports(path, work)
        item = {"name": name, "sha256": digest(path.read_bytes()), "size": path.stat().st_size, "imports": imports}
        for dependency in imports:
            require(not dependency.startswith(("cyg", "msys-")), "PE_POSIX_RUNTIME")
            if dependency in SYSTEM_DLLS or dependency.startswith(("api-ms-win-", "ext-ms-win-")):
                continue
            matches = [p for folder in providers for p in folder.iterdir()
                       if p.is_file() and p.name.lower() == dependency]
            require(len(matches) == 1, "PE_PROVIDER")
            pending.append(matches[0])
        result.append(item)
    return sorted(result, key=lambda item: item["name"])


def build(work, report):
    require(os.environ.get("MSYSTEM") == "UCRT64", "WINDOWS_TOOLCHAIN")
    source_manifest = (ASSETS / "windows-sources.json").read_bytes()
    manifest = json.loads(source_manifest)
    report["manifestSha256"] = digest(source_manifest)
    report["recipeSha256"] = digest(Path(__file__).read_bytes())
    cache, sources, builds, prefix = [work / name for name in ["cache", "sources", "build", "prefix"]]
    for directory in [cache, sources, builds, prefix]:
        directory.mkdir(parents=True, exist_ok=True)
    report["stage"] = "verify-server"
    report["serverSource"] = collect(cache, False)
    report["toolchain"] = {
        "gcc": run(["gcc", "--version"], work, capture=True).splitlines()[0],
        "target": run(["gcc", "-dumpmachine"], work, capture=True).strip(),
        "packages": run(["pacman", "-Q"], work, capture=True).splitlines(),
    }
    require(report["toolchain"]["target"] == manifest["target"], "WINDOWS_TARGET")
    os.environ["PATH"] = str(prefix / "bin") + os.pathsep + os.environ["PATH"]
    os.environ["PKG_CONFIG_PATH"] = os.pathsep.join([str(prefix / "lib/pkgconfig"), str(prefix / "share/pkgconfig"), "/ucrt64/lib/pkgconfig", "/ucrt64/share/pkgconfig"])
    os.environ["CC"] = "gcc"
    os.environ["CFLAGS"] = "-O2 -g0 -std=gnu11"
    os.environ["CPPFLAGS"] = "-I" + str(prefix / "include")
    os.environ["LDFLAGS"] = "-L" + str(prefix / "lib")
    os.environ["LIBS"] = "-lpthread -lws2_32"
    os.environ["PYTHON"] = "/usr/bin/python3"
    report["components"] = []
    for component in manifest["components"]:
        report["component"] = component["name"]
        report["stage"] = "source"
        archive = download_component(component, cache)
        evidence = extract_component(archive, sources, component["root"], component["licenseFiles"])
        entry = {**component, "sourceEvidence": evidence, "built": False}
        report["components"].append(entry)
        build_directory = builds / component["name"]
        build_directory.mkdir()
        source = sources / component["root"]
        report["stage"] = "configure"
        if component["buildSystem"] == "meson":
            run(["meson", "setup", build_directory, source, "--prefix=" + str(prefix), "--libdir=lib", "--buildtype=release", "--default-library=shared"], work)
            report["stage"] = "compile-install"
            run(["meson", "compile", "-C", build_directory, "-j", "2"], work)
            run(["meson", "install", "-C", build_directory], work)
        else:
            run(["bash", source / "configure", "--prefix=" + str(prefix), "--host=" + manifest["target"], "--disable-dependency-tracking", *component["options"]], build_directory)
            report["stage"] = "compile-install"
            run(["make", "-j2"], build_directory)
            run(["make", "install"], build_directory)
        entry["built"] = True
        write_report(work / "progress.json", report)
    report["component"] = "xorg-server"
    report["stage"] = "server-source"
    server_manifest = json.loads((ASSETS / "upstream-source.json").read_text())
    root = server_manifest["source"]["root"]
    extract_component(cache / server_manifest["archive"]["name"], sources, root, {"COPYING": server_manifest["source"]["anchors"]["COPYING"]})
    server_build = builds / "xorg-server"
    server_build.mkdir()
    report["stage"] = "server-configure"
    run(["bash", sources / root / "configure", "--prefix=" + str(prefix), "--host=" + manifest["target"], "--disable-dependency-tracking", *manifest["serverOptions"]], server_build)
    core_config = (server_build / "include/dix-config.h").read_text()
    native_config = (server_build / "include/xwin-config.h").read_text()
    require(re.search(r"^#define XDMCP 1$", core_config, re.MULTILINE), "SERVER_XDMCP")
    require(all(re.search(r"^#define " + name + r" 1$", native_config, re.MULTILINE)
                for name in ["HAS_WINSOCK", "RELOCATE_PROJECTROOT"]), "SERVER_NATIVE_CONFIG")
    report["serverConfig"] = {"xdmcp": True, "winsock": True, "relocateProjectRoot": True,
                              "coreSha256": digest(core_config.encode()), "nativeSha256": digest(native_config.encode())}
    report["stage"] = "server-compile"
    run(["make", "-j2"], server_build, timeout=1800)
    run(["make", "install"], server_build)
    server = prefix / "bin/Xming.exe"
    require(server.is_file(), "SERVER_BINARY")
    report["stage"] = "pe-closure"
    report["peClosure"] = inspect_closure(server, [prefix / "bin", Path("/ucrt64/bin")], work)
    report["stage"] = "native-version"
    version = run([server, "-version"], work, timeout=20, capture=True)
    require("21.1.25" in version, "SERVER_VERSION")
    report["nativeVersionVerified"] = True
    report["nativeBuildVerified"] = True
    report["status"] = "REVIEW-REQUIRED"
    report["stage"] = "complete"


def main(arguments=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--work", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args(arguments)
    args.report.unlink(missing_ok=True)
    report = {"schema": 1, "status": "FAIL", "nativeBuildVerified": False,
              "nativeVersionVerified": False, "distributionApproved": False,
              "bundled": False, "desktopVerified": False,
              "pendingReview": ["dependency-signatures", "per-file-licenses-and-generator-exceptions", "compiler-runtime-obligations", "runtime-resources", "packaging-signing-and-desktop"]}
    code = 1
    try:
        args.work.mkdir(parents=True, exist_ok=True)
        require(not any(args.work.iterdir()), "BUILD_WORK_NOT_EMPTY")
        build(args.work.resolve(), report)
        code = 0
    except (ReviewError, OSError, ValueError, KeyError, tarfile.TarError, EOFError, lzma.LZMAError, HTTPException) as error:
        report["error"] = str(error) if isinstance(error, ReviewError) else "BUILD_FAILED"
    write_report(args.report, report)
    print(report["status"], report.get("component"), report.get("stage"), report.get("error", ""))
    return code


if __name__ == "__main__":
    raise SystemExit(main())
