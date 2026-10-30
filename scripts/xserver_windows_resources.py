"""Trace Windows resource compiler inputs through the final XWin PE image."""

from pathlib import Path
import re
import shlex
import shutil
import struct
import tempfile

from xserver_source_review import digest, require
from xserver_windows_compilation import dependency_path, make_dependencies
from xserver_windows_inventory import package_evidence
from xserver_windows_pe import file_offset, parse_pe

MAX_RESOURCE_BYTES = 16 * 1024 * 1024
MAX_OBJECT_BYTES = 64 * 1024 * 1024
MAX_SCAN_OBJECTS = 50000


def coff_sections(data):
    require(20 <= len(data) <= MAX_OBJECT_BYTES, "RESOURCE_COFF_HEADER")
    machine, count = struct.unpack_from("<HH", data, 0)
    require(machine == 0x8664, "RESOURCE_COFF_ARCH")
    optional_size = struct.unpack_from("<H", data, 16)[0]
    require(optional_size == 0, "RESOURCE_COFF_OPTIONAL_HEADER")
    table_end = 20 + count * 40
    require(1 <= count <= 96 and table_end <= len(data), "RESOURCE_COFF_SECTIONS")
    sections = []
    for index in range(count):
        start = 20 + index * 40
        raw_name = data[start:start + 8].split(b"\0", 1)[0]
        require(raw_name and all(32 <= byte <= 126 for byte in raw_name), "RESOURCE_COFF_SECTION_NAME")
        name = raw_name.decode("ascii")
        raw_size, raw_pointer = struct.unpack_from("<II", data, start + 16)
        characteristics = struct.unpack_from("<I", data, start + 36)[0]
        require(raw_size <= MAX_OBJECT_BYTES, "RESOURCE_COFF_SECTION_BUDGET")
        if raw_size:
            require(raw_pointer >= table_end and raw_pointer + raw_size <= len(data), "RESOURCE_COFF_RANGE")
            raw = data[raw_pointer:raw_pointer + raw_size]
        else:
            require(raw_pointer == 0, "RESOURCE_COFF_EMPTY_SECTION")
            raw = b""
        sections.append({"name": name, "rawSize": raw_size, "rawOffset": raw_pointer,
                         "rawSha256": digest(raw) if raw else None, "characteristics": characteristics})
    resource_sections = [item for item in sections if item["name"].startswith(".rsrc") and item["rawSize"]]
    return {"machine": "amd64", "sections": sections, "resourceSections": resource_sections}


def parse_pe_resources(data):
    image = parse_pe(data)
    pe = struct.unpack_from("<I", data, 60)[0]
    optional = pe + 24
    resource_rva, resource_size = struct.unpack_from("<II", data, optional + 112 + 2 * 8)
    require(resource_rva and 0 < resource_size <= MAX_RESOURCE_BYTES, "PE_RESOURCE_DIRECTORY")
    root = file_offset(resource_rva, resource_size, image["headersSize"], image["sections"])

    def local(relative, size):
        require(0 <= relative and 0 < size <= resource_size and relative + size <= resource_size,
                "PE_RESOURCE_RANGE")
        return root + relative

    def name_value(raw):
        if not raw & 0x80000000:
            return raw & 0x7fffffff
        relative = raw & 0x7fffffff
        position = local(relative, 2)
        length = struct.unpack_from("<H", data, position)[0]
        require(0 < length <= 256, "PE_RESOURCE_NAME")
        encoded = data[local(relative + 2, length * 2):local(relative + 2, length * 2) + length * 2]
        try:
            value = encoded.decode("utf-16le")
        except UnicodeDecodeError:
            require(False, "PE_RESOURCE_NAME")
        require(value and "\0" not in value, "PE_RESOURCE_NAME")
        return value

    resources, visited = [], set()

    def walk(relative, path):
        require(relative not in visited and len(visited) < 4096, "PE_RESOURCE_CYCLE")
        visited.add(relative)
        position = local(relative, 16)
        _, _, _, _, named, identifiers = struct.unpack_from("<IIHHHH", data, position)
        count = named + identifiers
        require(0 < count <= 4096 and relative + 16 + count * 8 <= resource_size,
                "PE_RESOURCE_ENTRIES")
        names = set()
        for index in range(count):
            entry = local(relative + 16 + index * 8, 8)
            raw_name, raw_target = struct.unpack_from("<II", data, entry)
            name = name_value(raw_name)
            require(name not in names, "PE_RESOURCE_DUPLICATE")
            names.add(name)
            target = raw_target & 0x7fffffff
            if raw_target & 0x80000000:
                require(len(path) < 2, "PE_RESOURCE_DEPTH")
                walk(target, [*path, name])
            else:
                require(len(path) == 2 and isinstance(name, int), "PE_RESOURCE_DEPTH")
                data_entry = local(target, 16)
                data_rva, size, codepage, reserved = struct.unpack_from("<IIII", data, data_entry)
                require(data_rva and 0 < size <= MAX_RESOURCE_BYTES and reserved == 0,
                        "PE_RESOURCE_DATA_ENTRY")
                require(resource_rva <= data_rva and data_rva + size <= resource_rva + resource_size,
                        "PE_RESOURCE_DATA_RANGE")
                data_offset = file_offset(data_rva, size, image["headersSize"], image["sections"])
                payload = data[data_offset:data_offset + size]
                require(len(payload) == size, "PE_RESOURCE_DATA_RANGE")
                resources.append({"type": path[0], "name": path[1], "language": name,
                                  "codepage": codepage, "size": size, "sha256": digest(payload),
                                  "data": payload})
                require(len(resources) <= 8192, "PE_RESOURCE_BUDGET")

    walk(0, [])
    require(resources, "PE_RESOURCE_EMPTY")
    return {"rva": resource_rva, "size": resource_size, "directoryCount": len(visited),
            "resources": resources}


def parse_ico(data):
    require(6 <= len(data) <= MAX_RESOURCE_BYTES, "RESOURCE_ICO_HEADER")
    reserved, kind, count = struct.unpack_from("<HHH", data, 0)
    require(reserved == 0 and kind == 1 and 0 < count <= 256, "RESOURCE_ICO_HEADER")
    table_end = 6 + count * 16
    require(table_end <= len(data), "RESOURCE_ICO_TABLE")
    result, ranges = [], []
    for index in range(count):
        width, height, colors, reserved_byte, planes, bits, size, offset = struct.unpack_from(
            "<BBBBHHII", data, 6 + index * 16)
        require(reserved_byte == 0 and size > 0 and offset >= table_end and offset + size <= len(data),
                "RESOURCE_ICO_ENTRY")
        span = (offset, offset + size)
        require(all(span[1] <= start or end <= span[0] for start, end in ranges), "RESOURCE_ICO_OVERLAP")
        ranges.append(span)
        result.append({"width": width, "height": height, "colors": colors, "reserved": reserved_byte,
                       "planes": planes, "bits": bits, "size": size, "data": data[offset:offset + size]})
    return result


def parse_resource_references(rc_bytes):
    try:
        rc_text = rc_bytes.decode("utf-8")
    except UnicodeDecodeError:
        require(False, "RESOURCE_RC_ENCODING")
    pattern = (r'^\s*([A-Za-z_][A-Za-z0-9_]*|[0-9]+)\s+'
               r'(ICON|RT_MANIFEST|BITMAP|CURSOR|FONT|MESSAGETABLE|RCDATA|TYPELIB|HTML|AVI|WAVE)\s+'
               r'"([^"\r\n]+)"')
    matches = re.findall(pattern, rc_text, re.IGNORECASE | re.MULTILINE)
    normalized = [{"symbol": symbol, "type": kind.upper(), "path": path.replace("\\", "/")}
                  for symbol, kind, path in matches]
    require(len(normalized) == 2 and
            {(item["type"], item["path"]) for item in normalized} ==
            {("ICON", "X.ico"), ("RT_MANIFEST", "XWin.exe.manifest")},
            "RESOURCE_RC_REFERENCES")
    return normalized


def verify_xwin_resource_payloads(resources, rc_bytes, header_bytes, ico_bytes, manifest_bytes):
    references = parse_resource_references(rc_bytes)
    icon_id_match = re.search(rb"(?m)^\s*#define\s+IDI_XWIN\s+([0-9]+)\b", header_bytes)
    require(icon_id_match is not None, "RESOURCE_ICON_ID")
    group_id = int(icon_id_match[1])

    def matching(resource_type, resource_name):
        return [item for item in resources if item["type"] == resource_type and item["name"] == resource_name]

    manifests = matching(24, 1)
    require(len(manifests) == 1, "RESOURCE_MANIFEST_MISSING")
    manifest_payload = manifests[0]["data"]
    if manifest_payload == manifest_bytes:
        manifest_match = "exact"
    elif manifest_payload == manifest_bytes + b"\0":
        manifest_match = "single-trailing-nul"
    else:
        require(False, "RESOURCE_MANIFEST_BYTES")

    groups = matching(14, group_id)
    require(len(groups) == 1, "RESOURCE_GROUP_ICON_MISSING")
    group = groups[0]
    group_data = group["data"]
    require(len(group_data) >= 6, "RESOURCE_GROUP_ICON_HEADER")
    reserved, kind, count = struct.unpack_from("<HHH", group_data, 0)
    icons = parse_ico(ico_bytes)
    require(reserved == 0 and kind == 1 and count == len(icons)
            and len(group_data) == 6 + count * 14, "RESOURCE_GROUP_ICON_HEADER")
    icon_ids, icon_records = set(), []
    for index, icon in enumerate(icons):
        width, height, colors, reserved_byte, planes, bits, size, icon_id_value = struct.unpack_from(
            "<BBBBHHIH", group_data, 6 + index * 14)
        require((width, height, colors, reserved_byte, planes, bits, size) ==
                (icon["width"], icon["height"], icon["colors"], icon["reserved"],
                 icon["planes"], icon["bits"], icon["size"]), "RESOURCE_GROUP_ICON_MISMATCH")
        require(icon_id_value not in icon_ids, "RESOURCE_GROUP_ICON_DUPLICATE")
        icon_ids.add(icon_id_value)
        entries = [item for item in matching(3, icon_id_value) if item["language"] == group["language"]]
        require(len(entries) == 1 and entries[0]["data"] == icon["data"], "RESOURCE_ICON_BYTES")
        icon_records.append({"resourceId": icon_id_value, "size": icon["size"],
                             "sha256": digest(icon["data"]), "language": group["language"]})
    return {"manifest": {"type": 24, "name": 1, "language": manifests[0]["language"],
                         "size": len(manifest_payload), "sha256": digest(manifest_payload),
                         "sourceSha256": digest(manifest_bytes), "match": manifest_match},
            "icon": {"groupType": 14, "groupId": group_id, "language": group["language"],
                     "sourceSha256": digest(ico_bytes), "count": len(icons), "resources": icon_records},
            "resourceCount": len(resources),
            "resourceTypes": sorted({str(item["type"]) for item in resources}),
            "rcReferences": references}


def resource_make_dry_run_arguments(rule):
    # Force only the RC prerequisites to be considered changed. Never use make -B:
    # -B also rebuilds Automake's Makefile.in refresh chain and can invoke aclocal.
    required = {"XWin.rc", "XWin.exe.manifest", "X.ico"}
    prerequisites = sorted(required.intersection(rule.get("prerequisites", [])))
    require(set(prerequisites) == required, "RESOURCE_TARGET_PREREQUISITES")
    arguments = ["make", "-n", "V=1", "-o", "Makefile"]
    for prerequisite in prerequisites:
        arguments.extend(["-W", prerequisite])
    arguments.append("XWin.o")
    return arguments


def parse_makefile_resource_rule(content, allow_unresolved=False):
    normalized = content.replace("\\\n", " ")
    windres = re.findall(r"(?m)^WINDRES\s*=\s*(\S.*?)\s*$", normalized)
    require(len(windres) == 1 and windres[0], "RESOURCE_WINDRES_VARIABLE")
    if not allow_unresolved:
        require("$" not in windres[0] and "@" not in windres[0], "RESOURCE_WINDRES_VARIABLE")
    lines = content.splitlines()
    rules = [index for index, line in enumerate(lines) if line.strip() == ".rc.o:"]
    require(len(rules) == 1, "RESOURCE_WINDRES_RULE")
    recipe_lines, index = [], rules[0] + 1
    while index < len(lines) and lines[index].startswith("\t"):
        recipe_lines.append(lines[index].strip())
        index += 1
    recipe = "\n".join(recipe_lines)
    require("$(WINDRES)" in recipe and "--input-format=rc" in recipe
            and "-O coff" in recipe and "-I $(top_builddir)/include" in recipe
            and "--use-temp-file" in recipe, "RESOURCE_WINDRES_RULE")
    prerequisites = re.findall(r"(?m)^XWin\.o:\s*(.*)$", normalized)
    require(len(prerequisites) == 1, "RESOURCE_TARGET_RULE")
    names = {Path(token.strip("\\")).name for token in prerequisites[0].split()}
    require({"XWin.rc", "XWin.exe.manifest", "X.ico"} <= names, "RESOURCE_TARGET_PREREQUISITES")
    return {"windres": windres[0], "recipe": recipe, "prerequisites": sorted(names)}


def parse_windres_command(content, rule, build_directory, source_directory):
    candidates = [line.strip() for line in content.splitlines()
                  if re.search(r"\bwindres(?:\.exe)?\b", line, re.IGNORECASE)]
    require(len(candidates) == 1, "RESOURCE_WINDRES_COMMAND")
    command = shlex.split(candidates[0], posix=True)
    require(command and Path(command[0]).name.casefold() == Path(rule["windres"]).name.casefold()
            and "--use-temp-file" in command, "RESOURCE_WINDRES_COMMAND")
    require(not any(token.startswith("--preprocessor") for token in command), "RESOURCE_PREPROCESSOR_OVERRIDE")
    inputs, outputs, includes, defines, undefines = [], [], [], [], []
    index = 1
    while index < len(command):
        token = command[index]
        if token in {"-i", "--input", "-o", "--output", "-I", "-D", "-U"}:
            require(index + 1 < len(command), "RESOURCE_WINDRES_ARGUMENT")
            value = command[index + 1]
            if token in {"-i", "--input"}: inputs.append(value)
            elif token in {"-o", "--output"}: outputs.append(value)
            elif token == "-I": includes.append(value)
            elif token == "-D": defines.append(value)
            else: undefines.append(value)
            index += 2
            continue
        if token.startswith("-I") and len(token) > 2: includes.append(token[2:])
        elif token.startswith("-D") and len(token) > 2: defines.append(token[2:])
        elif token.startswith("-U") and len(token) > 2: undefines.append(token[2:])
        index += 1
    require(len(inputs) == len(outputs) == 1 and includes, "RESOURCE_WINDRES_ARGUMENT")
    require("--input-format=rc" in command and "-O" in command
            and command[command.index("-O") + 1] == "coff", "RESOURCE_WINDRES_FORMAT")
    input_path, output_path = Path(inputs[0]), Path(outputs[0])
    input_path = (build_directory / input_path).resolve() if not input_path.is_absolute() else input_path.resolve()
    output_path = (build_directory / output_path).resolve() if not output_path.is_absolute() else output_path.resolve()
    require(input_path == (source_directory / "XWin.rc").resolve(), "RESOURCE_WINDRES_INPUT")
    require(output_path == (build_directory / "XWin.o").resolve(), "RESOURCE_WINDRES_OUTPUT")
    return {"command": command, "commandLine": candidates[0], "input": input_path,
            "output": output_path, "includes": includes, "defines": defines, "undefines": undefines}


def _tool_record(path, package, role, work, run):
    raw = path.read_bytes()
    require(0 < len(raw) <= 128 * 1024 * 1024, "RESOURCE_TOOL_BUDGET")
    version = run([path, "--version"], work, capture=True).splitlines()[0]
    return {"role": role, "path": str(path), "size": len(raw), "sha256": digest(raw),
            "version": version, "package": package}


def _record_input(path, role, source, builds, prefix, toolchain_root,
                  owners, packages, package_files, work, run):
    path = path.resolve()
    require(path.is_file() and path.stat().st_size <= MAX_RESOURCE_BYTES, "RESOURCE_INPUT_MISSING")
    raw = path.read_bytes()
    record = {"role": role, "size": len(raw), "sha256": digest(raw)}
    if path.is_relative_to(source):
        record.update({"origin": "fixed-source", "path": str(path.relative_to(source)), "component": "xorg-server"})
    elif path.is_relative_to(builds):
        relative = path.relative_to(builds)
        require(relative.parts[0] == "xorg-server", "RESOURCE_BUILD_OWNER")
        record.update({"origin": "build-generated", "path": str(relative), "component": "xorg-server"})
    elif path.is_relative_to(prefix):
        relative = str(path.relative_to(prefix))
        require(relative in owners, "RESOURCE_PRIVATE_OWNER")
        record.update({"origin": "private-prefix", "path": relative, "component": owners[relative]})
    elif path.is_relative_to(toolchain_root):
        package = run(["pacman", "-Qqo", path], work, capture=True).strip()
        require(re.fullmatch(r"mingw-w64-ucrt-x86_64-[A-Za-z0-9+_.-]+", package), "RESOURCE_TOOL_PACKAGE")
        identity = str(path).casefold()
        require(identity not in package_files or package_files[identity] == package, "RESOURCE_TOOL_OWNER_AMBIGUOUS")
        package_files[identity] = package
        if package not in packages:
            packages[package] = package_evidence(package, work, run, package_files)
        record.update({"origin": "target-toolchain", "path": str(path.relative_to(toolchain_root)),
                       "package": package})
    else:
        require(False, "RESOURCE_INPUT_ORIGIN")
    return record


def _scan_object(path, expected_size, expected_sha, scanned):
    require(path.is_file() and not path.is_symlink(), "RESOURCE_OBJECT_MISSING")
    raw = path.read_bytes()
    require(len(raw) == expected_size and digest(raw) == expected_sha, "RESOURCE_OBJECT_CHANGED")
    info = coff_sections(raw)
    scanned[0] += 1
    require(scanned[0] <= MAX_SCAN_OBJECTS, "RESOURCE_OBJECT_BUDGET")
    return info


def _scan_xwin_link_objects(builds, prefix, toolchain_root, static_link, archive_members, xwin_object):
    roots = {"server-build": builds, "component-build": builds,
             "private-prefix": prefix, "target-toolchain": toolchain_root}
    scanned, resource_objects = [0], []
    for item in static_link["inputs"]:
        if item["origin"] == "linker-generated-memory":
            continue
        if Path(item["path"]).suffix.lower() not in {".o", ".obj", ".res"}:
            continue
        require(item["origin"] in roots, "RESOURCE_XWIN_OBJECT_ORIGIN")
        path = (roots[item["origin"]] / item["path"]).resolve()
        info = _scan_object(path, item["size"], item["sha256"], scanned)
        if info["resourceSections"]:
            expected = (item["origin"] in {"server-build", "component-build"}
                        and path == xwin_object and item["sha256"] == digest(xwin_object.read_bytes()))
            require(expected, "RESOURCE_XWIN_UNEXPECTED_RESOURCE_OBJECT")
            resource_objects.append({"path": item["path"], "sha256": item["sha256"],
                                     "sections": info["resourceSections"]})
    archive_cache, total_bytes = {}, 0
    for member in archive_members["members"]:
        origin = member["archiveOrigin"]
        require(origin in roots, "RESOURCE_XWIN_ARCHIVE_ORIGIN")
        path = (roots[origin] / member["archive"]).resolve()
        key = str(path).casefold()
        if key not in archive_cache:
            require(path.is_file() and not path.is_symlink() and path.stat().st_size <= 256 * 1024 * 1024,
                    "RESOURCE_XWIN_ARCHIVE_MISSING")
            raw_archive = path.read_bytes()
            require(digest(raw_archive) == member["archiveSha256"], "RESOURCE_XWIN_ARCHIVE_CHANGED")
            total_bytes += len(raw_archive)
            require(total_bytes <= 512 * 1024 * 1024, "RESOURCE_XWIN_ARCHIVE_BUDGET")
            archive_cache[key] = raw_archive
        raw_archive = archive_cache[key]
        start, end = member["fileOffset"], member["fileOffset"] + member["size"]
        require(0 <= start < end <= len(raw_archive), "RESOURCE_XWIN_MEMBER_RANGE")
        raw_member = raw_archive[start:end]
        require(digest(raw_member) == member["sha256"], "RESOURCE_XWIN_MEMBER_CHANGED")
        if raw_member[:4] == b"\0\0\xff\xff":
            continue
        info = coff_sections(raw_member)
        scanned[0] += 1
        require(scanned[0] <= MAX_SCAN_OBJECTS, "RESOURCE_OBJECT_BUDGET")
        require(not info["resourceSections"], "RESOURCE_XWIN_ARCHIVE_RESOURCE_OBJECT")
    require(len(resource_objects) == 1, "RESOURCE_XWIN_OBJECT_MISSING")
    return {"scannedCoffObjects": scanned[0], "resourceObjectCount": len(resource_objects),
            "resourceObjects": resource_objects, "archiveCount": len(archive_cache),
            "archiveBytes": total_bytes}


def _scan_private_resource_objects(private_linkage, builds, prefix, toolchain_root, report=None):
    require(private_linkage.get("observationsComplete") and private_linkage.get("files"),
            "RESOURCE_PRIVATE_LINKS_INCOMPLETE")
    roots = {"component-build": builds, "server-build": builds,
             "private-prefix": prefix, "target-toolchain": toolchain_root}
    archive_cache, scanned, short_imports, archive_bytes = {}, [0], 0, 0
    for target in private_linkage["files"]:
        if report is not None:
            report["privateResourceCurrent"] = target["name"]
        for item in target["staticLink"]["inputs"]:
            if item["origin"] == "linker-generated-memory":
                continue
            if Path(item["path"]).suffix.lower() not in {".o", ".obj", ".res"}:
                continue
            require(item["origin"] in roots, "RESOURCE_PRIVATE_OBJECT_ORIGIN")
            path = (roots[item["origin"]] / item["path"]).resolve()
            info = _scan_object(path, item["size"], item["sha256"], scanned)
            require(not info["resourceSections"], "RESOURCE_PRIVATE_DIRECT_RESOURCE_OBJECT")
        for member in target["archiveMembers"]["members"]:
            origin = member["archiveOrigin"]
            require(origin in roots, "RESOURCE_PRIVATE_ARCHIVE_ORIGIN")
            path = (roots[origin] / member["archive"]).resolve()
            key = str(path).casefold()
            if key not in archive_cache:
                require(path.is_file() and not path.is_symlink() and path.stat().st_size <= 256 * 1024 * 1024,
                        "RESOURCE_PRIVATE_ARCHIVE_MISSING")
                archive = path.read_bytes()
                require(digest(archive) == member["archiveSha256"], "RESOURCE_PRIVATE_ARCHIVE_CHANGED")
                archive_bytes += len(archive)
                require(archive_bytes <= 512 * 1024 * 1024, "RESOURCE_PRIVATE_ARCHIVE_BUDGET")
                archive_cache[key] = archive
            archive = archive_cache[key]
            start, end = member["fileOffset"], member["fileOffset"] + member["size"]
            require(0 <= start < end <= len(archive), "RESOURCE_PRIVATE_MEMBER_RANGE")
            raw = archive[start:end]
            require(digest(raw) == member["sha256"], "RESOURCE_PRIVATE_MEMBER_CHANGED")
            if raw[:4] == b"\0\0\xff\xff":
                short_imports += 1
                continue
            info = coff_sections(raw)
            scanned[0] += 1
            require(scanned[0] <= MAX_SCAN_OBJECTS, "RESOURCE_OBJECT_BUDGET")
            require(not info["resourceSections"], "RESOURCE_PRIVATE_ARCHIVE_RESOURCE_OBJECT")
    if report is not None:
        report.pop("privateResourceCurrent", None)
    return {"scope": "all-reachable-private-PE-direct-objects-and-selected-archive-members",
            "observationsComplete": True, "scannedCoffObjects": scanned[0],
            "shortImportObjects": short_imports, "resourceObjectCount": 0,
            "targetCount": len(private_linkage["files"]),
            "archiveCount": len(archive_cache), "archiveBytes": archive_bytes}


def resource_compiler_evidence(source, builds, server_build, server, prefix, manifest,
                               owners, packages, report, work, run, *, toolchain_root=Path("/ucrt64")):
    source, builds, server_build, server = (Path(item).resolve() for item in (source, builds, server_build, server))
    prefix, work, toolchain_root = (Path(item).resolve() for item in (prefix, work, toolchain_root))
    source_directory, build_directory = source / "hw/xwin", server_build / "hw/xwin"
    makefile, makefile_in = build_directory / "Makefile", source_directory / "Makefile.in"
    require(makefile.is_file() and makefile_in.is_file(), "RESOURCE_MAKEFILE_MISSING")
    makefile_bytes, makefile_in_bytes = makefile.read_bytes(), makefile_in.read_bytes()
    rule = parse_makefile_resource_rule(makefile.read_text(encoding="utf-8"))
    source_rule = parse_makefile_resource_rule(makefile_in.read_text(encoding="utf-8"), allow_unresolved=True)
    require(source_rule["recipe"] == rule["recipe"] and
            source_rule["prerequisites"] == rule["prerequisites"], "RESOURCE_SOURCE_RULE")

    planned = run(resource_make_dry_run_arguments(rule), build_directory, capture=True)
    command = parse_windres_command(planned, rule, build_directory, source_directory)
    include_paths = [(build_directory / item).resolve() for item in command["includes"]]
    require(include_paths == [(server_build / "include").resolve()], "RESOURCE_INCLUDE_PATH")
    windres_path = Path(shutil.which(command["command"][0]) or "").resolve()
    gcc_path = Path(shutil.which("gcc") or "").resolve()
    require(windres_path.is_file() and windres_path.is_relative_to(toolchain_root), "RESOURCE_WINDRES_PATH")
    require(gcc_path.is_file() and gcc_path.is_relative_to(toolchain_root), "RESOURCE_PREPROCESSOR_PATH")
    target = run([gcc_path, "-dumpmachine"], work, capture=True).strip()
    require(target == manifest["target"], "RESOURCE_PREPROCESSOR_TARGET")

    package_files = {}
    windres_package = run(["pacman", "-Qqo", windres_path], work, capture=True).strip()
    gcc_package = run(["pacman", "-Qqo", gcc_path], work, capture=True).strip()
    require(re.fullmatch(r"mingw-w64-ucrt-x86_64-[A-Za-z0-9+_.-]+", windres_package)
            and re.fullmatch(r"mingw-w64-ucrt-x86_64-[A-Za-z0-9+_.-]+", gcc_package),
            "RESOURCE_TOOL_PACKAGE")
    for path, package in ((windres_path, windres_package), (gcc_path, gcc_package)):
        identity = str(path.resolve()).casefold()
        require(identity not in package_files or package_files[identity] == package,
                "RESOURCE_TOOL_OWNER_AMBIGUOUS")
        package_files[identity] = package
    for package in {windres_package, gcc_package}:
        if package not in packages:
            packages[package] = package_evidence(package, work, run, package_files)
    windres_record = _tool_record(windres_path, windres_package, "resource-compiler", work, run)
    gcc_record = _tool_record(gcc_path, gcc_package, "resource-preprocessor", work, run)
    gcc_record["target"] = target

    resource_object = command["output"]
    require(resource_object.is_file(), "RESOURCE_OBJECT_MISSING")
    object_bytes = resource_object.read_bytes()
    object_info = coff_sections(object_bytes)
    require(object_info["resourceSections"], "RESOURCE_OBJECT_SECTION")
    static_inputs = [item for item in report["staticLink"]["inputs"]
                     if item["origin"] in {"server-build", "component-build"}
                     and item["path"].replace("\\", "/").endswith("/hw/xwin/XWin.o")]
    require(len(static_inputs) == 1 and static_inputs[0]["size"] == len(object_bytes)
            and static_inputs[0]["sha256"] == digest(object_bytes), "RESOURCE_OBJECT_LINK_IDENTITY")

    with tempfile.TemporaryDirectory(prefix="xwin-resource-repro-", dir=work) as temporary:
        repro_output = Path(temporary) / "XWin.resource.o"
        repro_command = list(command["command"])
        repro_command[repro_command.index("-o") + 1] = str(repro_output)
        repro_command.insert(1, "-v")
        verbose = run(repro_command, build_directory, capture=True)
        require(repro_output.is_file(), "RESOURCE_REPRO_OUTPUT")
        repro_info = coff_sections(repro_output.read_bytes())
        original = [(item["name"], item["rawSize"], item["rawSha256"])
                    for item in object_info["resourceSections"]]
        reproduced = [(item["name"], item["rawSize"], item["rawSha256"])
                      for item in repro_info["resourceSections"]]
        require(original == reproduced, "RESOURCE_REPRO_CHANGED")
        require("gcc" in verbose.lower(), "RESOURCE_PREPROCESSOR_NOT_OBSERVED")
        repro_hash = digest(repro_output.read_bytes())

    preprocessor_args = ["-E", "-M", "-xc-header", "-DRC_INVOKED"]
    for define in command["defines"]:
        preprocessor_args.extend(["-D", define])
    for undefine in command["undefines"]:
        preprocessor_args.extend(["-U", undefine])
    for include in command["includes"]:
        preprocessor_args.extend(["-I", include])
    preprocessor_args.append(command["command"][command["command"].index("-i") + 1])
    dependency_output = run([gcc_path, *preprocessor_args], build_directory, capture=True)
    dependency_names = make_dependencies(dependency_output)
    windows_roots = [(run(["cygpath", "-m", root], work, capture=True).strip().rstrip("/"), root)
                     for root in (work, toolchain_root)]
    dependencies = sorted({dependency_path(name, build_directory, windows_roots) for name in dependency_names},
                          key=lambda path: str(path).casefold())
    require(command["input"] in dependencies, "RESOURCE_RC_DEPENDENCY")
    dependency_basenames = {path.name.casefold() for path in dependencies}
    require({"windows.h", "winresource.h", "xwin-config.h", "version-config.h"} <= dependency_basenames,
            "RESOURCE_HEADER_DEPENDENCIES")

    anchors = {item["path"]: item for item in manifest["serverFileReview"]}
    required = {"hw/xwin/XWin.rc", "hw/xwin/XWin.exe.manifest", "hw/xwin/X.ico", "hw/xwin/system.XWinrc"}
    require(required <= set(anchors), "RESOURCE_SOURCE_ANCHORS")
    input_records = {}
    for path in dependencies:
        key = str(path).casefold()
        record = _record_input(path, "preprocessor-dependency", source, builds, prefix,
                               toolchain_root, owners, packages, package_files, work, run)
        if key in input_records:
            input_records[key]["roles"].append("preprocessor-dependency")
        else:
            record["roles"] = [record.pop("role")]
            input_records[key] = record

    rc_bytes = command["input"].read_bytes()
    rc_anchor = anchors["hw/xwin/XWin.rc"]
    require(len(rc_bytes) == rc_anchor["size"] and digest(rc_bytes) == rc_anchor["sha256"],
            "RESOURCE_RC_ANCHOR")
    header = source_directory / "winresource.h"
    require(header.is_file(), "RESOURCE_HEADER_MISSING")
    header_bytes = header.read_bytes()
    require(b"Permission is hereby granted" in header_bytes and b"Harold L Hunt II" in header_bytes,
            "RESOURCE_HEADER_NOTICE")
    resource_files = []
    for reference in parse_resource_references(rc_bytes):
        relative = Path(reference["path"])
        require(not relative.is_absolute() and ".." not in relative.parts, "RESOURCE_REFERENCE_PATH")
        path = (source_directory / relative).resolve()
        require(path.is_relative_to(source_directory.resolve()), "RESOURCE_REFERENCE_PATH")
        role = "icon-resource" if reference["type"] == "ICON" else "manifest-resource"
        record = _record_input(path, role, source, builds, prefix, toolchain_root,
                               owners, packages, package_files, work, run)
        key = str(path).casefold()
        if key in input_records:
            input_records[key]["roles"].append(role)
        else:
            record["roles"] = [record.pop("role")]
            input_records[key] = record
        anchor_path = "hw/xwin/" + path.name
        anchor = anchors.get(anchor_path)
        require(anchor and record["size"] == anchor["size"] and record["sha256"] == anchor["sha256"],
                "RESOURCE_SOURCE_ANCHOR")
        resource_files.append({**reference, "path": anchor_path, "size": record["size"],
                               "sha256": record["sha256"], "licenseReview": anchor.get("review")})

    header_record = _record_input(header, "resource-header", source, builds, prefix, toolchain_root,
                                  owners, packages, package_files, work, run)
    header_key = str(header.resolve()).casefold()
    if header_key in input_records:
        input_records[header_key]["roles"].append("resource-header")
    else:
        header_record["roles"] = [header_record.pop("role")]
        input_records[header_key] = header_record
    for item in input_records.values():
        item["roles"] = sorted(set(item["roles"]))
    dependency_records = sorted(input_records.values(), key=lambda item: (item["origin"], item["path"].casefold()))

    ico_bytes = (source_directory / "X.ico").read_bytes()
    manifest_bytes = (source_directory / "XWin.exe.manifest").read_bytes()
    image_bytes = server.read_bytes()
    image_keys = [key for key in report["serverInstalledFiles"] if Path(key).name.casefold() == server.name.casefold()]
    require(len(image_keys) == 1, "RESOURCE_FINAL_IMAGE_IDENTITY")
    installed_image = report["serverInstalledFiles"][image_keys[0]]
    require(installed_image["size"] == len(image_bytes)
            and installed_image["sha256"] == digest(image_bytes), "RESOURCE_FINAL_IMAGE_IDENTITY")
    directory = parse_pe_resources(image_bytes)
    payloads = verify_xwin_resource_payloads(directory["resources"], rc_bytes, header_bytes,
                                              ico_bytes, manifest_bytes)

    system_config = source_directory / "system.XWinrc"
    config_anchor = anchors["hw/xwin/system.XWinrc"]
    require(system_config.is_file() and system_config.stat().st_size == config_anchor["size"]
            and digest(system_config.read_bytes()) == config_anchor["sha256"],
            "RESOURCE_SYSTEM_CONFIG_SOURCE")
    installed_configs = [key for key in report["serverInstalledFiles"] if key.endswith("/system.XWinrc")]
    require(len(installed_configs) == 1, "RESOURCE_SYSTEM_CONFIG_INSTALL")
    installed_config = prefix / installed_configs[0]
    require(installed_config.is_file() and installed_config.read_bytes() == system_config.read_bytes(),
            "RESOURCE_SYSTEM_CONFIG_IDENTITY")

    xwin_scan = _scan_xwin_link_objects(builds, prefix, toolchain_root, report["staticLink"],
                                        report["archiveMembers"], resource_object)
    private_scan = _scan_private_resource_objects(report["privatePeLinkage"], builds, prefix,
                                                  toolchain_root, report)
    report["privatePeLinkage"]["resourceObjectScan"] = private_scan
    report["privatePeLinkage"]["resourceCompilerInputsIncluded"] = True
    report["compilerInputs"]["resourceCompilerInputsIncluded"] = True
    report["runtimePackages"] = list(packages.values())
    return {"scope": "XWin-resource-object-to-final-PE-plus-all-reachable-private-PE-object-scan",
            "observationsComplete": True, "distributionApproved": False,
            "makefile": {"source": {"path": "hw/xwin/Makefile.in", "size": len(makefile_in_bytes),
                                    "sha256": digest(makefile_in_bytes)},
                         "generated": {"path": "xorg-server/hw/xwin/Makefile", "size": len(makefile_bytes),
                                       "sha256": digest(makefile_bytes)},
                         "windres": rule["windres"], "recipe": rule["recipe"],
                         "prerequisites": rule["prerequisites"], "plannedCommand": command["commandLine"],
                         "plannedCommandSha256": digest(command["commandLine"].encode())},
            "compiler": {"windres": windres_record, "preprocessor": gcc_record,
                         "preprocessorDefaults": ["-E", "-xc-header", "-DRC_INVOKED"],
                         "verboseOutputSha256": digest(verbose.encode()), "target": target},
            "dependencies": {"method": "windres-default-gcc-preprocessor-with-GCC-M",
                             "command": preprocessor_args, "outputSha256": digest(dependency_output.encode()),
                             "files": dependency_records},
            "resourceScript": {"path": "hw/xwin/XWin.rc", "size": len(rc_bytes),
                               "sha256": digest(rc_bytes), "licenseReview": rc_anchor.get("review")},
            "resourceFiles": resource_files,
            "resourceHeader": {"path": "hw/xwin/winresource.h", "size": header_record["size"],
                               "sha256": header_record["sha256"],
                               "licenseEvidence": "actual-permissive-notice-present"},
            "resourceObject": {"path": "xorg-server/hw/xwin/XWin.o", "size": len(object_bytes),
                               "sha256": digest(object_bytes), "sections": object_info["resourceSections"],
                               "linkedInput": True, "reproducedResourceSections": reproduced,
                               "reproducedObjectSha256": repro_hash, "linkObjectScan": xwin_scan},
            "linkedImage": {"path": image_keys[0], "size": len(image_bytes),
                            "sha256": digest(image_bytes), "resourceDirectoryRva": directory["rva"],
                            "resourceDirectorySize": directory["size"], **payloads},
            "runtimeConfiguration": {"source": {"path": "hw/xwin/system.XWinrc",
                                                "size": config_anchor["size"], "sha256": config_anchor["sha256"]},
                                     "installedPath": installed_configs[0],
                                     "installedSha256": digest(installed_config.read_bytes()),
                                     "identityVerified": True},
            "privateTargetResourceScan": private_scan,
            "resourceCompilerInputsIncluded": True,
            "prebuiltDllInternalsIncluded": False,
            "perFileLicenseReviewComplete": False,
            "unresolvedRights": ["XWin.exe.manifest", "X.ico", "system.XWinrc"],
            "inputCount": len(dependency_records)}
