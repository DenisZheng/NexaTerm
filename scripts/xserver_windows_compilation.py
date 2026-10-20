"""把实际C编译依赖绑定到固定源码、私有安装或目标工具链文件。"""

from pathlib import Path
import re

from xserver_source_review import digest, require
from xserver_windows_inventory import package_evidence


MAX_DEP_BYTES = 64 * 1024 * 1024
MAX_INPUT_BYTES = 256 * 1024 * 1024


def make_dependencies(content):
    # GCC emits one main rule followed by empty -MP header rules.
    if content.strip() in {"# dummy", "#dummy"}:
        return []
    lines = content.replace("\\\n", " ").splitlines()
    require(lines, "COMPILE_DEP_RULE")
    line = lines[0]
    match = re.search(r"(?<!\\):(?:\s|$)", line)
    require(match is not None, "COMPILE_DEP_RULE")
    result, word, escaped = [], "", False
    for character in line[match.end():]:
        if escaped:
            word += character
            escaped = False
        elif character == "\\":
            escaped = True
        elif character.isspace():
            if word:
                result.append(word)
                word = ""
        else:
            word += character
    require(not escaped, "COMPILE_DEP_ESCAPE")
    if word:
        result.append(word)
    require(result, "COMPILE_DEP_EMPTY")
    return result


def ninja_dependencies(content):
    result, expected, observed = [], None, 0
    for line in content.splitlines():
        if not line.strip():
            require(expected is None or observed == expected, "COMPILE_NINJA_COUNT")
            expected = None
        elif line.startswith("    "):
            require(expected is not None, "COMPILE_NINJA_DEPS")
            result.append(line[4:])
            observed += 1
        else:
            require(expected is None or observed == expected, "COMPILE_NINJA_COUNT")
            match = re.fullmatch(r".+: #deps (\d+), deps mtime \d+ \(VALID\)", line)
            require(match, "COMPILE_NINJA_DEPS")
            expected, observed = int(match[1]), 0
            require(expected > 0, "COMPILE_DEP_EMPTY")
    require(expected is None or observed == expected, "COMPILE_NINJA_COUNT")
    require(result, "COMPILE_DEP_EMPTY")
    return result


def dependency_path(name, directory, windows_roots):
    name = name.replace("\\", "/")
    if re.match(r"^[A-Za-z]:[/\\]", name):
        normalized = name.replace("\\", "/")
        matches = [(native, local) for native, local in windows_roots
                   if normalized.lower().startswith(native.lower() + "/")]
        require(len(matches) == 1, "COMPILE_PATH_ROOT")
        native, local = matches[0]
        return (local / normalized[len(native) + 1:]).resolve()
    path = Path(name)
    return (directory / path).resolve() if not path.is_absolute() else path.resolve()


def component_dependencies(directory, build_system, work, run, report=None):
    if build_system == "meson":
        output = run(["ninja", "-C", directory, "-t", "deps"], work, capture=True)
        require(len(output.encode()) <= MAX_DEP_BYTES, "COMPILE_DEP_BUDGET")
        count = len(re.findall(r"^.+: #deps ", output, re.MULTILINE))
        return [(name, directory) for name in ninja_dependencies(output)], count, {"method": "ninja-deps", "sha256": digest(output.encode())}
    files = sorted([*directory.rglob("*.Po"), *directory.rglob("*.Plo")])
    require(0 < len(files) <= 3000, "COMPILE_DEP_FILES")
    result, size, evidence, bootstrap = [], 0, [], []
    for path in files:
        size += path.stat().st_size
        require(size <= MAX_DEP_BYTES, "COMPILE_DEP_BUDGET")
        parent = path.parent
        while parent != directory and not (parent / "Makefile").is_file():
            parent = parent.parent
        require((parent / "Makefile").is_file(), "COMPILE_DEP_DIRECTORY")
        raw = path.read_bytes()
        current = {"path": str(path.relative_to(directory)), "size": len(raw), "sha256": digest(raw)}
        if report is not None:
            report["compilerDependencyCurrent"] = current
        content = raw.decode("utf-8").replace("\r\n", "\n")
        if report is not None:
            current["firstLines"] = [line[:512] for line in content.splitlines()[:8]]
        if content.strip() in {"", "# dummy", "#dummy"}:
            # Automake bootstraps unbuilt optional targets with an empty/comment-only depfile.
            require(path.parent.name == ".deps", "COMPILE_DEP_BOOTSTRAP")
            object_directory = path.parent.parent
            candidates = [root / (path.stem + suffix) for root in [object_directory, object_directory / ".libs"]
                          for suffix in [".o", ".obj", ".lo"]]
            require(not any(candidate.exists() for candidate in candidates), "COMPILE_DEP_WITHOUT_INPUTS")
            bootstrap.append({**current, "compiledObjectPresent": False})
            continue
        names = make_dependencies(content)
        result.extend((name, parent) for name in names)
        if names:
            evidence.append({"path": str(path.relative_to(directory)), "sha256": digest(path.read_bytes())})
    require(evidence, "COMPILE_DEP_EMPTY")
    if report is not None:
        report.pop("compilerDependencyCurrent", None)
    return result, len(evidence), {"method": "gcc-dependency-files", "files": evidence, "bootstrapFiles": bootstrap}


def observed_inputs(builds, sources, prefix, manifest, server_root, owners, packages, work, run, report=None,
                    *, toolchain_root=Path("/ucrt64")):
    windows_roots = [(run(["cygpath", "-m", root], work, capture=True).strip().rstrip("/"), root)
                     for root in [work, toolchain_root]]
    components = [*manifest["components"], {"name": "xorg-server", "root": server_root,
                                          "buildSystem": "autotools", "compileInputs": "compiler"}]
    source_owners = {component["root"]: component["name"] for component in components}
    component_names = {component["name"] for component in components}
    require(len(source_owners) == len(component_names) == len(components), "COMPILE_COMPONENTS")
    installed_owners = {path.casefold(): owner for path, owner in owners.items()}
    require(len(installed_owners) == len(owners), "COMPILE_INSTALL_AMBIGUOUS")
    records, observations, package_files, queried_packages = {}, [], {}, set()
    result = {"scope": "observed-C-build-inputs-including-build-only-target-utilities",
              "linkOrDistributionRelevanceInferred": False, "resourceCompilerInputsIncluded": False,
              "perFileLicenseReviewComplete": False, "observationsComplete": False,
              "observations": observations, "regularBytes": 0, "files": []}
    if report is not None:
        report["compilerInputs"] = result
    total = 0
    for component in components:
        if report is not None:
            report["compilerInputComponent"] = component["name"]
        directory = builds / component["name"]
        if component["compileInputs"] == "headers-only":
            observations.append({"component": component["name"], "scope": "headers-or-host-generator-only", "complete": True})
            continue
        if component["compileInputs"] == "runtime-data-only":
            observations.append({"component": component["name"], "scope": "runtime-data-only", "complete": True})
            continue
        require(component["compileInputs"] == "compiler", "COMPILE_INPUT_SCOPE")
        dependencies, dep_count, evidence = component_dependencies(directory, component["buildSystem"], work, run, report)
        observation = {"component": component["name"], "dependencyRecords": dep_count, "evidence": evidence, "complete": False}
        observations.append(observation)
        for name, working_directory in dependencies:
            if report is not None:
                report["compilerInputCurrent"] = {"dependency": name[:4096], "directory": str(working_directory)[:4096]}
            path = dependency_path(name, working_directory, windows_roots)
            if report is not None:
                report["compilerInputCurrent"]["resolved"] = str(path)[:4096]
            require(path.is_file(), "COMPILE_INPUT_MISSING")
            require(path.name.lower() not in {"ddraw.h", "propkey.h"}, "COMPILE_EXCLUDED_HEADER")
            identity = str(path).casefold()
            if identity in records:
                if component["name"] not in records[identity]["observedBy"]:
                    records[identity]["observedBy"].append(component["name"])
                continue
            size = path.stat().st_size
            total += size
            require(len(records) < 10000 and size <= 8 * 1024 * 1024
                    and total <= MAX_INPUT_BYTES, "COMPILE_INPUT_BUDGET")
            record = {"size": size, "observedBy": [component["name"]]}
            if path.is_relative_to(sources):
                relative = path.relative_to(sources)
                require(relative.parts[0] in source_owners, "COMPILE_SOURCE_OWNER")
                record.update({"origin": "fixed-source", "path": str(relative),
                               "component": source_owners[relative.parts[0]]})
            elif path.is_relative_to(prefix):
                relative = str(path.relative_to(prefix))
                require(relative.casefold() in installed_owners, "COMPILE_INSTALL_OWNER")
                require(installed_owners[relative.casefold()] in component_names, "COMPILE_INSTALL_OWNER")
                record.update({"origin": "private-prefix", "path": relative, "component": installed_owners[relative.casefold()]})
            elif path.is_relative_to(builds):
                relative = path.relative_to(builds)
                owner = next((item["name"] for item in components if item["name"] == relative.parts[0]), None)
                require(owner is not None, "COMPILE_GENERATED_OWNER")
                record.update({"origin": "build-generated-or-private-header", "path": str(relative), "component": owner})
            else:
                require(path.is_relative_to(toolchain_root), "COMPILE_INPUT_ORIGIN")
                if identity not in package_files:
                    package = run(["pacman", "-Qqo", path], work, capture=True).strip()
                    require(package not in queried_packages, "COMPILE_PACKAGE_OWNER")
                    packages[package] = package_evidence(package, work, run, package_files)
                    queried_packages.add(package)
                require(identity in package_files, "COMPILE_PACKAGE_OWNER")
                record.update({"origin": "target-toolchain", "path": str(path.relative_to(toolchain_root)),
                               "package": package_files[identity]})
            record["sha256"] = digest(path.read_bytes())
            records[identity] = record
        observation["complete"] = True
        result.update({"regularBytes": total, "files": sorted(records.values(), key=lambda item: (item["origin"], item["path"]))})
    require(records, "COMPILE_INPUTS_EMPTY")
    if report is not None:
        report.pop("compilerInputComponent", None)
        report.pop("compilerInputCurrent", None)
    result["observationsComplete"] = True
    return result
