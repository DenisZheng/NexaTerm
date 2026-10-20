"""核对私有键盘数据，并用真实目标规则库及编译器验证键盘映射。"""

from pathlib import PurePosixPath
import re

from xserver_source_review import ASSETS, digest, require


CATEGORIES = {"compat", "geometry", "keycodes", "rules", "symbols", "types"}
MAX_DATA_BYTES = 32 * 1024 * 1024


def runtime_inventory(prefix, source, build, component, owners, report=None):
    relative_root = component["runtimeDataRoot"]
    root = prefix / relative_root
    require(root.is_dir() and not root.is_symlink(), "XKB_DATA_ROOT")
    for relative, expected in component["generatorInputs"].items():
        require(digest((source / relative).read_bytes()) == expected, "XKB_GENERATOR_INPUT")
    files, categories, total = [], set(), 0
    references = component["generatedRuntimeFiles"]
    result = {"root": relative_root, "files": files, "regularBytes": 0,
              "sourceSha256": component["sha256"], "licenseFiles": component["licenseFiles"],
              "generatorInputs": component["generatorInputs"], "generatedReferences": references,
              "observationsComplete": False, "perFileLicenseReviewComplete": False,
              "legacyInstallAliasesCreated": False, "distributionApproved": False}
    if report is not None:
        report["xkbRuntimeData"] = result
    observed_generated = set()
    for path in sorted(root.rglob("*")):
        require(not path.is_symlink(), "XKB_DATA_LINK")
        if path.is_dir():
            continue
        relative = path.relative_to(root).as_posix()
        if report is not None:
            report["xkbRuntimeCurrent"] = relative[:4096]
        parts = PurePosixPath(relative).parts
        require(len(parts) >= 2 and parts[0] in CATEGORIES and path.is_file(), "XKB_DATA_PATH")
        categories.add(parts[0])
        installed = path.relative_to(prefix).as_posix()
        require(owners.get(installed) == component["name"]
                and installed in component["installedFiles"], "XKB_DATA_OWNER")
        size = path.stat().st_size
        total += size
        require(len(files) < 1000 and size <= 2 * 1024 * 1024 and total <= MAX_DATA_BYTES, "XKB_DATA_BUDGET")
        raw = path.read_bytes()
        identity = {"size": size, "sha256": digest(raw)}
        require(component["installedFiles"][installed] == identity, "XKB_DATA_CHANGED")
        original, generated = source / relative, build / relative
        if relative in references:
            normalized = raw.replace(b"\r\n", b"\n")
            reference = references[relative]
            require(len(normalized) == reference["normalizedSize"]
                    and digest(normalized) == reference["normalizedSha256"], "XKB_GENERATED_REFERENCE")
            observed_generated.add(relative)
        if original.is_file() and original.read_bytes() == raw:
            origin = "fixed-source"
        else:
            require(generated.is_file() and generated.read_bytes() == raw, "XKB_DATA_INPUT")
            origin = "generated-build-output"
        files.append({"path": installed, **identity, "component": component["name"],
                      "origin": origin, "inputPath": relative,
                      "normalizedReference": references.get(relative)})
        result["regularBytes"] = total
    require(categories == CATEGORIES and observed_generated == set(references), "XKB_DATA_INCOMPLETE")
    result["observationsComplete"] = True
    if report is not None:
        report.pop("xkbRuntimeCurrent", None)
    return result


def component_names(output):
    result = {}
    for line in output.splitlines():
        match = re.fullmatch(r"(keycodes|types|compat|symbols|geometry)=([A-Za-z0-9_()+|.:+-]{1,512})", line)
        require(match and match[1] not in result, "XKB_RULE_COMPONENTS")
        result[match[1]] = match[2]
    require(set(result) == {"keycodes", "types", "compat", "symbols", "geometry"}, "XKB_RULE_COMPONENTS")
    return result


def keymap_text(names):
    types = {"keycodes": "keycodes", "types": "types", "compat": "compatibility",
             "symbols": "symbols", "geometry": "geometry"}
    return "xkb_keymap {\n" + "".join(
        f'    xkb_{kind} {{ include "{names[name]}" }};\n' for name, kind in types.items()) + "};\n"


def verify_keymap(text, layout):
    require(layout in {"us", "de"}, "XKB_PROBE_LAYOUT")
    result = {}
    for key, expected in {"AD06": ("y", "Y") if layout == "us" else ("z", "Z"),
                          "AB01": ("z", "Z") if layout == "us" else ("y", "Y")}.items():
        matches = re.findall(r"\bkey\s+<" + key + r">\s*\{(.*?)\};", text, re.DOTALL)
        require(len(matches) == 1, "XKB_KEYMAP_SEMANTICS")
        pairs = re.findall(r"\[\s*([A-Za-z0-9_]+)\s*,\s*([A-Za-z0-9_]+)\b", matches[0])
        require(pairs and pairs[0] == expected, "XKB_KEYMAP_SEMANTICS")
        result[key] = list(expected)
    return result


def xkb_probe(prefix, builds, work, report, run):
    report["stage"] = "native-xkb-keymaps"
    directory = builds / "native-xkb-probe"
    directory.mkdir()
    source = ASSETS / "overlays/xkb-rules-probe.c"
    probe = directory / "rules-probe.exe"
    compiler = prefix / "bin/xkbcomp.exe"
    root = prefix / "share/xkeyboard-config-2"
    require(compiler.is_file(), "XKB_COMPILER_MISSING")
    run(["gcc", "-std=gnu11", "-Wall", "-Wextra", "-Werror", "-I", prefix / "include",
         source, "-o", probe, "-L", prefix / "lib", "-lxkbfile", "-lX11"], work)
    native_root = run(["cygpath", "-m", root], work, capture=True).strip()
    native_directory = run(["cygpath", "-m", directory], work, capture=True).strip()
    evidence = {"verified": False, "sourceSha256": digest(source.read_bytes()),
                "compilerSha256": digest(compiler.read_bytes()), "dataRoot": "share/xkeyboard-config-2",
                "defaultIncludeSearchDisabled": True, "keymaps": []}
    report["nativeXkbKeymaps"] = evidence
    version = run([compiler, "-version"], directory, timeout=10, capture=True)
    require(version.strip() == "xkbcomp 1.5.0", "XKB_COMPILER_VERSION")
    for rules in ["base", "evdev"]:
        for layout in ["us", "de"]:
            evidence["current"] = {"rules": rules, "layout": layout}
            names = component_names(run([probe, native_root + "/rules/" + rules, layout], directory,
                                        timeout=10, capture=True))
            name = rules + "-" + layout
            input_file, output_file, roundtrip = [directory / (name + suffix) for suffix in [".xkb", ".xkm", "-roundtrip.xkb"]]
            input_file.write_text(keymap_text(names), encoding="utf-8")
            run([compiler, "-I", "-I" + native_root, "-xkm", native_directory + "/" + input_file.name,
                 native_directory + "/" + output_file.name], directory, timeout=20, capture=True)
            require(output_file.is_file() and 0 < output_file.stat().st_size <= 1024 * 1024, "XKB_XKM_OUTPUT")
            xkm = output_file.read_bytes()
            sensitive = {"ctrlZ": xkm.count(b"\x1a"), "crlf": xkm.count(b"\r\n")}
            require(any(sensitive.values()), "XKB_BINARY_CASE_MISSING")
            run([compiler, "-I", "-xkb", native_directory + "/" + output_file.name,
                 native_directory + "/" + roundtrip.name], directory, timeout=20, capture=True)
            require(roundtrip.is_file() and roundtrip.stat().st_size <= 2 * 1024 * 1024, "XKB_ROUNDTRIP_OUTPUT")
            keys = verify_keymap(roundtrip.read_text(encoding="utf-8"), layout)
            evidence["keymaps"].append({"rules": rules, "layout": layout, "model": "pc105", "components": names,
                                        "inputSha256": digest(input_file.read_bytes()), "xkmSha256": digest(output_file.read_bytes()),
                                        "xkmSize": output_file.stat().st_size, "roundtripSha256": digest(roundtrip.read_bytes()),
                                        "binarySensitiveBytes": sensitive, "verifiedKeys": keys})
    empty = directory / "empty-data"
    evidence["current"] = {"negative": "empty-data"}
    empty.mkdir()
    rejected = directory / "rejected.xkm"
    run([compiler, "-I", "-I" + native_directory + "/empty-data", "-xkm",
         native_directory + "/base-us.xkb", native_directory + "/rejected.xkm"], directory,
        timeout=20, capture=True, expected_exit=1)
    require(not rejected.exists(), "XKB_MISSING_DATA_ACCEPTED")
    evidence["current"] = {"negative": "missing-rules"}
    run([probe, native_root + "/rules/nexaterm-missing-rules", "us"], directory,
        timeout=10, capture=True, expected_exit=3)
    evidence.update({"emptyDataRejected": True, "missingRulesRejected": True, "verified": True})
    evidence.pop("current")


def configured_paths(server_build, data_root, bin_root):
    raw = (server_build / "include/xkb-config.h").read_bytes()
    text = raw.decode()
    for name, expected in [("XKB_BASE_DIRECTORY", data_root), ("XKB_BIN_DIRECTORY", bin_root)]:
        require(re.search(r'^#define ' + name + ' "' + re.escape(expected) + '"$', text, re.MULTILINE), "XKB_SERVER_PATH")
    return {"verified": True, "headerSha256": digest(raw), "dataRoot": data_root, "binRoot": bin_root}
