"""执行真实目标头文件/目标库探针；不推断完整桌面能力。"""

from xserver_source_review import ASSETS, digest, require


def execute_probe(name, includes, libraries, builds, work, run):
    source = ASSETS / "overlays" / (name + ".c")
    binary = builds / (name + ".exe")
    run(["gcc", "-std=gnu11", "-Wall", "-Wextra", "-Werror", *includes,
         source, "-o", binary, *libraries], work)
    run([binary], work, timeout=10)
    return {"verified": True, "sourceSha256": digest(source.read_bytes())}


def header_probes(prefix, server_source, builds, work, report, run):
    report["stage"] = "native-ipv6-headers"
    report["nativeIpv6Headers"] = {
        **execute_probe("winsock-ipv6-probe", ["-I", prefix / "include"], ["-lws2_32"], builds, work, run),
        "numericLoopbackOnly": True,
        "wrapperSha256": digest((prefix / "include/X11/Xwinsock.h").read_bytes())}
    report["stage"] = "native-appid-headers"
    report["nativeAppIdHeaders"] = {
        **execute_probe("appid-property-probe", ["-I", prefix / "include", "-I", server_source / "hw/xwin"], [], builds, work, run),
        "sdkInterfaceOnly": True,
        "headerSha256": digest((server_source / "hw/xwin/propertystore.h").read_bytes())}
    report["stage"] = "native-xkb-sdk-namespace"
    source = ASSETS / "overlays/xkb-sdk-namespace-probe.c"
    rejected = builds / "xkb-sdk-bad-order.o"
    output = run(["gcc", "-std=gnu11", "-Wall", "-Wextra", "-Werror", "-I", prefix / "include",
                  "-DNEXATERM_XKB_BAD_ORDER=1", "-c", source, "-o", rejected], work,
                 timeout=30, capture=True, expected_exit=1)
    require("error:" in output and ("TypeString" in output or "ERROR" in output)
            and not rejected.exists(), "XKB_SDK_COUNTEREXAMPLE")
    report["nativeXkbSdkNamespace"] = {
        **execute_probe("xkb-sdk-namespace-probe", ["-I", prefix / "include"], [], builds, work, run),
        "knownBadOrderRejected": True, "compilerDiagnosticsPreserved": True}


def xcb_probe(prefix, builds, work, report, run):
    report["stage"] = "native-xcb-namespace"
    report["nativeXcbNamespace"] = {
        **execute_probe("xcb-namespace-probe", ["-I", prefix / "include"], [], builds, work, run),
        "protocolAndSdkTypes": True}


def font_probe(prefix, source, builds, work, report, run):
    report["stage"] = "native-font-buffer"
    report["nativeFontBuffer"] = {
        **execute_probe("font-buffer-probe", ["-I", source / "include", "-I", prefix / "include"],
                        [prefix / "lib/libXfont2.a"], builds, work, run),
        "binaryReadWriteAndEof": True, "targetArchiveSha256": digest((prefix / "lib/libXfont2.a").read_bytes())}


def poll_probe(prefix, source, server_build, builds, work, report, run):
    report["stage"] = "native-poll-fallback"
    archive = server_build / "os/.libs/libos.a"
    report["nativePollFallback"] = {
        **execute_probe("poll-fallback-probe", ["-I", server_build / "include", "-I", source / "include",
                                                "-I", prefix / "include"], [archive, "-lws2_32"], builds, work, run),
        "udpLoopbackReadinessAndTimeout": True, "targetArchiveSha256": digest(archive.read_bytes())}
