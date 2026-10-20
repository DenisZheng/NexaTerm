"""将缺少随包notice的已审查单个对象绑定到固定发布/源许可证据。"""

import json
from pathlib import Path, PurePosixPath

from xserver_source_review import ASSETS, digest, require, verify_file


def relative_path(value):
    path = PurePosixPath(value)
    require(value and path.parts and str(path) == value and not path.is_absolute()
            and ".." not in path.parts and "\\" not in value and ":" not in value,
            "TOOLCHAIN_SOURCE_LICENSE_PATH")
    return path


def source_license_evidence(package, version, declared, installed_files, *,
                            toolchain_root=Path("/ucrt64"), assets=ASSETS):
    raw = (assets / "toolchain-license-sources.json").read_bytes()
    manifest = json.loads(raw)
    require(manifest["schema"] == 1, "TOOLCHAIN_SOURCE_LICENSE_SCHEMA")
    item = manifest["packages"].get(package)
    if item is None:
        return None
    require(version == item["version"] and declared == item["packageDeclaredLicense"],
            "TOOLCHAIN_SOURCE_LICENSE_SCOPE")
    expected = {}
    for name, pin in item["installedFiles"].items():
        path = toolchain_root.joinpath(*relative_path(name).parts)
        require(path.is_file() and not path.is_symlink(), "TOOLCHAIN_SOURCE_LICENSE_FILE")
        verify_file(path, pin["size"], pin["sha256"])
        expected[str(path.resolve()).casefold()] = pin
    require(len(expected) == len(item["installedFiles"]), "TOOLCHAIN_SOURCE_LICENSE_SCOPE")
    actual = {str(path.resolve()).casefold() for path in installed_files}
    require(len(actual) == len(installed_files) == len(expected) and actual == set(expected),
            "TOOLCHAIN_SOURCE_LICENSE_SCOPE")
    notice = item["sourceRepositoryLicense"]
    path = assets.joinpath(*relative_path(notice["file"]).parts)
    require(not path.is_symlink(), "TOOLCHAIN_SOURCE_LICENSE_FILE")
    verify_file(path, notice["size"], notice["sha256"])
    return {"status": "REVIEW-REQUIRED", "origin": "fixed-packaging-source",
            "manifestSha256": digest(raw),
            "installedLicenseTextPresent": False, "distributionApproved": False,
            "packageDeclaredLicense": declared, "installedFiles": item["installedFiles"],
            "sourceRepositoryLicense": notice, "sourceProvenance": item["sourceProvenance"],
            "publishedPackage": item["publishedPackage"]}
