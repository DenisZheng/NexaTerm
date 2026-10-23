"""实际安装文件、链接输入和工具链运行库的来源记录。"""

from pathlib import Path
import re

from xserver_source_review import ReviewError, digest, require
from xserver_windows_licenses import source_license_evidence


class InventoryCollision(ReviewError):
    def __init__(self, path, owner, before, after):
        super().__init__("INSTALL_COLLISION")
        self.details = {"path": path, "previousOwner": owner, "previous": before, "installed": after}


def snapshot(prefix):
    return {str(path.relative_to(prefix)): {"sha256": digest(path.read_bytes()), "size": path.stat().st_size}
            for path in prefix.rglob("*") if path.is_file()}


def installed_delta(prefix, before, owner, owners):
    current = snapshot(prefix)
    result = {}
    for relative, record in current.items():
        if before.get(relative) == record:
            continue
        if relative in before or relative in owners:
            raise InventoryCollision(relative, owners.get(relative), before.get(relative), record)
        owners[relative] = owner
        result[relative] = record
    return result


def package_evidence(package, work, run, file_owners=None):
    require(re.fullmatch(r"mingw-w64-ucrt-x86_64-[A-Za-z0-9+_.-]+", package), "TOOLCHAIN_PACKAGE")
    info = run(["pacman", "-Qi", package], work, capture=True)
    version = re.search(r"^Version\s*:\s*(\S+)", info, re.MULTILINE)
    license_value = re.search(r"^Licenses\s*:\s*(.+)", info, re.MULTILINE)
    require(version and license_value and license_value[1].strip() != "None", "TOOLCHAIN_LICENSE")
    listing = run(["pacman", "-Ql", package], work, capture=True)
    anchors, installed_files = {}, []
    for line in listing.splitlines():
        match = re.fullmatch(re.escape(package) + r"\s+(.+)", line)
        if not match:
            continue
        path = Path(match[1])
        if not match[1].endswith("/"):
            installed_files.append(path)
        if file_owners is not None and not match[1].endswith("/"):
            identity = str(path.resolve()).casefold()
            require(identity not in file_owners or file_owners[identity] == package, "TOOLCHAIN_OWNER_AMBIGUOUS")
            file_owners[identity] = package
        if "/share/licenses/" in str(path) and path.is_file():
            require(path.stat().st_size <= 1024 * 1024, "TOOLCHAIN_LICENSE")
            anchors[str(path.relative_to("/ucrt64"))] = digest(path.read_bytes())
    source_evidence = source_license_evidence(package, version[1], license_value[1].strip(), installed_files) if not anchors else None
    require(anchors or source_evidence, "TOOLCHAIN_LICENSE")
    archives = []
    for path in Path("/var/cache/pacman/pkg").glob(package + "-" + version[1] + "-*.pkg.tar.zst"):
        archives.append({"name": path.name, "sha256": digest(path.read_bytes()), "size": path.stat().st_size})
    result = {"package": package, "version": version[1], "declaredLicense": license_value[1].strip(),
              "licenseFiles": anchors, "cachedArchives": archives, "distributionApproved": False}
    if source_evidence:
        result["sourceLicenseEvidence"] = source_evidence
    return result


def add_runtime_provenance(closure, prefix, owners, work, run):
    packages = {}
    for item in closure:
        if item["origin"] == "private-prefix":
            relative = "bin/" + item["name"]
            matches = [key for key in owners if key.lower() == relative]
            require(len(matches) == 1, "PE_SOURCE_OWNER")
            item["component"] = owners[matches[0]]
        else:
            package = run(["pacman", "-Qqo", Path("/ucrt64/bin") / item["name"]], work, capture=True).strip()
            if package not in packages:
                packages[package] = package_evidence(package, work, run)
            item["package"] = package
    return packages


def link_input_path(name, directory, work, run):
    if re.match(r"^[A-Za-z]:", name):
        name = run(["cygpath", "-u", name], work, capture=True).strip()
    path = Path(name)
    return (directory / path).resolve() if not path.is_absolute() else path.resolve()


def map_output(content):
    outputs = re.findall(r"^OUTPUT\((.+) pei-x86-64\)\s*$", content, re.MULTILINE)
    require(len(outputs) == 1, "LINK_MAP_TARGET")
    return outputs[0].replace("\\", "/")


def link_inputs(map_file, link_directory, builds, prefix, owners, work, run, packages, report=None, generated_inputs=None,
                *, target="XWin.exe", component="xorg-server", toolchain_root=Path("/ucrt64")):
    require(map_file.is_file() and map_file.stat().st_size <= 64 * 1024 * 1024, "LINK_MAP_MISSING")
    content = map_file.read_text(encoding="utf-8", errors="strict")
    require(Path(map_output(content)).name.casefold() == target.casefold(), "LINK_MAP_TARGET")
    records = {}
    result = {"mapSha256": digest(map_file.read_bytes()), "inputs": [], "observationsComplete": False}
    if report is not None:
        report["staticLink"] = result
    generated_inputs = generated_inputs or {}
    for name in re.findall(r"^LOAD (.+)$", content, re.MULTILINE):
        if report is not None:
            report["staticLinkCurrentInput"] = name[:4096]
        if name in generated_inputs:
            require(not (link_directory / name).exists(), "LINK_GENERATED_SHADOW")
            record = generated_inputs[name]
            records[record["origin"] + "/" + record["path"]] = record
            result["inputs"] = list(records.values())
            continue
        path = link_input_path(name, link_directory, work, run)
        if report is not None:
            report["staticLinkCurrentInput"] = str(path)[:4096]
        require(path.is_file(), "LINK_INPUT_MISSING")
        require(not re.search(r"(?:winshadddnl\.|libdxguid\.)", path.name, re.IGNORECASE), "LINK_DIRECTDRAW_INPUT")
        record = {"sha256": digest(path.read_bytes()), "size": path.stat().st_size}
        if path.is_relative_to(prefix):
            relative = str(path.relative_to(prefix))
            require(relative in owners, "LINK_SOURCE_OWNER")
            record.update({"origin": "private-prefix", "path": relative, "component": owners[relative]})
        elif path.is_relative_to(builds):
            relative = path.relative_to(builds)
            require(component == "xorg-server" or relative.parts[0] == component, "LINK_BUILD_OWNER")
            record.update({"origin": "server-build" if component == "xorg-server" else "component-build",
                           "path": str(relative), "component": component})
        else:
            require(path.is_relative_to(toolchain_root), "LINK_INPUT_ORIGIN")
            package = run(["pacman", "-Qqo", path], work, capture=True).strip()
            if package not in packages:
                packages[package] = package_evidence(package, work, run)
            record.update({"origin": "target-toolchain", "path": str(path.relative_to(toolchain_root)), "package": package})
        records[record["origin"] + "/" + record["path"]] = record
        result["inputs"] = list(records.values())
        if report is not None:
            report["runtimePackages"] = list(packages.values())
    require(records and any(value["origin"] == "target-toolchain" for value in records.values()), "LINK_INPUTS_MISSING")
    result["observationsComplete"] = True
    if report is not None:
        report.pop("staticLinkCurrentInput", None)
    return result


def native_header_evidence(build_directory):
    depfiles = sorted([*build_directory.rglob("*.Po"), *build_directory.rglob("*.Plo")])
    require(0 < len(depfiles) <= 2000, "NATIVE_HEADER_DEPENDENCIES")
    records, total = [], 0
    for path in depfiles:
        total += path.stat().st_size
        require(total <= 64 * 1024 * 1024, "NATIVE_HEADER_BUDGET")
        records.append((path, path.read_text().replace("\\\n", " ")))
    winmsg = [(path, content) for path, content in records
              if re.search(r"(?:^|[/\\])winmsg\.c(?:\s|$)", content)]
    require(winmsg and all("winmessages.h" not in content for _, content in winmsg), "NATIVE_DEBUG_HEADER")
    require(all(not re.search(r"(?:^|[/\\])(?:ddraw\.h|winshadddnl\.c)(?:\s|$)", content, re.IGNORECASE)
                for _, content in records), "NATIVE_DIRECTDRAW_INPUT")
    gdi = [(path, content) for path, content in records
           if re.search(r"(?:^|[/\\])winshadgdi\.c(?:\s|$)", content)]
    require(gdi, "NATIVE_GDI_DEPENDENCIES")
    server_header = []
    for unit in ["xkb.c", "xkbUtils.c"]:
        observed = [(path, content) for path, content in records
                    if re.search(r"[/\\]xkb[/\\]" + re.escape(unit) + r"(?:\s|$)", content)]
        require(observed and all(
            re.search(r"[/\\]xkb[/\\]xkbgeom\.h(?:\s|$)", content)
            and re.search(r"[/\\]include[/\\]xkbstr\.h(?:\s|$)", content)
            and not re.search(r"[/\\]X11[/\\]extensions[/\\]XKBgeom\.h(?:\s|$)", content)
            for _, content in observed), "NATIVE_SERVER_HEADER_CONTEXT")
        server_header.extend(observed)
    require(all(not re.search(r"(?:^|[/\\])propkey\.h(?:\s|$)", content, re.IGNORECASE)
                for _, content in records), "NATIVE_PROPERTY_TABLE")
    appid = [(path, content) for path, content in records
             if re.search(r"(?:^|[/\\])winSetAppUserModelID\.c(?:\s|$)", content)]
    require(appid, "NATIVE_APPID_DEPENDENCIES")
    def identities(items):
        return [{"path": str(path.relative_to(build_directory)), "sha256": digest(path.read_bytes())}
                for path, _ in items]
    return {"scope": "observed-server-automake-dependencies", "dependencyFiles": len(depfiles),
            "debugMessageTableIncluded": False, "directDrawHeaderIncluded": False,
            "directDrawBackendIncluded": False, "renderer": "gdi",
            "winmsgDependencies": identities(winmsg), "gdiDependencies": identities(gdi),
            "serverGeometryHeaderDependencies": identities(server_header),
            "serverGeometryHeaders": ["xkb/xkbgeom.h", "include/xkbstr.h"],
            "propertyTableIncluded": False, "appIdDependencies": identities(appid)}
