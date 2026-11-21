#!/usr/bin/env python3
"""采集预编译运行库的固定上游归档字节，不解包、不批准分发。"""

import argparse
import json
from pathlib import Path
import re
from urllib.parse import urlsplit

from xserver_source_review import ASSETS, ReviewError, require, verify_file, write_report
from xserver_windows_prebuilt import collect_materials
from xserver_windows_prebuilt_inputs import cached_material

MAX_ARCHIVE = 128 * 1024 * 1024
ARCHIVE_URLS = {
    "https://ftp.gnu.org/gnu/gcc/gcc-16.2.0/gcc-16.2.0.tar.xz",
    "https://xorg.freedesktop.org/releases/individual/lib/pixman-0.46.4.tar.xz",
    "https://github.com/madler/zlib/releases/download/v1.3.2/zlib-1.3.2.tar.xz",
}


def check_upstream_url(url):
    parsed = urlsplit(url)
    require(parsed.scheme == "https" and not parsed.fragment, "UPSTREAM_URL")
    # GitHub的短期CDN签名只用于下载，不进入缓存标识或报告。
    cdn = (parsed.netloc == "release-assets.githubusercontent.com"
           and re.fullmatch(r"/github-production-release-asset/2359378/[0-9a-f-]{36}", parsed.path)
           and len(parsed.query) <= 8192)
    require(url in ARCHIVE_URLS or cdn, "UPSTREAM_URL")


def initial_result():
    return {"schema": 1, "status": "FAIL", "observationsComplete": False,
            "sourceArchiveBytesVerified": False, "upstreamSourceMaterialsComplete": False,
            "distributionApproved": False, "bundled": False, "desktopVerified": False,
            "packageSignaturesVerified": False, "upstreamSignaturesVerified": False,
            "prebuiltDllInternalsIncluded": False, "perFileLicenseReviewComplete": False,
            "sourceDistributionApproved": False, "archives": [], "pendingVcs": []}


def collect_sources(cache, *, offline=False, result=None, assets=ASSETS):
    if result is None:
        result = {}
    result.clear()
    result.update(initial_result())
    # 不是接收任意JSON中的成功标志：本次重新核验实际包与精确配方。
    materials = collect_materials(cache, offline=offline, assets=assets)
    result["materialManifestSha256"] = materials["manifestSha256"]
    result["providerBinding"] = materials["providerBinding"]
    result["nativeBaselineReference"] = materials["nativeBaselineReference"]
    pending, selected = [], []
    for item in materials["files"]:
        source = item["sourceReferences"]
        pkgbuild = next(row for row in item["recipe"]["files"] if row["path"].endswith("/PKGBUILD"))
        path = cache / pkgbuild["sha256"]
        verify_file(path, pkgbuild["size"], pkgbuild["sha256"])
        recipe_bytes = path.read_bytes()
        if source.get("kind") == "git":
            require(re.fullmatch(r"[0-9a-f]{40}", source["commit"])
                    and re.fullmatch(r"[0-9a-f]{64}", source["declaredMakepkgArchiveSha256"])
                    and source["url"] == "git+https://git.code.sf.net/p/mingw-w64/mingw-w64#commit=" + source["commit"],
                    "UPSTREAM_VCS_REFERENCE")
            require(source["commit"].encode("ascii") in recipe_bytes
                    and source["declaredMakepkgArchiveSha256"].encode("ascii") in recipe_bytes,
                    "UPSTREAM_RECIPE_CHECKSUM")
            pending.append({"package": item["package"], "commit": source["commit"],
                            "declaredMakepkgArchiveSha256": source["declaredMakepkgArchiveSha256"],
                            "makepkgArchiveChecksumIndependentlyReproduced": False})
            continue
        pin = {"url": source["upstreamArchiveUrl"], "sha256": source["declaredArchiveSha256"],
               "size": source["upstreamArchiveSize"]}
        require(pin["url"] in ARCHIVE_URLS, "UPSTREAM_URL")
        require(pin["sha256"].encode("ascii") in recipe_bytes, "UPSTREAM_RECIPE_CHECKSUM")
        selected.append((item, pin))
    require(len(selected) == 3 and {pin["url"] for _, pin in selected} == ARCHIVE_URLS
            and len(pending) == 1, "UPSTREAM_SOURCE_SET")
    result["pendingVcs"] = pending
    for item, pin in selected:
        result["currentPackage"] = item["package"]
        recipe = item["recipe"]
        pkgbuild = next(row for row in recipe["files"] if row["path"].endswith("/PKGBUILD"))
        cached_material(cache, pin, offline, url_check=check_upstream_url,
                        max_input=MAX_ARCHIVE, download_budget=600)
        result["archives"].append({"package": item["package"], "version": item["version"],
                                   "provider": item["provider"], "archive": pin,
                                   "recipeCommit": recipe["commit"],
                                   "pkgbuildSha256": pkgbuild["sha256"],
                                   "detachedSignatureDeclared": item["sourceReferences"]["detachedSignatureDeclared"],
                                   "signatureVerified": False, "inventoryReviewed": False})
    result.pop("currentPackage", None)
    result.update(status="REVIEW-REQUIRED", observationsComplete=True, sourceArchiveBytesVerified=True)
    return result


def main(arguments=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--offline", action="store_true")
    args = parser.parse_args(arguments)
    result = initial_result()
    try:
        # 缓存中只有hash文件名；避免报告路径删除一个输入或制造自引用。
        require(args.report.resolve().parent != args.cache.resolve(), "UPSTREAM_REPORT_IN_CACHE")
        args.report.unlink(missing_ok=True)
    except ReviewError as error:
        print("FAIL: " + str(error))
        return 1
    except OSError:
        print("FAIL: REPORT_WRITE")
        return 1
    code = 1
    try:
        collect_sources(args.cache, offline=args.offline, result=result)
        code = 0
    except (ReviewError, OSError, ValueError, KeyError, TypeError, AttributeError, StopIteration) as error:
        result["error"] = str(error) if isinstance(error, ReviewError) else "UPSTREAM_COLLECTION_FAILED"
    try:
        write_report(args.report, result)
    except OSError:
        print("FAIL: REPORT_WRITE")
        return 1
    print(result["status"] + (": " + result["error"] if "error" in result else ": source archive bytes only; VCS/signatures/distribution pending"))
    return code


if __name__ == "__main__":
    raise SystemExit(main())
