"""将GNU链接map选中的archive成员绑定到已归属的实际archive字节。"""

from pathlib import Path
import re

from xserver_source_review import digest, require
from xserver_windows_inventory import link_input_path


MAX_ARCHIVE_BYTES = 64 * 1024 * 1024


def archive_members(data):
    require(8 <= len(data) <= MAX_ARCHIVE_BYTES and data[:8] == b"!<arch>\n", "AR_FORMAT")
    position, count, entries, names = 8, 0, [], None
    while position < len(data):
        count += 1
        require(count <= 20000 and position + 60 <= len(data), "AR_HEADER")
        header = data[position:position + 60]
        require(header[58:] == b"`\n" and re.fullmatch(rb"[0-9]+", header[48:58].strip()), "AR_HEADER")
        size = int(header[48:58].strip())
        start, end = position + 60, position + 60 + size
        require(end <= len(data), "AR_RANGE")
        name = header[:16].rstrip(b" ")
        if name == b"//":
            require(names is None and size <= 4 * 1024 * 1024, "AR_LONGNAMES")
            names = data[start:end]
        elif name not in {b"/", b"/SYM64/"}:
            entries.append((name, start, size))
        position = end + size % 2
        require(position <= len(data) and (size % 2 == 0 or data[end:position] == b"\n"), "AR_PADDING")
    result = {}
    for raw, start, size in entries:
        if re.fullmatch(rb"/[0-9]+", raw):
            offset = int(raw[1:])
            require(names is not None and offset < len(names)
                    and (offset == 0 or names[offset - 1:offset] in {b"\n", b"\0"}), "AR_LONGNAMES")
            stops = [value for value in [names.find(b"/\n", offset), names.find(b"\0", offset)] if value >= 0]
            require(stops, "AR_LONGNAMES")
            raw = names[offset:min(stops)]
        else:
            raw = raw.removesuffix(b"/")
        name = raw.decode("utf-8")
        require(re.fullmatch(r"[^/\\\x00-\x1f\x7f]{1,4096}", name)
                and name not in {".", ".."} and name == name.strip(), "AR_NAME")
        result.setdefault(name, []).append({"member": name, "fileOffset": start, "size": size,
                                           "sha256": digest(data[start:start + size])})
    return result


def map_selections(content, report=None):
    marker = "Archive member included to satisfy reference by file (symbol)\n"
    require(content.count(marker) == 1, "AR_MAP_SECTION")
    section = content.split(marker, 1)[1]
    stops = [section.find(value) for value in ["Allocating common symbols\n", "Merging program properties\n",
             "As-needed library included to satisfy reference by file (symbol)\n", "Discarded input sections\n",
             "There are no discarded input sections\n",
             "Memory Configuration\n", "Linker script and memory map\n"] if value in section]
    require(stops, "AR_MAP_SECTION")
    rows, seen = [], set()
    lines = section[:min(stops)].splitlines()
    for index, line in enumerate(lines):
        if not line.strip() or line[0].isspace():
            continue
        if report is not None:
            report["archiveMapCurrentRow"] = line[:4096]
        match = re.fullmatch(r"(.+?\.(?:a|lib))\(([^()]+)\)(?:\s+(.*))?", line)
        require(match and len(rows) < 10000, "AR_MAP_ROW")
        archive, member = match[1], match[2]
        identity = (archive, member)
        require(identity not in seen and len(archive) <= 4096 and len(member) <= 4096, "AR_MAP_ROW")
        reference = match[3]
        if not reference and index + 1 < len(lines) and lines[index + 1].startswith((" ", "\t")):
            reference = lines[index + 1].strip()
        require(reference, "AR_MAP_REFERENCE")
        seen.add(identity)
        rows.append((archive, member, reference[:4096]))
    require(rows, "AR_MAP_EMPTY")
    if report is not None:
        report.pop("archiveMapCurrentRow", None)
    return rows


def selected_members(map_file, link_directory, builds, prefix, inputs, work, run, report=None,
                     *, toolchain_root=Path("/ucrt64")):
    require(map_file.is_file() and map_file.stat().st_size <= MAX_ARCHIVE_BYTES, "AR_MAP_BUDGET")
    mapping = map_file.read_bytes()
    rows = map_selections(mapping.decode("utf-8").replace("\r\n", "\n"), report)
    roots = {"server-build": builds, "private-prefix": prefix, "target-toolchain": toolchain_root}
    known = {str((roots[x["origin"]] / x["path"]).resolve()).casefold(): x
             for x in inputs if x["origin"] in roots}
    cache, seen, total = {}, set(), 0
    result = {"scope": "XWin-selected-archive-members", "mapSha256": digest(mapping), "members": [],
              "observationsComplete": False, "finalSectionContributionInferred": False,
              "perFileLicenseReviewComplete": False, "dependencyDllInternalsIncluded": False}
    if report is not None:
        report["archiveMembers"] = result
    for raw, name, reference in rows:
        if report is not None:
            report["archiveMemberCurrent"] = {"archive": raw, "member": name}
        path = link_input_path(raw, link_directory, work, run)
        identity = str(path).casefold()
        require(identity in known, "AR_INPUT_OWNER")
        evidence = known[identity]
        if identity not in cache:
            require(path.is_file() and path.stat().st_size <= MAX_ARCHIVE_BYTES, "AR_INPUT_BUDGET")
            total += path.stat().st_size
            require(total <= 256 * 1024 * 1024, "AR_INPUT_BUDGET")
            data = path.read_bytes()
            require(digest(data) == evidence["sha256"], "AR_INPUT_CHANGED")
            cache[identity] = archive_members(data)
        require(name in cache[identity] and len(cache[identity][name]) == 1, "AR_MEMBER_AMBIGUOUS")
        require(cache[identity][name][0]["size"] > 0, "AR_MEMBER_EMPTY")
        require((identity, name) not in seen, "AR_MEMBER_DUPLICATE")
        seen.add((identity, name))
        result["members"].append({**cache[identity][name][0], "archiveOrigin": evidence["origin"],
            "archive": evidence["path"], "archiveSha256": evidence["sha256"], "reference": reference,
            **{key: evidence[key] for key in ["component", "package"] if key in evidence}})
    result["archiveCount"] = len(cache)
    result["archiveBytes"] = total
    result["observationsComplete"] = True
    if report is not None:
        report.pop("archiveMemberCurrent", None)
    return result
