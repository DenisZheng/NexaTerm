"""固定官方依赖下载入口，供原生构建和独立签名核验共享。"""

from pathlib import PurePosixPath
import time
from urllib.parse import urlsplit
from urllib.request import build_opener, HTTPRedirectHandler

from xserver_source_review import require, verify_file


def check_source_url(url):
    parsed = urlsplit(url)
    allowed = {"xorg.freedesktop.org": "/releases/individual/", "xcb.freedesktop.org": "/dist/"}
    require(parsed.scheme == "https" and parsed.netloc in allowed and not parsed.query
            and not parsed.fragment and parsed.path.startswith(allowed[parsed.netloc]), "SOURCE_URL")


class SourceRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, url):
        check_source_url(url)
        return super().redirect_request(request, response, code, message, headers, url)



def download_component(component, cache, filename=None):
    filename = filename or component["root"] + ".tar.xz"
    require(filename not in {".", ".."} and PurePosixPath(filename).name == filename
            and "\\" not in filename, "SOURCE_FILENAME")
    path = cache / filename
    if not path.exists():
        check_source_url(component["url"])
        temporary = path.with_suffix(".part")
        try:
            deadline = time.monotonic() + 120
            with build_opener(SourceRedirect()).open(component["url"], timeout=30) as response, temporary.open("wb") as output:
                check_source_url(response.url)
                size = 0
                while chunk := response.read(65536):
                    require(time.monotonic() < deadline, "SOURCE_TIMEOUT")
                    size += len(chunk)
                    require(size <= component["size"], "SOURCE_SIZE")
                    output.write(chunk)
            verify_file(temporary, component["size"], component["sha256"])
            temporary.replace(path)
        finally:
            temporary.unlink(missing_ok=True)
    verify_file(path, component["size"], component["sha256"])
    return path
