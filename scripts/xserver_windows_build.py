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
import subprocess
import sys
import tarfile

from xserver_source_review import ArchiveBudget, ASSETS, ReviewError, collect, digest, require, verify_file, write_report
from xserver_windows_inventory import InventoryCollision, add_runtime_provenance, installed_delta, link_inputs, native_header_evidence, package_evidence, snapshot
from xserver_windows_pe import MAX_PE_BYTES, parse_pe
from xserver_windows_signatures import verify_dependency
from xserver_windows_sources import check_source_url, download_component
from xserver_windows_compilation import observed_inputs
from xserver_windows_probes import font_probe, header_probes, poll_probe, xcb_probe
from xserver_windows_linker import linker_probe
from xserver_windows_linkmap import memory_inputs
from xserver_windows_archives import selected_members
from xserver_windows_xkb import configured_paths, runtime_inventory, xkb_probe
from xserver_windows_private_links import private_linkage


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


def run(arguments, cwd, *, timeout=900, capture=False, expected_exit=0):
    print("BUILD:", " ".join(str(a) for a in arguments), flush=True)
    try:
        result = subprocess.run([str(a) for a in arguments], cwd=cwd, text=True,
                                capture_output=capture, timeout=timeout, check=False,
                                env={**os.environ, "LC_ALL": "C"})
    except subprocess.TimeoutExpired as error:
        raise ReviewError("BUILD_TIMEOUT") from error
    except OSError as error:
        raise ReviewError("BUILD_TOOL") from error
    if result.returncode != expected_exit and capture:
        print(result.stdout[-4000:], result.stderr[-4000:], flush=True)
    require(result.returncode == expected_exit, "BUILD_EXIT")
    return result.stdout + result.stderr if capture else ""



def extract_component(archive, parent, root, licenses, aliases=None):
    require(not (parent / root).exists(), "SOURCE_ALREADY_EXISTS")
    with lzma.open(archive, "rb") as raw:
        budget = ArchiveBudget(raw, MAX_EXPANDED)
        try:
            return extract_tar(budget, parent, root, licenses, aliases)
        except ReviewError as error:
            if str(error) == "ARCHIVE_BUDGET":
                raise ReviewError("SOURCE_BUDGET") from error
            raise


def extract_tar(budget, parent, root, licenses, aliases=None):
    aliases = aliases or {}
    seen, regular, pending, total, anchors = set(), set(), set(), 0, {}
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
            relative = str(path.relative_to(root))
            if member.issym() and relative in aliases:
                target = aliases[relative]["target"]
                require(target not in {".", ".."} and PurePosixPath(target).name == target
                        and "\\" not in target and member.size == 0
                        and member.linkname == target, "SOURCE_ALIAS_TARGET")
                pending.add(relative)
                continue
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
            regular.add(relative)
            if relative in licenses:
                require(hasher.hexdigest() == licenses[relative], "SOURCE_LICENSE")
                anchors[relative] = hasher.hexdigest()
    while budget.read(65536):
        pass
    require(anchors == licenses, "SOURCE_LICENSE")
    require(pending == set(aliases), "SOURCE_ALIAS_SET")
    materialized, alias_bytes = [], 0
    for relative in sorted(pending):
        spec = aliases[relative]
        target_relative = str(PurePosixPath(relative).parent / spec["target"])
        require(target_relative in regular, "SOURCE_ALIAS_REGULAR")
        target = parent / root / target_relative
        verify_file(target, spec["size"], spec["sha256"])
        alias_bytes += spec["size"]
        require(total + alias_bytes <= MAX_EXPANDED, "SOURCE_BUDGET")
        output = parent / root / relative
        output.write_bytes(target.read_bytes())
        output.chmod(0o644)
        os.utime(output, (target.stat().st_mtime, target.stat().st_mtime))
        materialized.append({"path": relative, **spec, "archiveType": "symlink", "materializedRegular": True})
    return {"members": len(seen), "regularBytes": total, "licenseFiles": anchors,
            "sourceAliases": materialized, "materializedAliasBytes": alias_bytes}


def pe_imports(path, work):
    require(path.stat().st_size <= MAX_PE_BYTES, "PE_BUDGET")
    return parse_pe(path.read_bytes())["imports"]


def apply_source_patches(source, patches):
    evidence = []
    for patch in patches:
        relative = PurePosixPath(patch["path"])
        require(not relative.is_absolute() and ".." not in relative.parts
                and str(relative) == patch["path"] and "\\" not in patch["path"], "PATCH_PATH")
        path = source.joinpath(*relative.parts)
        if patch.get("create", False):
            require(patch["beforeSha256"] is None and not path.exists() and "overlay" in patch, "PATCH_CREATE")
            before = b""
        else:
            before = path.read_bytes()
            require(digest(before) == patch["beforeSha256"], "PATCH_INPUT")
        after = before
        require(("overlay" in patch) != ("replacements" in patch), "PATCH_METHOD")
        if "overlay" in patch:
            overlay = patch["overlay"]
            verify_file(ASSETS / overlay["file"], overlay["size"], overlay["sha256"])
            after = (ASSETS / overlay["file"]).read_bytes()
        else:
            for replacement in patch["replacements"]:
                old, new = replacement["before"].encode(), replacement["after"].encode()
                count = replacement.get("occurrences", 1)
                require(isinstance(count, int) and count > 0 and old and after.count(old) == count, "PATCH_MATCH")
                after = after.replace(old, new)
        require(digest(after) == patch["afterSha256"], "PATCH_OUTPUT")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(after)
        evidence.append({key: patch[key] for key in ["path", "beforeSha256", "afterSha256", "reason"]})
    return evidence


def inspect_closure(server, providers, work):
    pending, visited, result = [server], set(), []
    while pending:
        path = pending.pop()
        name = path.name.lower()
        if name in visited:
            continue
        visited.add(name)
        imports = pe_imports(path, work)
        item = {"name": name, "sha256": digest(path.read_bytes()), "size": path.stat().st_size, "imports": imports,
                "origin": "private-prefix" if path.parent == providers[0] else "target-toolchain",
                "systemImports": []}
        for dependency in imports:
            require(not dependency.startswith(("cyg", "msys-")), "PE_POSIX_RUNTIME")
            if dependency in SYSTEM_DLLS or dependency.startswith(("api-ms-win-", "ext-ms-win-")):
                require(not any(p.name.lower() == dependency for p in providers[0].iterdir()), "PE_SYSTEM_SHADOW")
                item["systemImports"].append(dependency)
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
    report["profile"] = manifest["profile"]
    for license_item in manifest["generatorLicenseEvidence"]:
        verify_file(ASSETS / license_item["file"], license_item["size"], license_item["sha256"])
    report["generatorLicenseEvidence"] = manifest["generatorLicenseEvidence"]
    report["excludedHeaderReview"] = manifest["excludedHeaderReview"]
    report["manifestSha256"] = digest(source_manifest)
    report["recipeSha256"] = digest(Path(__file__).read_bytes())
    cache, sources, builds, prefix = [work / name for name in ["cache", "sources", "build", "prefix"]]
    for directory in [cache, sources, builds, prefix]:
        directory.mkdir(parents=True, exist_ok=True)
    report["stage"] = "verify-server"
    report["serverSource"] = collect(cache, False)
    report["toolchain"] = {
        "gcc": run(["gcc", "--version"], work, capture=True).splitlines()[0],
        "gpgv": run(["gpgv", "--version"], work, capture=True).splitlines()[0],
        "target": run(["gcc", "-dumpmachine"], work, capture=True).strip(),
        "packages": run(["pacman", "-Q"], work, capture=True).splitlines(),
        "buildJobs": min(4, os.cpu_count() or 1),
    }
    jobs = str(report["toolchain"]["buildJobs"])
    require(report["toolchain"]["target"] == manifest["target"], "WINDOWS_TARGET")
    os.environ["PATH"] = str(prefix / "bin") + os.pathsep + os.environ["PATH"]
    os.environ["PKG_CONFIG_PATH"] = os.pathsep.join([str(prefix / "lib/pkgconfig"), str(prefix / "share/pkgconfig"), "/ucrt64/lib/pkgconfig", "/ucrt64/share/pkgconfig"])
    os.environ["CC"] = "gcc"
    os.environ["CFLAGS"] = "-O2 -g0 -std=gnu11"
    os.environ["CPPFLAGS"] = "-I" + str(prefix / "include")
    maps = work / "link-maps"
    maps.mkdir()
    native_maps = run(["cygpath", "-m", maps], work, capture=True).strip()
    os.environ["LDFLAGS"] = "-L" + str(prefix / "lib") + " -Wl,-Map=" + native_maps
    os.environ["LIBS"] = "-lpthread -lws2_32"
    os.environ["PYTHON"] = "/usr/bin/python3"
    native_xkb_root = run(["cygpath", "-m", prefix / "share/xkeyboard-config-2"], work, capture=True).strip()
    native_bin = run(["cygpath", "-m", prefix / "bin"], work, capture=True).strip()
    report["components"] = []
    owners = {}
    report["component"] = "xorg-server"
    report["stage"] = "server-source"
    server_manifest = json.loads((ASSETS / "upstream-source.json").read_text())
    root = server_manifest["source"]["root"]
    server_anchors = {"COPYING": server_manifest["source"]["anchors"]["COPYING"],
                      **{item["path"]: item["sha256"] for item in manifest["serverFileReview"]}}
    report["serverFileReview"] = manifest["serverFileReview"]
    extract_component(cache / server_manifest["archive"]["name"], sources, root, server_anchors)
    report["appliedServerPatches"] = apply_source_patches(sources / root, manifest["serverPatches"])
    linker_probe(builds, work, report, run, package_evidence)
    for component in manifest["components"]:
        report["component"] = component["name"]
        report["stage"] = "source"
        archive = download_component(component, cache)
        signing = component["signature"]
        signature = download_component(signing, cache, component["root"] + ".tar.xz.sig")
        signature_evidence = verify_dependency(archive, signature, manifest["certificates"][signing["certificate"]], signing)
        evidence = extract_component(archive, sources, component["root"], component["licenseFiles"], component.get("sourceAliases"))
        entry = {**component, "signatureEvidence": signature_evidence, "sourceEvidence": evidence, "built": False}
        report["components"].append(entry)
        build_directory = builds / component["name"]
        build_directory.mkdir()
        source = sources / component["root"]
        entry["appliedPatches"] = apply_source_patches(source, component.get("patches", []))
        report["stage"] = "configure"
        before = snapshot(prefix)
        if component["buildSystem"] == "meson":
            run(["meson", "setup", build_directory, source, "--prefix=" + str(prefix), "--libdir=lib", "--buildtype=release", "--default-library=shared", *component["options"]], work)
            report["stage"] = "compile-install"
            run(["meson", "compile", "-C", build_directory, "-j", jobs], work)
            run(["meson", "install", "-C", build_directory], work)
        else:
            xkb_options = ["--with-xkb-config-root=" + native_xkb_root] if component["name"] == "xkbcomp" else []
            run(["bash", source / "configure", "--prefix=" + str(prefix), "--host=" + manifest["target"], "--enable-dependency-tracking", *component["options"], *xkb_options], build_directory)
            report["stage"] = "compile-install"
            run(["make", "-k", "-j" + jobs], build_directory)
            run(["make", "install"], build_directory)
        entry["built"] = True
        entry["installedFiles"] = installed_delta(prefix, before, component["name"], owners)
        if component["name"] == "xkeyboard-config":
            report["stage"] = "xkb-runtime-data"
            report["xkbRuntimeData"] = runtime_inventory(prefix, source, build_directory, entry, owners, report)
        if component["name"] == "xkbcomp":
            parser = component["generatedParserReview"]
            verify_file(source / parser["path"], parser["size"], parser["sha256"])
            xkb_probe(prefix, builds, work, report, run)
        for relative, anchor in component.get("installedAnchors", {}).items():
            verify_file(prefix / relative, anchor["size"], anchor["sha256"])
        if component["name"] == "xorgproto":
            header_probes(prefix, sources / root, builds, work, report, run)
        if component["name"] == "libxcb":
            xcb_probe(prefix, builds, work, report, run)
        if component["name"] == "xcb-proto":
            report["hostGenerator"] = verify_host_generator(prefix, source, work)
        if component["name"] == "libXfont2":
            font_probe(prefix, source, builds, work, report, run)
        write_report(work / "progress.json", report)
    report["component"] = "xorg-server"
    server_build = builds / "xorg-server"
    server_build.mkdir()
    report["stage"] = "server-configure"
    run(["bash", sources / root / "configure", "--prefix=" + str(prefix), "--host=" + manifest["target"], "--enable-dependency-tracking", *manifest["serverOptions"],
         "--with-xkb-path=" + native_xkb_root, "--with-xkb-bin-directory=" + native_bin], server_build)
    report["serverXkbPaths"] = configured_paths(server_build, native_xkb_root, native_bin)
    core_bytes = (server_build / "include/dix-config.h").read_bytes()
    native_bytes = (server_build / "include/xwin-config.h").read_bytes()
    core_config, native_config = core_bytes.decode(), native_bytes.decode()
    require(re.search(r"^#define XDMCP 1$", core_config, re.MULTILINE), "SERVER_XDMCP")
    require(all(re.search(r"^#define " + name + r" 1$", native_config, re.MULTILINE)
                for name in ["HAS_WINSOCK", "RELOCATE_PROJECTROOT"]), "SERVER_NATIVE_CONFIG")
    require(not re.search(r"^#define CYGDEBUG 1$", native_config, re.MULTILINE), "SERVER_DEBUG_PROFILE")
    report["serverConfig"] = {"xdmcp": True, "winsock": True, "relocateProjectRoot": True,
                              "coreSha256": digest(core_bytes), "nativeSha256": digest(native_bytes)}
    report["stage"] = "server-compile"
    run(["make", "-k", "-j" + jobs], server_build, timeout=1800)
    poll_probe(prefix, sources / root, server_build, builds, work, report, run)
    before = snapshot(prefix)
    run(["make", "install"], server_build)
    report["serverInstalledFiles"] = installed_delta(prefix, before, "xorg-server", owners)
    server = prefix / "bin" / manifest["serverExecutable"]
    require(server.is_file(), "SERVER_BINARY")
    report["stage"] = "pe-closure"
    report["peClosure"] = inspect_closure(server, [prefix / "bin", Path("/ucrt64/bin")], work)
    report["xkbCompilerPeClosure"] = inspect_closure(prefix / "bin/xkbcomp.exe", [prefix / "bin", Path("/ucrt64/bin")], work)
    report["peClosureRoots"] = {"peClosure": "XWin.exe", "xkbCompilerPeClosure": "xkbcomp.exe"}
    report["peImportScope"] = ["normal", "delay"]
    packages = add_runtime_provenance(report["peClosure"], prefix, owners, work, run)
    for name, evidence in add_runtime_provenance(report["xkbCompilerPeClosure"], prefix, owners, work, run).items():
        require(name not in packages or packages[name] == evidence, "PE_PACKAGE_CHANGED")
        packages[name] = evidence
    report["runtimePackages"] = list(packages.values())
    report["stage"] = "native-headers"
    report["nativeHeaderEvidence"] = native_header_evidence(server_build)
    report["stage"] = "static-link-inputs"
    mapping = maps / "XWin.exe.map"
    require(mapping.is_file() and mapping.stat().st_size <= 64 * 1024 * 1024, "LINK_MAP_MISSING")
    generated = memory_inputs(mapping.read_text(), server.read_bytes(), report["linkerProducer"])
    report["linkerGeneratedInputs"] = list(generated.values())
    report["staticLink"] = link_inputs(mapping, server_build / "hw/xwin", builds, prefix, owners, work, run, packages, report, generated)
    report["stage"] = "archive-member-inputs"
    report["archiveMembers"] = selected_members(mapping, server_build / "hw/xwin", builds, prefix,
                                               report["staticLink"]["inputs"], work, run, report)
    report["stage"] = "private-pe-link-inputs"
    private_linkage(maps, builds, prefix, owners, [report["peClosure"], report["xkbCompilerPeClosure"]],
                    work, run, packages, report["linkerProducer"], report,
                    build_systems={item["name"]: item["buildSystem"] for item in manifest["components"]})
    report["stage"] = "compiler-inputs"
    report["compilerInputs"] = observed_inputs(builds, sources, prefix, manifest, root, owners, packages, work, run, report)
    parser = next(component for component in manifest["components"] if component["name"] == "xkbcomp")["generatedParserReview"]
    require(any(item.get("component") == "xkbcomp" and item["path"].endswith("/" + parser["path"])
                and item["sha256"] == parser["sha256"] and "xkbcomp" in item["observedBy"]
                for item in report["compilerInputs"]["files"]), "XKB_PARSER_NOT_OBSERVED")
    report["runtimePackages"] = list(packages.values())
    report["stage"] = "native-version"
    version = run([server, "-version"], work, timeout=20, capture=True)
    require("21.1.25" in version, "SERVER_VERSION")
    report["nativeVersionVerified"] = True
    report["nativeBuildVerified"] = True
    report["status"] = "REVIEW-REQUIRED"
    report["stage"] = "complete"


def verify_host_generator(prefix, source, work):
    host_paths = [path for path in prefix.glob("lib/python*/site-packages") if (path / "xcbgen/__init__.py").is_file()]
    require(len(host_paths) == 1, "HOST_GENERATOR_PATH")
    os.environ["PYTHONPATH"] = str(host_paths[0])
    # state子模块依赖真正generator的__main__.output；路径probe只导入包本身。
    module_path = run([sys.executable, "-c", "import xcbgen; print(xcbgen.__file__)"], work, capture=True).strip()
    module = host_paths[0] / "xcbgen/__init__.py"
    require(Path(module_path).resolve() == module.resolve(), "HOST_GENERATOR_MODULE")
    require(module.read_bytes() == (source / "xcbgen/__init__.py").read_bytes(), "HOST_GENERATOR_CONTENT")
    return {"component": "xcb-proto", "moduleSha256": digest(module.read_bytes()),
            "path": str(module.relative_to(prefix))}


def main(arguments=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--work", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args(arguments)
    args.report.unlink(missing_ok=True)
    report = {"schema": 1, "status": "FAIL", "nativeBuildVerified": False,
              "nativeVersionVerified": False, "distributionApproved": False,
              "bundled": False, "desktopVerified": False,
              "pendingReview": ["legacy-signing-algorithms-and-maintainer-identity", "per-file-licenses-and-generator-exceptions", "compiler-runtime-obligations", "runtime-resources", "packaging-signing-and-desktop"]}
    code = 1
    try:
        args.work.mkdir(parents=True, exist_ok=True)
        require(not any(args.work.iterdir()), "BUILD_WORK_NOT_EMPTY")
        build(args.work.resolve(), report)
        code = 0
    except (ReviewError, OSError, ValueError, KeyError, tarfile.TarError, EOFError, lzma.LZMAError, HTTPException) as error:
        report["error"] = str(error) if isinstance(error, ReviewError) else "BUILD_FAILED"
        if isinstance(error, InventoryCollision):
            report["installCollision"] = error.details
    write_report(args.report, report)
    print(report["status"], report.get("component"), report.get("stage"), report.get("error", ""))
    return code


if __name__ == "__main__":
    raise SystemExit(main())
