"""实际安装文件、链接输入和工具链运行库的来源记录。"""

from pathlib import Path
import re

from xserver_source_review import ReviewError, digest, require, verify_file


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


def package_evidence(package, work, run):
    require(re.fullmatch(r"mingw-w64-ucrt-x86_64-[A-Za-z0-9+_.-]+", package), "TOOLCHAIN_PACKAGE")
    info = run(["pacman", "-Qi", package], work, capture=True)
    version = re.search(r"^Version\s*:\s*(\S+)", info, re.MULTILINE)
    license_value = re.search(r"^Licenses\s*:\s*(.+)", info, re.MULTILINE)
    require(version and license_value and license_value[1].strip() != "None", "TOOLCHAIN_LICENSE")
    listing = run(["pacman", "-Ql", package], work, capture=True)
    anchors = {}
    for line in listing.splitlines():
        match = re.fullmatch(re.escape(package) + r"\s+(.+)", line)
        if not match:
            continue
        path = Path(match[1])
        if "/share/licenses/" in str(path) and path.is_file():
            require(path.stat().st_size <= 1024 * 1024, "TOOLCHAIN_LICENSE")
            anchors[str(path.relative_to("/ucrt64"))] = digest(path.read_bytes())
    require(anchors, "TOOLCHAIN_LICENSE")
    archives = []
    for path in Path("/var/cache/pacman/pkg").glob(package + "-" + version[1] + "-*.pkg.tar.zst"):
        archives.append({"name": path.name, "sha256": digest(path.read_bytes()), "size": path.stat().st_size})
    return {"package": package, "version": version[1], "declaredLicense": license_value[1].strip(),
            "licenseFiles": anchors, "cachedArchives": archives, "distributionApproved": False}


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


def link_inputs(map_file, link_directory, builds, prefix, owners, work, run, packages):
    require(map_file.is_file() and map_file.stat().st_size <= 64 * 1024 * 1024, "LINK_MAP_MISSING")
    content = map_file.read_text(encoding="utf-8", errors="strict")
    require(re.search(r"^OUTPUT\([^\n]*XWin\.exe\b", content, re.MULTILINE), "LINK_MAP_TARGET")
    records = {}
    for name in re.findall(r"^LOAD (.+)$", content, re.MULTILINE):
        if re.match(r"^[A-Za-z]:", name):
            name = run(["cygpath", "-u", name], work, capture=True).strip()
        path = Path(name)
        path = (link_directory / path).resolve() if not path.is_absolute() else path.resolve()
        require(path.is_file(), "LINK_INPUT_MISSING")
        require(not re.search(r"(?:winshadddnl\.|libdxguid\.)", path.name, re.IGNORECASE), "LINK_DIRECTDRAW_INPUT")
        record = {"sha256": digest(path.read_bytes()), "size": path.stat().st_size}
        if path.is_relative_to(prefix):
            relative = str(path.relative_to(prefix))
            require(relative in owners, "LINK_SOURCE_OWNER")
            record.update({"origin": "private-prefix", "path": relative, "component": owners[relative]})
        elif path.is_relative_to(builds):
            record.update({"origin": "server-build", "path": str(path.relative_to(builds)), "component": "xorg-server"})
        else:
            require(path.is_relative_to("/ucrt64"), "LINK_INPUT_ORIGIN")
            package = run(["pacman", "-Qqo", path], work, capture=True).strip()
            if package not in packages:
                packages[package] = package_evidence(package, work, run)
            record.update({"origin": "target-toolchain", "path": str(path.relative_to("/ucrt64")), "package": package})
        records[record["origin"] + "/" + record["path"]] = record
    require(records and any(value["origin"] == "target-toolchain" for value in records.values()), "LINK_INPUTS_MISSING")
    return {"mapSha256": digest(map_file.read_bytes()), "inputs": list(records.values())}


def prepare_server_headers(sources, target, manifest):
    components = {item["name"]: item for item in manifest["components"]}
    result = []
    for item in manifest["serverHeaders"]:
        require(item["component"] in components, "SERVER_HEADER_OWNER")
        source = sources / components[item["component"]]["root"] / item["source"]
        verify_file(source, item["size"], item["sha256"])
        destination = target / item["target"]
        require(not destination.exists(), "SERVER_HEADER_EXISTS")
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(source.read_bytes())
        verify_file(destination, item["size"], item["sha256"])
        result.append(item)
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
    server_header = [(path, content) for path, content in records
                     if re.search(r"[/\\]xorg-server-headers[/\\]X11[/\\]extensions[/\\]XKBgeom\.h(?:\s|$)", content)]
    require(server_header, "NATIVE_SERVER_HEADER_CONTEXT")
    def identities(items):
        return [{"path": str(path.relative_to(build_directory)), "sha256": digest(path.read_bytes())}
                for path, _ in items]
    return {"scope": "observed-server-automake-dependencies", "dependencyFiles": len(depfiles),
            "debugMessageTableIncluded": False, "directDrawHeaderIncluded": False,
            "directDrawBackendIncluded": False, "renderer": "gdi",
            "winmsgDependencies": identities(winmsg), "gdiDependencies": identities(gdi),
            "serverGeometryHeaderDependencies": identities(server_header)}
