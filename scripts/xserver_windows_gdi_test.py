"""编译执行实际GDI选择器；外部server ABI另由Windows完整构建验证。"""

from pathlib import Path
import subprocess
import tempfile
import unittest


class GdiSelectorTests(unittest.TestCase):
    def test_real_selector_rejects_other_engines_and_propagates_callback_failure(self):
        source = Path(__file__).resolve().parent / "xserver/overlays/winengine-gdi.c"
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "win.h").write_text("""
typedef int Bool;
#define TRUE 1
#define FALSE 0
#define WIN_SERVER_NONE 0
#define WIN_SERVER_SHADOW_GDI 1
typedef struct { unsigned dwEnginePreferred, dwEngine; } winScreenInfo;
typedef struct { winScreenInfo *pScreenInfo; } Private;
typedef Private *ScreenPtr;
#define winScreenPriv(screen) Private *pScreenPriv = (screen)
extern unsigned g_dwEnginesSupported;
Bool winSetEngineFunctionsShadowGDI(ScreenPtr screen);
""")
            harness = root / "harness.c"
            harness.write_text("""
#include "win.h"
unsigned g_dwEnginesSupported;
static int calls, result;
void winDetectSupportedEngines(void);
Bool winSetEngine(ScreenPtr screen);
Bool winSetEngineFunctionsShadowGDI(ScreenPtr screen) {
    if (screen->pScreenInfo->dwEngine != WIN_SERVER_SHADOW_GDI) return 0;
    ++calls; return result;
}
int main(void) {
    winScreenInfo info = {0, 0}; Private screen = {&info};
    result = 1;
    if (winSetEngine(&screen) || calls) return 1;
    winDetectSupportedEngines();
    if (g_dwEnginesSupported != WIN_SERVER_SHADOW_GDI) return 2;
    if (!winSetEngine(&screen) || calls != 1) return 3;
    info.dwEnginePreferred = 4;
    if (winSetEngine(&screen) || calls != 1) return 4;
    info.dwEnginePreferred = WIN_SERVER_SHADOW_GDI; result = 0;
    if (winSetEngine(&screen) || calls != 2) return 5;
    return 0;
}
""")
            executable = root / "gdi-test.exe"
            build = subprocess.run(["gcc", "-std=c11", "-Wall", "-Wextra", "-Werror",
                                    "-I", str(root), str(source), str(harness), "-o", str(executable)],
                                   capture_output=True, text=True, timeout=30)
            self.assertEqual(build.returncode, 0, build.stderr)
            execution = subprocess.run([str(executable)], capture_output=True, text=True, timeout=10)
            self.assertEqual(execution.returncode, 0, execution.stderr)


if __name__ == "__main__":
    unittest.main()
