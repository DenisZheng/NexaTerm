#!/usr/bin/env python3
"""核对原生基线的预编译包、精确配方及素材清单，不批准分发。"""

import argparse
import hashlib
import json
from pathlib import Path
import re

from xserver_source_review import ASSETS, ReviewError, digest, require, write_report
from xserver_windows_prebuilt_inputs import cached_material, inspect_package, parse_metadata, single


def bind_providers(native, packages):
    require(isinstance(native, dict), "PREBUILT_NATIVE_INCOMPLETE")
    require(native.get("privatePeLinkage", {}).get("observationsComplete"), "PREBUILT_NATIVE_INCOMPLETE")
    observed = native["privatePeLinkage"]["prebuiltDllsExcluded"]
    expected = [item["provider"] for item in packages]
    require(len(observed) == len(expected) and sorted(observed, key=lambda item: item["name"])
            == sorted(expected, key=lambda item: item["name"]), "PREBUILT_PROVIDER_CHANGED")
    for item in packages:
        rows = [p for p in native["runtimePackages"] if p["package"] == item["package"]]
        require(len(rows) == 1 and rows[0]["version"] == item["version"], "PREBUILT_VERSION_CHANGED")
        require(rows[0]["licenseFiles"] == item["installedNotices"], "PREBUILT_NOTICE_CHANGED")


def collect_materials(cache, *, native=None, offline=False, result=None, assets=ASSETS):
    if result is None:
        result = {}
    result.clear()
    result.update({"schema": 1, "status": "FAIL", "observationsComplete": False,
                   "distributionApproved": False, "bundled": False, "desktopVerified": False,
                   "prebuiltDllInternalsIncluded": False, "perFileLicenseReviewComplete": False,
                   "packageSignaturesVerified": False, "upstreamSourceArchivesCollected": False,
                   "sourceDistributionApproved": False, "files": []})
    raw = (assets / "prebuilt-runtime-materials.json").read_bytes()
    manifest = json.loads(raw)
    require(manifest["schema"] == 1 and len(manifest["packages"]) == 4, "PREBUILT_MANIFEST")
    require(len({item["package"] for item in manifest["packages"]}) == 4
            and len({item["provider"]["name"] for item in manifest["packages"]}) == 4, "PREBUILT_MANIFEST")
    result["manifestSha256"] = digest(raw)
    result["nativeBaselineReference"] = manifest["nativeBaselineReference"]
    result["providerBinding"] = "fixed-baseline-reference"
    if native is not None:
        bind_providers(native, manifest["packages"])
        result["providerBinding"] = "enclosing-native-report"
    for item in manifest["packages"]:
        result["currentPackage"] = item["package"]
        path = cached_material(cache, item["archive"], offline)
        payloads = inspect_package(path, item)
        package_info = parse_metadata(payloads[".PKGINFO"])
        build_info = parse_metadata(payloads[".BUILDINFO"])
        require(single(package_info, "pkgname") == single(build_info, "pkgname") == item["package"]
                and single(package_info, "pkgver") == single(build_info, "pkgver") == item["version"]
                and single(package_info, "arch") == single(build_info, "pkgarch") == "any",
                "PREBUILT_PACKAGE_IDENTITY")
        recipe = item["recipe"]
        require(re.fullmatch(r"[0-9a-f]{40}", recipe["commit"])
                and re.fullmatch(r"mingw-w64-[a-z0-9+-]+", recipe["directory"])
                and 0 < len(recipe["files"]) <= 128
                and len({pin["path"] for pin in recipe["files"]}) == len(recipe["files"]),
                "PREBUILT_RECIPE_SCOPE")
        observed_files = []
        for pin in recipe["files"]:
            require(re.fullmatch(re.escape(recipe["directory"]) + r"/[A-Za-z0-9_+.-]+", pin["path"])
                    and pin["path"].split("/")[-1] not in {".", ".."}
                    and pin["url"] == "https://raw.githubusercontent.com/msys2/MINGW-packages/"
                    + recipe["commit"] + "/" + pin["path"], "PREBUILT_RECIPE_SCOPE")
            content = cached_material(cache, pin, offline).read_bytes()
            blob = hashlib.sha1(b"blob " + str(len(content)).encode() + b"\0" + content).hexdigest()
            require(blob == pin["gitBlob"], "PREBUILT_RECIPE_BLOB")
            observed_files.append({key: pin[key] for key in ("path", "size", "sha256", "gitBlob")})
        pkgbuilds = [pin for pin in recipe["files"] if pin["path"] == recipe["directory"] + "/PKGBUILD"]
        require(len(pkgbuilds) == 1 and pkgbuilds[0]["sha256"] == single(build_info, "pkgbuild_sha256sum"),
                "PREBUILT_RECIPE_CHANGED")
        recipe_bytes = cached_material(cache, pkgbuilds[0], offline).read_bytes()
        for pin in recipe["files"]:
            if pin is not pkgbuilds[0]:
                require(Path(pin["path"]).name.encode() in recipe_bytes
                        and pin["sha256"].encode() in recipe_bytes, "PREBUILT_LOCAL_SOURCE_REFERENCE")
        external = []
        for pin in item.get("externalMaterials", []):
            cached_material(cache, pin, offline)
            require(pin["sha256"].encode() in recipe_bytes, "PREBUILT_EXTERNAL_SOURCE_REFERENCE")
            external.append(pin)
        dll = payloads["ucrt64/bin/" + item["provider"]["name"]]
        require(len(dll) == item["provider"]["size"] and digest(dll) == item["provider"]["sha256"],
                "PREBUILT_DLL_CHANGED")
        for name, sha in item["installedNotices"].items():
            require(digest(payloads["ucrt64/" + name]) == sha, "PREBUILT_NOTICE_CHANGED")
        result["files"].append({"package": item["package"], "version": item["version"],
                                "provider": item["provider"], "archive": item["archive"],
                                "packageMembers": item["files"], "memberCount": len(item["members"]),
                                "declaredLicenses": package_info.get("license", []),
                                "declaredDependencies": package_info.get("depend", []),
                                "installedNotices": item["installedNotices"],
                                "recipe": {"commit": recipe["commit"], "directory": recipe["directory"],
                                           "files": observed_files},
                                "declaredBuildEnvironment": build_info.get("installed", []),
                                "declaredBuildOptions": build_info.get("options", []),
                                "declaredBuildEnvironmentOptions": build_info.get("buildenv", []),
                                "declaredBuildTool": {"name": single(build_info, "buildtool"),
                                                      "version": single(build_info, "buildtoolver")},
                                "externalMaterials": external,
                                "sourceReferences": item["sourceReferences"],
                                "sourceReferenceScope": "reviewed-declarations-not-fetched-upstream-archives",
                                "recipeDirectoryScope": "fixed-directory-materials-not-selected-DLL-link-inputs"})
    result.pop("currentPackage", None)
    result.update({"status": "REVIEW-REQUIRED", "observationsComplete": True})
    return result


def main(arguments=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--native-report", type=Path)
    parser.add_argument("--offline", action="store_true")
    args = parser.parse_args(arguments)
    result = {"schema": 1, "status": "FAIL", "observationsComplete": False,
              "distributionApproved": False, "bundled": False, "desktopVerified": False}
    code = 1
    try:
        native = None
        if args.native_report:
            require(args.native_report.stat().st_size <= 32 * 1024 * 1024, "PREBUILT_NATIVE_BUDGET")
            raw = args.native_report.read_bytes()
            native = json.loads(raw)
            require(isinstance(native, dict) and native.get("status") == "REVIEW-REQUIRED" and native.get("stage") == "complete"
                    and native.get("nativeBuildVerified") is True and native.get("nativeVersionVerified") is True,
                    "PREBUILT_NATIVE_INCOMPLETE")
        collect_materials(args.cache, native=native, offline=args.offline, result=result)
        if native is not None:
            result["providerBinding"] = "supplied-complete-native-report"
            result["suppliedNativeReportSha256"] = digest(raw)
        code = 0
    except (ReviewError, OSError, ValueError, KeyError, TypeError, AttributeError) as error:
        result["error"] = str(error) if isinstance(error, ReviewError) else "PREBUILT_COLLECTION_FAILED"
    write_report(args.report, result)
    print(result["status"], result.get("currentPackage", ""), result.get("error", ""))
    return code


if __name__ == "__main__":
    raise SystemExit(main())
