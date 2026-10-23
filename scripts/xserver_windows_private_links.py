"""按两个实际PE闭包补采私有DLL/键盘工具的链接输入，不覆盖预编译DLL内部。"""

from pathlib import Path
import re

from xserver_source_review import digest, require
from xserver_windows_archives import selected_members
from xserver_windows_inventory import link_input_path, link_inputs, map_output
from xserver_windows_linkmap import memory_inputs
from xserver_windows_pe import MAX_PE_BYTES


def bind_output(mapping, component_build, prefix, item, work, run, build_system):
    require(mapping.is_file() and not mapping.is_symlink()
            and mapping.stat().st_size <= 64 * 1024 * 1024, "PRIVATE_LINK_MAP")
    raw = map_output(mapping.read_text(encoding="utf-8"))
    require(Path(raw).name.casefold() == item["name"], "PRIVATE_LINK_TARGET")
    require(build_system in {"autotools", "meson"}, "PRIVATE_LINK_BUILD_SYSTEM")
    if re.match(r"^[A-Za-z]:", raw) or Path(raw).is_absolute():
        output = link_input_path(raw, component_build, work, run)
        directory = component_build if build_system == "meson" else (
            output.parent.parent if output.parent.name == ".libs" else output.parent)
    else:
        relative = Path(raw)
        require(".." not in relative.parts, "PRIVATE_LINK_OUTPUT")
        matches = [path for path in component_build.rglob(relative.name)
                   if path.is_file() and path.as_posix().endswith("/" + relative.as_posix())]
        require(len(matches) == 1, "PRIVATE_LINK_OUTPUT")
        output = matches[0]
        directory = output.parents[len(relative.parts) - 1]
    require(output.resolve().is_relative_to(component_build.resolve()) and output.is_file()
            and not output.is_symlink() and output.stat().st_size <= MAX_PE_BYTES, "PRIVATE_LINK_OUTPUT")
    installed = [path for path in (prefix / "bin").iterdir() if path.name.casefold() == item["name"]]
    require(len(installed) == 1 and installed[0].is_file() and not installed[0].is_symlink(), "PRIVATE_LINK_INSTALLED")
    image = output.read_bytes()
    require(len(image) == item["size"] and digest(image) == item["sha256"]
            and installed[0].read_bytes() == image, "PRIVATE_LINK_IMAGE_CHANGED")
    return output, directory, image


def reachable_targets(closures):
    targets = {}
    for closure in closures:
        for item in closure:
            require(re.fullmatch(r"[A-Za-z0-9_+.-]+\.(?:exe|dll)", item["name"])
                    and item["name"] == item["name"].casefold(), "PRIVATE_LINK_NAME")
            previous = targets.get(item["name"])
            identity = {key: item.get(key) for key in ["name", "origin", "sha256", "size", "component", "package"]}
            require(previous is None or previous == identity, "PRIVATE_LINK_CLOSURE_CHANGED")
            require(item["origin"] in {"private-prefix", "target-toolchain"}, "PRIVATE_LINK_ORIGIN")
            targets[item["name"]] = identity
    require(all(name in targets and targets[name]["origin"] == "private-prefix"
                for name in ["xwin.exe", "xkbcomp.exe"]), "PRIVATE_LINK_ROOTS")
    return sorted(targets.values(), key=lambda item: item["name"])


def private_linkage(maps, builds, prefix, owners, closures, work, run, packages, producer, report,
                    *, build_systems, toolchain_root=Path("/ucrt64")):
    result = {"scope": "reachable-private-PE-link-inputs-and-selected-members-excluding-XWin",
              "files": [], "prebuiltDllsExcluded": [], "observationsComplete": False,
              "prebuiltDllInternalsIncluded": False, "resourceCompilerInputsIncluded": False,
              "perFileLicenseReviewComplete": False, "distributionApproved": False}
    report["privatePeLinkage"] = result
    targets = reachable_targets(closures)
    result["prebuiltDllsExcluded"] = [item for item in targets if item["origin"] == "target-toolchain"]
    for item in targets:
        if item["origin"] != "private-prefix" or item["name"] == "xwin.exe":
            continue
        entry = {"name": item["name"], "component": item["component"], "imageSha256": item["sha256"],
                 "imageSize": item["size"], "observationsComplete": False}
        result["files"].append(entry)
        report["privateLinkCurrent"] = item["name"]
        require(item["component"] and re.fullmatch(r"[A-Za-z0-9_+.-]+", item["component"])
                and item["component"] not in {".", ".."}, "PRIVATE_LINK_COMPONENT")
        installed = [path for path in owners if path.casefold() == "bin/" + item["name"]]
        require(len(installed) == 1 and owners[installed[0]] == item["component"], "PRIVATE_LINK_OWNER")
        target = Path(installed[0]).name
        matches = [path for path in maps.iterdir() if path.name.casefold() == (target + ".map").casefold()]
        require(len(matches) == 1, "PRIVATE_LINK_MAP")
        mapping = matches[0]
        entry["mapSha256"] = digest(mapping.read_bytes())
        require(item["component"] in build_systems, "PRIVATE_LINK_BUILD_SYSTEM")
        output, directory, image = bind_output(mapping, builds / item["component"], prefix, item, work, run,
                                               build_systems[item["component"]])
        entry.update({"buildOutput": str(output.relative_to(builds)),
                      "linkDirectory": str(directory.relative_to(builds)), "mapSha256": digest(mapping.read_bytes())})
        generated = memory_inputs(mapping.read_text().replace("\r\n", "\n"), image, producer, target=target)
        entry["linkerGeneratedInputs"] = list(generated.values())
        entry["staticLink"] = link_inputs(mapping, directory, builds, prefix, owners, work, run, packages,
                                           entry, generated, target=target, component=item["component"],
                                           toolchain_root=toolchain_root)
        entry["archiveMembers"] = selected_members(mapping, directory, builds, prefix, entry["staticLink"]["inputs"],
                                                    work, run, entry, toolchain_root=toolchain_root, target=target)
        entry.pop("runtimePackages", None)
        entry["observationsComplete"] = True
    require(result["files"], "PRIVATE_LINK_EMPTY")
    result["observationsComplete"] = True
    report.pop("privateLinkCurrent", None)
    return result
