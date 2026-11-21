"""自写四包夹具；普通 tar 只读核验，不包含可执行第三方代码。"""

import hashlib
import io
import json
import tarfile

from xserver_source_review import digest


def pin_bytes(cache, raw, url):
    pin = {"size": len(raw), "sha256": digest(raw), "url": url}
    (cache / pin["sha256"]).write_bytes(raw)
    return pin


def pin_recipe(cache, raw, directory, name):
    path = directory + "/" + name
    pin = pin_bytes(cache, raw, "https://raw.githubusercontent.com/msys2/MINGW-packages/"
                    + "a" * 40 + "/" + path)
    return {**pin, "path": path,
            "gitBlob": hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest()}


def pin_package(cache, item, payloads):
    stream = io.BytesIO()
    with tarfile.open(fileobj=stream, mode="w", format=tarfile.USTAR_FORMAT) as archive:
        for name, raw in payloads.items():
            member = tarfile.TarInfo(name)
            member.size = len(raw)
            archive.addfile(member, io.BytesIO(raw))
    item["archive"] = pin_bytes(cache, stream.getvalue(), "https://repo.msys2.org/mingw/ucrt64/"
                                 + item["package"] + "-1-1-any.pkg.tar.zst")
    item["members"] = list(payloads)
    item["files"] = {name: {"size": len(raw), "sha256": digest(raw)} for name, raw in payloads.items()}


def make_fixture(root):
    cache, assets = root / "cache", root / "assets"
    cache.mkdir()
    assets.mkdir()
    manifest = {"schema": 1, "nativeBaselineReference": {"scope": "fixture"}, "packages": []}
    payloads = []
    for index in range(4):
        name, directory = "fixture" + str(index), "mingw-w64-fixture" + str(index)
        patch = pin_recipe(cache, b"fixture patch", directory, "fix.patch")
        external = pin_bytes(cache, b"external patch", "https://patch-diff.githubusercontent.com/raw/madler/zlib/pull/1165.patch")
        recipe = pin_recipe(cache, ("source=(fix.patch 1165.patch)\nsha256sums=('"
                            + patch["sha256"] + "' '" + external["sha256"] + "')\n").encode(), directory, "PKGBUILD")
        package = "mingw-w64-ucrt-x86_64-" + name
        dll, notice = ("fixture dll " + name).encode(), b"fixture license"
        provider = {"name": name + ".dll", "package": package, "origin": "target-toolchain",
                    "component": None, "size": len(dll), "sha256": digest(dll)}
        item = {"package": package, "version": "1-1", "provider": provider,
                "installedNotices": {"share/licenses/" + name + "/LICENSE": digest(notice)},
                "recipe": {"directory": directory, "commit": "a" * 40, "files": [recipe, patch]},
                "externalMaterials": [external], "sourceReferences": {"scope": "fixture-declaration"}}
        metadata = "pkgname = " + package + "\npkgver = 1-1\n"
        content = {".PKGINFO": (metadata + "arch = any\nlicense = fixture\n").encode(),
                   ".BUILDINFO": (metadata + "pkgarch = any\npkgbuild_sha256sum = " + recipe["sha256"]
                                  + "\nbuildtool = fixture\nbuildtoolver = 1\ninstalled = compiler-0\n"
                                  + "installed = other-1\noptions = !lto\nbuildenv = !sign\n").encode(),
                   "ucrt64/bin/" + provider["name"]: dll,
                   "ucrt64/share/licenses/" + name + "/LICENSE": notice}
        pin_package(cache, item, content)
        payloads.append(content)
        manifest["packages"].append(item)
    native = {"status": "REVIEW-REQUIRED", "stage": "complete", "nativeBuildVerified": True,
              "nativeVersionVerified": True, "privatePeLinkage": {"observationsComplete": True,
              "prebuiltDllsExcluded": [p["provider"].copy() for p in manifest["packages"]]},
              "runtimePackages": [{"package": p["package"], "version": p["version"],
                                   "licenseFiles": p["installedNotices"].copy()} for p in manifest["packages"]]}
    save_manifest(assets, manifest)
    return cache, assets, manifest, native, payloads


def save_manifest(assets, manifest):
    (assets / "prebuilt-runtime-materials.json").write_text(json.dumps(manifest), encoding="utf-8")
