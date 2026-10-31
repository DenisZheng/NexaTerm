"""只读固定包/配方输入；不安装包、不执行配方或归档内程序。"""

from http.client import HTTPException
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import tempfile
import time
from urllib.parse import urlsplit
from urllib.request import build_opener, HTTPRedirectHandler

from xserver_source_review import ReviewError, digest, require, verify_file

MAX_INPUT = 8 * 1024 * 1024
MAX_TOOL_OUTPUT = 16 * 1024 * 1024


def check_material_url(url):
    parsed = urlsplit(url)
    require(parsed.scheme == "https" and not parsed.query and not parsed.fragment,
            "PREBUILT_URL")
    package = (parsed.netloc == "repo.msys2.org"
               and re.fullmatch(r"/mingw/ucrt64/mingw-w64-ucrt-x86_64-[A-Za-z0-9+_.-]+\.pkg\.tar\.zst", parsed.path))
    recipe = (parsed.netloc == "raw.githubusercontent.com"
              and re.fullmatch(r"/msys2/MINGW-packages/[0-9a-f]{40}/[A-Za-z0-9_./+-]+", parsed.path)
              and ".." not in PurePosixPath(parsed.path).parts)
    patch = (parsed.netloc == "patch-diff.githubusercontent.com"
             and parsed.path == "/raw/madler/zlib/pull/1165.patch")
    require(package or recipe or patch, "PREBUILT_URL")


class MaterialRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, url):
        check_material_url(url)
        return super().redirect_request(request, response, code, message, headers, url)


def cached_material(cache, pin, offline):
    require(re.fullmatch(r"[0-9a-f]{64}", pin["sha256"])
            and 0 < pin["size"] <= MAX_INPUT, "PREBUILT_PIN")
    check_material_url(pin["url"])
    cache.mkdir(parents=True, exist_ok=True)
    path = cache / pin["sha256"]
    require(not path.is_symlink(), "PREBUILT_CACHE_LINK")
    if not path.exists():
        require(not offline, "PREBUILT_OFFLINE_MISSING")
        temporary = None
        try:
            deadline = time.monotonic() + 120
            with build_opener(MaterialRedirect()).open(pin["url"], timeout=30) as response:
                check_material_url(response.url)
                with tempfile.NamedTemporaryFile(dir=cache, delete=False) as output:
                    temporary = Path(output.name)
                    total = 0
                    while True:
                        require(time.monotonic() < deadline, "PREBUILT_DOWNLOAD_TIMEOUT")
                        chunk = response.read(65536)
                        require(time.monotonic() < deadline, "PREBUILT_DOWNLOAD_TIMEOUT")
                        if not chunk:
                            break
                        total += len(chunk)
                        require(total <= pin["size"], "PREBUILT_DOWNLOAD_SIZE")
                        output.write(chunk)
            verify_file(temporary, pin["size"], pin["sha256"])
            temporary.replace(path)
        except (OSError, ValueError, HTTPException) as error:
            raise ReviewError("PREBUILT_DOWNLOAD_FAILED") from error
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)
    verify_file(path, pin["size"], pin["sha256"])
    return path


def archive_tool(arguments):
    # 归档先匹配完整 pin；工具 stdout 只落临时文件，避免把源码/诊断送入报告。
    try:
        with tempfile.TemporaryFile() as output, tempfile.TemporaryFile() as errors:
            result = subprocess.run(["tar", *map(str, arguments)], stdout=output, stderr=errors,
                                    timeout=30, check=False,
                                    env={key: value for key, value in os.environ.items()
                                         if key not in {"TAR_OPTIONS", "TAPE"}})
            require(result.returncode == 0, "PREBUILT_ARCHIVE_TOOL_EXIT")
            size = output.tell()
            require(size <= MAX_TOOL_OUTPUT, "PREBUILT_ARCHIVE_TOOL_BUDGET")
            output.seek(0)
            return output.read()
    except FileNotFoundError as error:
        raise ReviewError("PREBUILT_ARCHIVE_TOOL_MISSING") from error
    except subprocess.TimeoutExpired as error:
        raise ReviewError("PREBUILT_ARCHIVE_TOOL_TIMEOUT") from error


def inspect_package(path, pin, *, run=archive_tool):
    verify_file(path, pin["archive"]["size"], pin["archive"]["sha256"])
    listing = run(["-tf", path])
    require(len(listing) <= 65536, "PREBUILT_MEMBER_BUDGET")
    names = listing.decode("utf-8").splitlines()
    require(0 < len(names) <= 256 and len(names) == len(set(names)), "PREBUILT_MEMBERS")
    for name in names:
        value = name[:-1] if name.endswith("/") else name
        pure = PurePosixPath(value)
        require(value and str(pure) == value and not pure.is_absolute() and ".." not in pure.parts
                and "\\" not in value and ":" not in value and not value.startswith("-"), "PREBUILT_MEMBER_PATH")
    require(sorted(names) == sorted(pin["members"]), "PREBUILT_MEMBER_SET")
    require({name for name in names if not name.endswith("/")} == set(pin["files"]),
            "PREBUILT_FILE_SET")
    payloads = {}
    total = 0
    for name, expected in pin["files"].items():
        raw = run(["-xOf", path, name])
        total += len(raw)
        require(total <= MAX_TOOL_OUTPUT and len(raw) == expected["size"]
                and digest(raw) == expected["sha256"], "PREBUILT_MEMBER_BYTES")
        payloads[name] = raw
    return payloads


def parse_metadata(raw):
    require(0 < len(raw) <= 256 * 1024, "PREBUILT_METADATA_BUDGET")
    result = {}
    for line in raw.decode("utf-8").splitlines():
        if not line or line.startswith("#"):
            continue
        match = re.fullmatch(r"([a-z][a-z0-9_]*) = ([^\x00-\x1f\x7f]+)", line)
        require(match is not None and len(line) <= 8192, "PREBUILT_METADATA")
        result.setdefault(match[1], []).append(match[2])
    return result


def single(metadata, key):
    values = metadata.get(key, [])
    require(len(values) == 1, "PREBUILT_METADATA_SINGLE")
    return values[0]
