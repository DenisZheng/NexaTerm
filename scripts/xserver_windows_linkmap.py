"""将GNU ld的已知内存BFD输入绑定到真实PE输出贡献；不虚构磁盘对象。"""

import re
import struct

from xserver_source_review import digest, require
from xserver_windows_pe import mapped_ranges


PRODUCER_PACKAGE = "mingw-w64-ucrt-x86_64-binutils"
PRODUCER_VERSION = "2.47-4"
GENERATOR_SOURCE = {
    "archive": "https://ftp.gnu.org/gnu/binutils/binutils-2.47.tar.bz2",
    "archiveSha256": "3068128c75cda9f898ccb4211d360246e8e195ffcc9dfb655b23ae23a54800e8",
    "path": "ld/pe-dll.c", "size": 104369,
    "sha256": "5b2d9a049c76e58796c6568a6035750f990089afe0e5733b62a5be3fbe8e05f0",
    "archiveSignatureIndependentlyVerified": False,
    "scope": "Reviewed BFD in-memory constructors for rtr/ertr and dll stuff; implementation is not vendored."}


def generated_kind(name):
    if name == "dll stuff":
        return "filler"
    match = re.fullmatch(r"XWin_exe_(rtr|ertr)[0-9]{6}\.o", name)
    return match[1] if match else None


def map_contributions(content, names):
    marker = "Linker script and memory map\n"
    require(content.count(marker) == 1, "LINK_GENERATED_MAP")
    lines = content.split(marker, 1)[1].splitlines()
    result = {name: [] for name in names}
    for index, line in enumerate(lines):
        section = re.fullmatch(r" (\.[^\s]+)(?:\s+(.*))?", line)
        if not section:
            continue
        row = section[2]
        if row is None and index + 1 < len(lines):
            row = lines[index + 1].strip()
        values = re.fullmatch(r"(0x[0-9a-fA-F]+)\s+(0x[0-9a-fA-F]+)\s+(.+)", row or "")
        if values and values[3] in result:
            result[values[3]].append((section[1], int(values[1], 16), int(values[2], 16)))
    return result


def memory_inputs(content, data, producer):
    require(len(content.encode()) <= 64 * 1024 * 1024, "LINK_GENERATED_MAP")
    loads = re.findall(r"^LOAD (.+)$", content, re.MULTILINE)
    names = [name for name in loads if generated_kind(name)]
    if not names:
        return {}
    require(len(names) <= 4096 and len(set(names)) == len(names), "LINK_GENERATED_COUNT")
    require(producer and producer.get("package") == PRODUCER_PACKAGE
            and producer.get("version") == PRODUCER_VERSION
            and re.fullmatch(r"[0-9a-f]{64}", producer.get("binarySha256", "")), "LINK_GENERATED_PRODUCER")
    rows = map_contributions(content, names)
    descriptors = []
    for name, sections in rows.items():
        kind = generated_kind(name)
        allowed = {"rtr": {".rdata_runtime_pseudo_reloc"}, "ertr": {".rdata"}, "filler": {".edata", ".reloc"}}[kind]
        require(sections and len({item[0] for item in sections}) == len(sections)
                and all(item[0] in allowed for item in sections), "LINK_GENERATED_SECTIONS")
        positive = [item for item in sections if item[2]]
        require(positive and all(0 < size <= 1024 * 1024 for _, _, size in positive), "LINK_GENERATED_SIZE")
        if kind != "filler":
            require(len(sections) == 1 and sections[0][2] in ({12, 24} if kind == "rtr" else {8}), "LINK_GENERATED_SIZE")
        descriptors.extend((name, section, address, size) for section, address, size in positive)
    require(sum(item[3] for item in descriptors) <= 8 * 1024 * 1024, "LINK_GENERATED_SIZE")
    ordered = sorted(descriptors, key=lambda item: item[2])
    require(all(left[2] + left[3] <= right[2] for left, right in zip(ordered, ordered[1:])), "LINK_GENERATED_OVERLAP")
    image, ranges = mapped_ranges(data, [(address, size) for _, _, address, size in descriptors])
    image_sha, text_sha = digest(data), digest(content.encode())
    result = {name: {"origin": "linker-generated-memory", "path": name,
                     "inputFilePresent": False, "inputFileSha256Available": False,
                     "imageSha256": image_sha, "mapTextSha256": text_sha,
                     "byteEvidence": "final-PE-output-contribution", "outputContributions": [],
                     "producer": {"package": producer["package"], "version": producer["version"],
                                  "binarySha256": producer["binarySha256"]},
                     "outputLicenseApprovalInferred": False} for name in names}
    pseudo = []
    for (name, section, address, size), item in zip(descriptors, ranges):
        kind, payload = generated_kind(name), item["bytes"]
        expected = ".rdata" if kind != "filler" else section
        require(item["sectionNameHex"] == expected.encode().hex(), "LINK_GENERATED_PE_SECTION")
        if kind == "rtr":
            require(struct.unpack("<III", payload[-12:])[2] in {8, 16, 32, 64}, "LINK_GENERATED_RELOC")
            if size == 24:
                require(payload[:12] == struct.pack("<III", 0, 0, 1), "LINK_GENERATED_RELOC")
            pseudo.append((address, size))
        elif kind == "ertr":
            symbols = {int(value, 16) for value in re.findall(r"^\s+(0x[0-9a-fA-F]+)\s+_pei386_runtime_relocator\s*$", content, re.MULTILINE)}
            require(len(symbols) == 1 and struct.unpack("<Q", payload)[0] + image["imageBase"] in symbols, "LINK_GENERATED_RELOCATOR")
        result[name]["outputContributions"].append({"inputSection": section, "outputSection": expected,
            "imageVA": address, "rva": item["rva"], "fileOffset": item["fileOffset"],
            "size": size, "sha256": digest(payload)})
    if pseudo:
        pseudo.sort()
        require(pseudo[0][1] == 24 and all(size == 12 for _, size in pseudo[1:])
                and all(a + size == b for (a, size), (b, _) in zip(pseudo, pseudo[1:])), "LINK_GENERATED_RELOC_TABLE")
    return result
