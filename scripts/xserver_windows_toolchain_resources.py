"""固定工具链 manifest 的对象、源材料和最终可达 PE 资源证据。"""

import json
from pathlib import Path

from xserver_source_review import ASSETS, digest, require
from xserver_windows_licenses import source_license_evidence

DEFAULT_MANIFEST_PACKAGE = "mingw-w64-ucrt-x86_64-windows-default-manifest"
DEFAULT_MANIFEST_PATH = "lib/default-manifest.o"


def default_manifest_evidence(toolchain_root, packages, *, assets=ASSETS):
    manifest = json.loads((assets / "toolchain-license-sources.json").read_bytes())
    pin = manifest["packages"][DEFAULT_MANIFEST_PACKAGE]
    package = packages.get(DEFAULT_MANIFEST_PACKAGE)
    require(package is not None and package["package"] == DEFAULT_MANIFEST_PACKAGE,
            "RESOURCE_DEFAULT_PACKAGE")
    path = toolchain_root / DEFAULT_MANIFEST_PATH
    source = source_license_evidence(DEFAULT_MANIFEST_PACKAGE, package["version"],
                                     package["declaredLicense"], [path],
                                     toolchain_root=toolchain_root, assets=assets)
    require(source is not None and source == package.get("sourceLicenseEvidence"),
            "RESOURCE_DEFAULT_SOURCE")
    raw = path.read_bytes()
    resource = pin["resourceEvidence"]
    section, payload = resource["section"], resource["payload"]
    start, size = section["rawOffset"], section["rawSize"]
    require(0 <= start < start + size <= len(raw)
            and digest(raw[start:start + size]) == section["rawSha256"], "RESOURCE_DEFAULT_SECTION")
    offset = resource["payloadSectionOffset"]
    require(0 <= offset < offset + payload["size"] <= size
            and digest(raw[start + offset:start + offset + payload["size"]]) == payload["sha256"],
            "RESOURCE_DEFAULT_PAYLOAD")
    return {"input": {"origin": "target-toolchain", "package": DEFAULT_MANIFEST_PACKAGE,
                      "path": DEFAULT_MANIFEST_PATH, **pin["installedFiles"][DEFAULT_MANIFEST_PATH]},
            "section": section, "payload": payload,
            "sourceBinding": {key: resource[key] for key in
                              ("sourceXmlSha256", "sourceBinding", "historicalCompilerReproduced")},
            "sourceLicenseEvidence": source, "distributionApproved": False}


def matches_default_manifest(item, sections, evidence):
    if evidence is None:
        return False
    expected = evidence["input"]
    actual = {key: item.get(key) for key in expected}
    actual["path"] = Path(actual["path"]).as_posix()
    return (actual == expected and len(sections) == 1
            and all(sections[0].get(key) == value for key, value in evidence["section"].items()))


def default_manifest_in_image(resources, target, evidence):
    require(target in {"xwin.exe", "xkbcomp.exe"}, "RESOURCE_DEFAULT_TARGET")
    payload = evidence["payload"]
    # LOAD 不是存活证明；只报告最终资源树可达的 payload，不推断链接器丢弃过程。
    matches = [item for item in resources if digest(item["data"]) == payload["sha256"]]
    if target == "xkbcomp.exe":
        require(len(resources) == len(matches) == 1
                and all(matches[0].get(key) == value for key, value in payload.items()),
                "RESOURCE_DEFAULT_FINAL_PAYLOAD")
    else:
        require(not matches, "RESOURCE_DEFAULT_XWIN_PAYLOAD")
    return {"target": target, "defaultPayloadReachable": bool(matches),
            "reachableDefaultPayloadCount": len(matches), "resourceCount": len(resources),
            "payload": payload, "finalSectionContributionInferred": False}
