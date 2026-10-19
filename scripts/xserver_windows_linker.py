"""识别实际GNU PE链接器，并提前验证其内存BFD输出和真实DLL数据导入。"""

from pathlib import Path
import re
import shutil

from xserver_source_review import ASSETS, digest, require
from xserver_windows_linkmap import GENERATOR_SOURCE, PRODUCER_PACKAGE, PRODUCER_RELEASE, PRODUCER_VERSION, memory_inputs
from xserver_windows_pe import MAX_PE_BYTES


def validate_producer(version_text, binary_sha):
    require(version_text == PRODUCER_RELEASE["versionText"]
            and binary_sha == PRODUCER_RELEASE["binarySha256"], "LINK_GENERATED_PRODUCER")


def linker_producer(work, run, package_evidence, report):
    value = run(["gcc", "-print-prog-name=ld"], work, capture=True).strip()
    if re.match(r"^[A-Za-z]:", value):
        value = run(["cygpath", "-u", value], work, capture=True).strip()
    path = Path(value)
    if not path.is_absolute():
        found = shutil.which(value)
        require(found, "LINK_GENERATED_PRODUCER")
        path = Path(found)
    path = path.resolve()
    require(path.is_relative_to("/ucrt64") and path.is_file()
            and path.stat().st_size <= MAX_PE_BYTES, "LINK_GENERATED_PRODUCER")
    package = run(["pacman", "-Qqo", path], work, capture=True).strip()
    require(package == PRODUCER_PACKAGE, "LINK_GENERATED_PRODUCER")
    evidence = package_evidence(package, work, run)
    require(evidence["version"] == PRODUCER_VERSION, "LINK_GENERATED_PRODUCER")
    version = run([path, "--version"], work, capture=True).splitlines()[0]
    record = {"scope": "build-tool-not-runtime-candidate", "package": package, "version": evidence["version"],
            "binary": str(path.relative_to("/ucrt64")), "binarySha256": digest(path.read_bytes()),
            "versionText": version, "packageEvidence": evidence, "generatorSource": GENERATOR_SOURCE,
            "publishedBinaryEvidence": PRODUCER_RELEASE, "identityVerified": False,
            "producerLicenseAppliedToOutputInferred": False, "distributionApproved": False}
    report["linkerProducer"] = record
    validate_producer(version, record["binarySha256"])
    record["identityVerified"] = True
    return record


def linker_probe(builds, work, report, run, package_evidence):
    report["stage"] = "native-linker-inputs"
    producer = linker_producer(work, run, package_evidence, report)
    directory = builds / "linker-input-probe"
    directory.mkdir()
    library = ASSETS / "overlays/linker-pseudo-library.c"
    caller = ASSETS / "overlays/linker-pseudo-caller.c"
    run(["gcc", "-std=gnu11", "-Wall", "-Wextra", "-Werror", "-shared", library,
         "-o", "linker-probe.dll", "-Wl,--out-implib=linker-probe.dll.a"], directory)
    run(["gcc", "-std=gnu11", "-Wall", "-Wextra", "-Werror", caller, "linker-probe.dll.a",
         "-Wl,-Map=XWin.exe.map", "-o", "XWin.exe"], directory)
    binary = directory / "XWin.exe"
    run([binary], directory, timeout=10)
    require(binary.stat().st_size <= MAX_PE_BYTES, "PE_BUDGET")
    mapping_bytes = (directory / "XWin.exe.map").read_bytes()
    mapping = mapping_bytes.decode().replace("\r\n", "\n")
    records = memory_inputs(mapping, binary.read_bytes(), producer)
    require("dll stuff" in records and any("_rtr" in name for name in records)
            and any("_ertr" in name for name in records), "LINK_GENERATED_PROBE")
    require(all(not (directory / name).exists() for name in records), "LINK_GENERATED_SHADOW")
    report["nativeLinkerInputs"] = {"verified": True, "actualDllDataImport": True,
        "librarySourceSha256": digest(library.read_bytes()), "callerSourceSha256": digest(caller.read_bytes()),
        "imageSha256": digest(binary.read_bytes()), "mapSha256": digest(mapping_bytes),
        "memoryInputs": list(records.values())}
