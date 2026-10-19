"""按PE32+文件结构读取实际普通/延迟DLL导入，不执行被检查文件。"""

import re
import struct

from xserver_source_review import require


MAX_PE_BYTES = 64 * 1024 * 1024


def parse_pe(data):
    require(64 <= len(data) <= MAX_PE_BYTES and data[:2] == b"MZ", "PE_HEADER")
    pe = struct.unpack_from("<I", data, 60)[0]
    require(64 <= pe <= len(data) - 24 and data[pe:pe + 4] == b"PE\0\0", "PE_HEADER")
    machine, count = struct.unpack_from("<HH", data, pe + 4)
    require(machine == 0x8664, "PE_ARCHITECTURE")
    optional_size = struct.unpack_from("<H", data, pe + 20)[0]
    optional = pe + 24
    require(240 <= optional_size and optional + optional_size <= len(data), "PE_HEADER")
    require(struct.unpack_from("<H", data, optional)[0] == 0x20B, "PE_ARCHITECTURE")
    require(1 <= count <= 96 and optional + optional_size + count * 40 <= len(data), "PE_SECTIONS")
    directories = struct.unpack_from("<I", data, optional + 108)[0]
    require(16 <= directories <= (optional_size - 112) // 8, "PE_DIRECTORIES")
    image_base = struct.unpack_from("<Q", data, optional + 24)[0]
    headers_size = struct.unpack_from("<I", data, optional + 60)[0]
    require(optional + optional_size + count * 40 <= headers_size <= len(data), "PE_HEADER")
    sections = []
    for index in range(count):
        start = optional + optional_size + index * 40
        virtual_size, address, raw_size, raw_pointer = struct.unpack_from("<IIII", data, start + 8)
        require(raw_pointer + raw_size <= len(data) and address + max(virtual_size, raw_size) <= 2 ** 32, "PE_SECTION_RANGE")
        sections.append((address, max(virtual_size, raw_size), raw_pointer, raw_size))

    def file_offset(address, size):
        require(size > 0 and 0 <= address < 2 ** 32 and address + size <= 2 ** 32, "PE_RVA")
        candidates = []
        if address < headers_size and address + size <= headers_size:
            candidates.append(address)
        for section_address, span, pointer, raw_size in sections:
            if section_address <= address < section_address + span:
                delta = address - section_address
                require(delta + size <= raw_size, "PE_RVA")
                candidates.append(pointer + delta)
        require(len(candidates) == 1, "PE_RVA")
        return candidates[0]

    def dll_name(address):
        for length in range(1, 261):
            offset = file_offset(address, length)
            if data[offset + length - 1] == 0:
                value = data[offset:offset + length - 1]
                require(re.fullmatch(rb"[A-Za-z0-9_.-]+\.dll", value, re.IGNORECASE), "PE_IMPORT_NAME")
                return value.decode("ascii").lower()
        require(False, "PE_IMPORT_NAME")

    def imports(index, words):
        address, size = struct.unpack_from("<II", data, optional + 112 + index * 8)
        if address == 0 and size == 0:
            return []
        width = words * 4
        require(address != 0 and width <= size <= 1024 * 1024, "PE_IMPORT_DIRECTORY")
        file_offset(address, size)
        result = []
        for position in range(min(size // width, 4096)):
            offset = file_offset(address + position * width, width)
            record = struct.unpack_from("<" + "I" * words, data, offset)
            if not any(record):
                return sorted(set(result))
            name = record[3] if index == 1 else record[1]
            if index == 13:
                require(record[0] in [0, 1], "PE_DELAY_ATTRIBUTES")
                if record[0] == 0:
                    require(image_base <= name, "PE_DELAY_ATTRIBUTES")
                    name -= image_base
            result.append(dll_name(name))
        require(False, "PE_IMPORT_TERMINATOR")

    normal = imports(1, 5)
    delay = imports(13, 8)
    return {"machine": "amd64", "normalImports": normal, "delayImports": delay,
            "imports": sorted(set(normal + delay)), "sectionCount": count}
