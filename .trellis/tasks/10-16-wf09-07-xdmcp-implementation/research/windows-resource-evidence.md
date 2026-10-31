# Windows XWin resource compiler evidence (2026-10-30)

Status: implementation in stacked Draft PR #89, based on documentation Draft #88.

## Verified baseline

Draft #87 code HEAD a924d48447b835426f81b205eee5adb7d50059a8 was checked on 2026-10-26:
- Full CI #701: success.
- Fixed source review #34: success.
- Native Windows #31: success.
- Native artifact reported stage=complete, status=REVIEW-REQUIRED, nativeBuildVerified=true and nativeVersionVerified=true.
- The private PE linkage observation set covered 13 private DLLs plus xkbcomp. Resource compiler inputs and per-file license review were still open.

These results are baseline only; they do not validate the resource audit.

## Implementation in PR #89

Latest code HEAD: 85d2f0323fd26d648a830da76f01582183b7dfce

- Added bounded AMD64 COFF section parsing and final PE resource-directory parsing.
- Verified the generated XWin Makefile WINDRES rule and exact make-expanded command against source Makefile.in.
- Recorded windres/GCC binary hashes, versions, target triple and MSYS2 package ownership.
- Reproduced XWin.o resource sections and compared their bytes with the linked object input.
- Captured GCC resource-preprocessor dependencies and source/build/toolchain ownership for each input.
- Compared final embedded RT_MANIFEST and RT_GROUP_ICON/RT_ICON payloads with pinned source manifest and ICO entries.
- Verified installed system.XWinrc identity.
- Scanned XWin direct objects/selected archive members and reachable private PE target direct objects/selected archive members for unexpected resource sections.

## Native failure analysis and correction

Native Windows #33 first failed because `make -B -n` triggered Automake refresh. That was corrected by using `make -n -o Makefile -W X.ico -W XWin.exe.manifest -W XWin.rc XWin.o`.

Native Windows #34 then completed the XWin build and install and passed resource counterexample tests, but failed with `RESOURCE_WINDRES_INPUT`. The actual cause was GNU make VPATH behavior: the `.rc.o` recipe receives bare `XWin.rc` through `$<` even though make found the prerequisite in the source tree. Resolving that bare token relative only to the build directory incorrectly pointed to a nonexistent build-tree file.

The latest correction:
- Resolves Windows drive-absolute paths through the same cygpath root mapping used by compiler dependency auditing.
- If the resource input token is relative and absent in the build directory, resolves it against the fixed source directory, then requires the exact `hw/xwin/XWin.rc` file.
- Keeps output resolution anchored to the build directory and include paths normalized through the same roots.
- Adds regression tests for VPATH bare prerequisite resolution and Windows drive-absolute input/output/include paths.

A standalone local path reproduction passed for both VPATH and drive-absolute cases. This is not a native Windows build result.

Exact-HEAD validation is pending:
- Native Windows #37
- Fixed Source Review #40
- Full CI #708

Do not reuse earlier native results as proof for the latest code. Wait for #37 to finish and inspect the resource audit report.

## Remaining boundaries

- Four prebuilt runtime DLL internals remain excluded.
- X.ico, XWin.exe.manifest and system.XWinrc still require explicit rights review.
- Full per-file license closure and runtime-library source obligations remain open.
- No bundled install, signed package, real XDMCP server login, desktop UI/session lifecycle, or macOS/Linux adaptation is claimed.
- Keep distributionApproved=false, bundled=false and desktopVerified=false.

## 2026-10-31: native alias-fixture repair (local, not pushed)

The continuation base is PR #89 HEAD `ec2d3322009691e633292714ce950dcc6ed8b676`. Its Full CI #712 and Fixed Source Review #44 passed, but [Native Windows #41](https://github.com/DenisZheng/NexaTerm/actions/runs/41017004853) failed one of 148 counterexample tests. The compile step was skipped and no native JSON was produced. The older pending statements above describe earlier attempts, not the latest result.

### Root cause and prevention

Category: implicit platform assumption plus a test-coverage gap. The collision fixture created `windres.exe` first, then wrote different bytes through `windres`. Under MSYS, that second write opened and truncated the existing `.exe`: directory enumeration showed only `windres.exe`, both paths read `MZ-tampered`, and `samefile` was true. Native Windows Python created two distinct files with the same setup. The earlier non-MSYS test result could not validate this fixture.

A minimal two-order experiment under `/usr/bin/python3` reproduced the behavior. Creating the extensionless path first produced two entries, different file identities and the intended distinct bytes. `Path.resolve()` retained the extensionless spelling, ruling out path normalization as the cause; the unexpected pacman call was a consequence of identical bytes, not a package-manager failure.

The repair changes only fixture construction: exclusive creation of `windres` followed by `windres.exe`, with explicit directory-entry, file-identity and exact-byte assertions. Production `package_owned_executable` and its ownership/hash checks are unchanged. The corrected test still requires `RESOURCE_TOOL_ALIAS_MISMATCH` before any pacman call. An in-memory mutation replacing only the byte comparison with `True` makes the corrected test fail at the expected forbidden pacman call; it is not a vacuous green test.

### Local verification

- Isolated MSYS2 under `.trellis/.runtime/pr89-msys2`, with no system installation or global PATH change. Official base `20260927.sfx.exe` SHA256: `ad336cccfda47758b5e15cda993fbba421115cb0b126697daef1ee4dfe37209f`.
- Local MSYS runtime `3.6.12-1`, MSYS Python `3.12.16-1`; CI #41 used runtime `3.6.11-4`. The original failure reproduced locally before editing, and the added fixture preconditions independently failed because only one directory entry existed.
- `/usr/bin/python3 -m unittest discover -s scripts -p 'xserver_windows_*test.py' -v`: **148 passed**, no skips. Native Windows Python also passed the focused collision test after repair.
- MSYS source-review suite: **21 passed**. The resource suite independently passed **24 tests** under WSL Ubuntu 24.04 / Python 3.12.3, including the corrected collision fixture.
- `pnpm run check`: **PASS**.
- `npm run build`, line-budget and startup-module boundary checks: **PASS**; existing large-chunk warnings remain. No frontend imports changed.
- `pnpm test` under the native Windows `zh-CN` locale: 1153 passed, 7 existing English-string assertions failed, 1 todo. No frontend code changed; the failures are in connection-submit, tunnel-label and workspace-restore tests. Do not count this as a complete frontend pass.
- Process-local `NODE_OPTIONS=--no-experimental-global-navigator` followed by `pnpm test`: **139 files / 1160 tests passed, 1 todo**. The option must reach Vitest workers via the environment; setting only the parent Node CLI flag did not. This validates the node-test fallback without native locale detection, not the failing default-locale scenario; no test assertions, app locale or repository configuration were changed.
- `node --test scripts/*.test.mjs`: 183 passed, 10 failed, 3 skipped. The unchanged Save As fixture requires `/bin/sh`, `/usr/bin` utilities and POSIX symlinks; this native Windows run cannot satisfy those environment assumptions. No unrelated fixture or production code was changed.
- The unchanged Save As file independently passed **11 tests** in WSL Ubuntu 24.04 / Node 18.19.1, confirming the missing POSIX environment was the native Windows blocker. This targeted run does not claim the complete app supports Node 18.
- Native Windows Python running the entire resource suite additionally exposed the unchanged POSIX-shell command fixture using backslash paths (`RESOURCE_WINDRES_INPUT`); the CI-equivalent MSYS suite passes. Native Python is not substituted for the prescribed MSYS runner.
- Full native XWin build/resource audit was stopped deliberately at 09:55:04 (UTC+08:00) after repeated antivirus deletions. The build had reached libXfont2, not final XWin verification; `.trellis/.runtime/pr89-native-review.json` does not exist. The targeted build process tree was terminated and no private MSYS2 processes remained. Log: `.trellis/.runtime/pr89-native-build.log`. This is an interrupted diagnostic run, not accepted native evidence.
- The maintainer reported deletion of `pr89-native/build/libX11/conftest.exe`, detected as `HVM:TrojanDownloader/Small.gen!A` (detection ID `E9970572BF268E86`). The supplied event identifies private UCRT64 `ld.exe` (PID 27636), with `collect2.exe` (PID 4608) as parent, writing the probe executable. This establishes build-time interception, not observed downloader behavior or proof of a false positive. The antivirus product and event timestamp remain unconfirmed; the detection ID is not a sample hash.
- libX11 `config.log` records a successful executable probe (`./conftest.exe`, exit 0), and libX11 subsequently reached compile/install. The filename is reused by many configure probes, so this does not identify the deleted instance or establish that all feature detections were unaffected. No protection settings, exclusions or quarantine restoration were changed, and no sample was uploaded.
- A read-only check using native Python, without executing the reported linker, found `ld.exe` matches the installed mtree SHA256 for `mingw-w64-ucrt-x86_64-binutils-2.47-4`; `collect2.exe`, `liblto_plugin.dll` and `lto-wrapper.exe` match `mingw-w64-ucrt-x86_64-gcc-16.2.0-6`. This is consistency with the local package database, not independent malware clearance of the deleted `conftest.exe`.
- After human review and a separately authorized commit/push, use a new PR Windows CI run for full native validation. Before any local retry, resolve the antivirus handling with the maintainer and use fresh build/configure state; do not reuse feature-detection results or installed outputs from this interrupted run.

The code-spec now requires concrete fixture identity assertions and the MSYS interpreter. Repository search found this two-file construction only in the collision test; no shared runtime abstraction or wider refactor is needed. All distribution/bundling/desktop flags remain false. The local repair has not been committed, pushed or verified by a new GitHub CI run.

### 同日推送后的状态（2026-10-31 10:16，UTC+08:00）

维护者随后分别授权提交及推送，修复已作为 `f46a5fb1c14b35d80d55fb4aa68a6516f764344c` 推到现有 PR #89。上一节的“未提交/未推送”是此前本机验证时的历史状态，不再是当前状态。

- [完整 CI](https://github.com/DenisZheng/NexaTerm/actions/runs/41158110435)：SUCCESS。
- [固定源码审查](https://github.com/DenisZheng/NexaTerm/actions/runs/41158110401)：SUCCESS。
- [Windows 原生构建](https://github.com/DenisZheng/NexaTerm/actions/runs/41158110445)：IN_PROGRESS。`Build evidence counterexamples` 已通过，`Compile and inspect fixed native target` 执行中；不再停在此前的别名碰撞夹具。
- 最终 `xserver-windows-review.json` 尚未取得；仍不能据此宣称资源审查完成、组件获准采用或桌面可用。后续报告须绑定这一精确 SHA/run，而不是借用早期构建。

维护者批准等待期间继续 X0 剩余权限/运行库义务核实，并准备 [X2 环境与用例](../validation/x2-windows-desktop-preparation.md)。本次准备没有改变构建配方、生产逻辑或发行能力标记。

新增的 [资源权限记录](windows-resource-rights-review.md) 已将四项资源绑定官方精确历史，但没有给三个 `unresolvedRights` 补出可确认的授权；CI 成功也不能关闭这些项。[预编译运行库记录](windows-prebuilt-runtime-obligations.md) 纠正了 pixman 配方身份，并区分不同的原构建环境；最终应按本轮实际 provider/hash 重绑，而非沿用本机或旧构建版本。两份记录均保留需要人审的采用决定。

## 2026-10-31：原生结果失败，修复 VPATH 重放断点

10:52（UTC+08:00）复查：`f46a5fb` 的完整 CI/源码审查成功，但原生 run `41158110445` 已于 10:28 失败。前置反例测试通过；不是上一轮别名夹具再次失败，也没有证据把该 CI 失败归因于本机杀软。

已从该 run 下载 artifact `13027125043`，API 绑定的 head 为 `f46a5fb1c14b35d80d55fb4aa68a6516f764344c`。API 声明 ZIP digest 为 `f02614b05cf20379ce942b6fdac25f33cbc77fd16cb61cff233728412560aaec`；下载解出的 JSON 为 3,797,944 字节、SHA256 `82fbef796a0493e566d3f5b1ce87ffbb25f0659148beee6db73aad1750b27de6`，两者不是同一文件的 hash。报告和完整失败 step 日志保存在忽略目录 `.trellis/.runtime/pr89-ci-native-41158110445/`，未下载/执行引擎。

报告为 `status=FAIL`、`stage=resource-compiler-inputs`、`error=BUILD_EXIT`。XWin 已完成编译安装，私有 PE 报告 `observationsComplete=true`；资源重放未完成，`resourceCompilerInputs` 不存在。最终版本 probe 尚未执行，`nativeBuildVerified/nativeVersionVerified/distributionApproved/bundled/desktopVerified` 均为 false；不能把局部完成改写为整条原生通过。

失败日志的完整错误为：

```text
Using `.../gcc -E -xc -DRC_INVOKED -I../../include XWin.rc'
cc1.exe: fatal error: XWin.rc: No such file or directory
compilation terminated.
.../windres.exe: .../gcc exited with status 1
FAIL xorg-server resource-compiler-inputs BUILD_EXIT
```

原始工具绝对路径见本地完整日志；此处只省略 CI runner 路径前缀，保留参数、错误和退出含义。

### 根因与修复

- 类别 C/D：先前 VPATH 修复仅把 parser 的 `input` 元数据解析到正确源文件，实际重放仍复制原始 `command`，没有替换 `-i XWin.rc`。parser 单测通过不能证明调用工具时使用了该路径；之前的别名夹具失败又使 CI 尚未走到此处。
- 本轮新测试直接进入生产 `resource_compiler_evidence`，在注入的 `run` 边界检查实际参数，先看到裸 `XWin.rc` 的红灯，再修生产代码。工作目录和文件存在断言排除了“只换 cwd”或“缺少源文件”作为修复方向。
- parser 在已验证单一输入/输出的同时保留两者 argv 值位置；重放按位置绑定已验证的源路径和临时输出，同时覆盖已有 parser 支持的长/短选项。原始命令仍保留，工具身份、其余 flags、cwd、COFF/PE/资源字节校验均不放宽。
- 回归覆盖带空格目录、VPATH、映射盘符、长短输入/输出选项、原始 XWin.o 不被覆盖，以及不同资源段必须报 `RESOURCE_REPRO_CHANGED`。

### 验证与剩余边界

- Windows 原生 Python：新增 3 项测试通过；MSYS `/usr/bin/python3` 和 WSL Ubuntu 各 27 项资源测试通过，无 skip。用例内部共覆盖 7 组重放场景。
- 两个内存变异分别去掉输入重绑、去掉资源段比较；配对未变异控制通过，变异分别在实际 argv 断言和错误放过资源差异的边界失败。初次变异 harness 的隔离 globals 没接到工具 mock，产生 `RESOURCE_TOOL_MISSING`，已排除该无效结果；有效记录为 `.trellis/.runtime/pr89-replay-mutations-boundary.log`。
- 上述单元测试没有运行编译器、链接器、完整 Windows 构建或被隔离的程序；随后仅执行下节的资源原生探针。未重跑包含真实链接/执行 fixture 的整套 Windows 脚本，不能沿用上一提交的 148 项结果宣称本次全套通过；完整 native 仍需新提交的 CI。
- 本地修复尚未提交/推送。先修复 PR #89 并取得新的完整原生证据，不进入随包/桌面验收；此前许可调研与 X2 准备保持未分发、未互通的边界。

### 同日接续：真实资源重放与带空格工作根

本次只在全新忽略目录生成自写 RC、source/build header、file-backed RCDATA 和 COFF `.o`，没有链接或生成/执行新的 `.exe`，没有重跑 XWin、恢复被删文件或修改杀软设置。真实 `make` 的正常构建传源树相对路径；同一 Makefile 的 `-n -W` 则传裸 `XWin.rc`，在本机复现了 CI 的缺源错误。

1. 初版将输入改为绝对路径：无空格工作根成功；带空格工作根失败。windres verbose 中已经打印带引号的正确源路径，但 GCC 报 `cc1.exe: fatal error: i: No such file or directory`。这证明“Python argv 正确”不足以保证实际工具调用；此处不推断 binutils 内部的具体缺陷位置。
2. 在同一失败目录仅把输入改为从原 build cwd 指向已验证源文件的相对路径，保留输出绝对路径、全部 flags 和 cwd，真实 windres 成功，整个 `.o` 与原对象 SHA256 一致。
3. 最终生产重放使用 `Path(relpath(command["input"], build_directory)).as_posix()`。这是同一 work 树内同一文件的路径表示，不更换源文件、不复制 RC、不改预处理器或 `--use-temp-file`。单测先对旧绝对参数报红，再覆盖相对参数及 resolve 后的文件身份。
4. 在另一全新带空格目录再次进入真实 `resource_compiler_evidence`，使用真实 pacman 工具 owner、版本和工具执行，成功越过实际 COFF 资源段比较后，在依赖扫描入口显式停止。`staticLink.inputs` 为自写夹具对象身份，**不是实际 XWin 链接图**；未覆盖真实 SDK 依赖、最终 PE 或私有资源扫描，不能生成完整审查通过结论。

工具为 `mingw-w64-ucrt-x86_64-binutils 2.47-4`、`mingw-w64-ucrt-x86_64-gcc 16.2.0-6`。原对象和重放对象 SHA256 均为 `e0064c89a973e603c4f47f365d31cae4c769be06af066c9d0080e064d8b164a0`；`.rsrc` 为 176 字节、SHA256 `3e1dc77a98df0d5ed42b0981d63401a9d2526e062708d84fb64aef27bba45a60`。

本地证据全部位于 `.trellis/.runtime/`，不提交生成文件：

- `pr89-resource-only-smoke.log` / `pr89-resource-only-smoke-control.log`：初版绝对路径的带空格失败 / 无空格成功对照。
- `pr89-resource-only-relative-control.log`：同一失败目录只改变输入表示后的成功对照。
- `pr89-resource-only-smoke-relative.log` 和 `pr89-resource-only-smoke/corrected work with spaces/evidence.json`：最终生产调用边界的真实资源验证。
- `pr89-replay-relative-red.log` / `pr89-replay-relative-msys-tests.log`：最终参数契约的红绿回归。
- `pr89-replay-final-mutations.log`：最终代码的三组配对控制均通过；删除输入重绑、改回绝对输入、删除 COFF 比较均被回归检出，未改磁盘生产代码。

最终代码的 Windows Python 新增 3 项、MSYS/WSL 各 27 项资源测试重新通过，无 skip；类型检查、line-budget、任务 manifest 和 diff 检查通过。新增回归由既有 CI 的 `xserver_windows_*test.py` glob 自动收集，不需修改 workflow。本地修复与许可/X2 准备待一起人工审核，尚未提交/推送；PR #89 仍是 `f46a5fb` 的原生失败状态。

## 2026-10-31：推送后核对实际预处理模式

维护者审核后，上一批 11 个文件已作为 `1a7bb15d6570c85507f250a1bb65b3f51715801a` 一起推到 PR #89。本节开始接续其 [完整 CI](https://github.com/DenisZheng/NexaTerm/actions/runs/41164964135)、[源码审查](https://github.com/DenisZheng/NexaTerm/actions/runs/41164964119) 和 [原生构建](https://github.com/DenisZheng/NexaTerm/actions/runs/41164964134)；不沿用前一节未推送状态。

最终审查又发现一处证据口径不一致：真实 windres verbose 使用 `gcc -E -xc -DRC_INVOKED`，依赖扫描和 `compiler.preprocessorDefaults` 却仍硬编码旧的 `-xc-header`。这不是已观察到的 CI 构建故障，也不证明两种模式必然产生不同依赖，但原字段不能真实描述当次工具调用，须在本阶段收口。

- 现在要求唯一的真实 `Using` 调用记录，核对 GCC 默认选项，再用同一 `preprocessor_defaults` 构造 `-M` 依赖扫描和报告字段；缺失/重复调用或语言模式漂移均拒绝，不以“输出中有 gcc”代替核对。
- 回归在实际依赖调用边界断言完整 argv，覆盖 C-header/C++/Objective-C 模式及缺失/重复 verbose 调用。先得到旧代码红灯，修正后 Windows Python 5 项、MSYS/WSL 各 29 项资源测试通过。
- 全新带空格工作根中的资源级原生探针通过，并实际执行 `gcc -E -xc -DRC_INVOKED -M`：输出包含自写 RC、源头文件和 build 头文件；仍在真实 SDK/最终 PE 审查前停止，没有链接、生成或运行新 `.exe`。
- 红灯、有效变异及真实工具日志分别为忽略目录下的 `pr89-preprocessor-mode-red.log`、`pr89-preprocessor-mode-mutation-checked.log`、`pr89-resource-only-smoke-observed-mode.log`。移除模式校验后，负向用例进入了本应禁止的依赖扫描，已被测试检出；首次 mutation harness 因非 raw Python 字符串将正则转义改写，在替换计数断言即失败，不计入有效变异证据。

新代码须再次完成自己的原生 CI。仅预处理/资源自写夹具通过不代表真实 XWin 审查、许可批准、安装或桌面完成；本轮不放宽三个资源权限和四个预编译 DLL 内部的排除边界。

## 2026-10-31：真实 COFF 对象与工具链默认 manifest

`1a7bb15` 的完整 CI `41164964135`、源码审查 `41164964119` 成功，原生 `41164964134` 失败于 `resource-compiler-inputs / RESOURCE_COFF_RANGE`。实际 VPATH 重放与依赖扫描已通过，不是原路径故障重复。最终版本 probe 未执行，所有原生完成/发行能力标志仍为 false。

从精确 head/run 下载 artifact `13029646488`：ZIP 642767 字节、SHA256 `2299904422a2c0402efc1d9547a1e662815defaf1de94b27f4828dfd537bd681`，已独立计算并匹配 GitHub API digest；JSON 3797953 字节、SHA256 `cd092a2d7597a097a1df94bbe8eacfbe3db7a5a4ef15b134c6bf21d92a1196e2`。完整日志/receipt 在忽略目录 `pr89-ci-native-41164964134/`，未下载或执行引擎。

### 根因、扩查与防回归

- 类别 D/E：旧 COFF parser 假定所有非零 section size 都有磁盘 bytes。实际首个 `lib/crt2.o`（7815 字节，SHA256 `6904489841a7d0d71aed3f49bfca3f722ae9e7c5073c1716f48b2c6be4502e83`）的 `.bss` 是 size 32/pointer 0/flags `0xc0500080`。本机同对象与 CI 精确一致；自写未初始化全局数据经 `gcc -c` 也得到该表示。只编译数据到 COFF，没有链接/运行程序。
- 仅对纯未初始化内容保留内存长度但不读/hash磁盘；代码/初始化/混合标志仍严格校验。补 `/decimal` 字符串表节名解码，避免真实 CRT 长名不识别或编码 `.rsrc$...` 绕过检查。反例覆盖范围、错误标志、伪资源、缺 NUL 和非法字符串 offset。
- 扩查所有与 CI 字节一致的本机工具链输入，而非只修首个错误：17 archives、609 个去重 COFF 对象、512 个 BSS 节；发现一个去重资源对象 `lib/default-manifest.o`，同时在 XWin 和 xkbcomp 的实际 LOAD 中。初次 corpus 的“应无资源”断言失败被保留，不写成通过。
- 因而不能在 BSS 修好后直接推送，也不能跳过该文件。新增固定来源对象证据和最终 PE 绑定；九项合成回归覆盖包/来源/owner/完整字节/section/最终 image/payload 漂移、错目标、缺失/重复输入及 archive 资源。新逻辑不改链接配方或发行许可决定。
- 预处理模式不一致是独立的证据契约问题；修正 `-xc` 不能解决 BSS，BSS 修正也不能代替默认 manifest 取证。前序阶段失败使后序真实对象尚未被扫描，纯解析器测试不能替代全链 native。

### 默认 manifest 的固定来源与边界

沿用已有 `mingw-w64-ucrt-x86_64-windows-default-manifest 20260815-1` 的单文件 pin（892 字节，SHA256 `9af5e18f01a63a7d02ba11e097324e046f778de5c74cd093b52296f8613dbcc8`），不是新增依赖或资源许可豁免。已有源 notice、发布 archive 和固定 recipe/generator 身份见 `toolchain-license-sources.json` 与 [运行库许可记录](windows-runtime-license-review.md)。

只读官方 `msys2/MINGW-packages` commit `fb1bee30b4f11cf4b857197a288466afad49033a` 的 PKGBUILD/genrc，分别匹配既有 SHA256 `c01b38f7f32970b42d2c9ab834d35eb69fb71a0f3de30a0340ce30e40cd203e8` / `f2bfbcd92ab28d8671dda5a1485aae150ce5d5faf4395a6a4462cacd2a6fb60a`。未执行或复制上游生成器实现。用 AST 常量读取 XML_TEMPLATE，按生成器声明的去 XML 注释、折叠标签间空白和 strip 规则独立核对，得到与对象 payload 完全相同的 710 字节。原模板 SHA256 `9ec47595697628058434c8b056c581aefce247c4d774d5392cf6e74fd04075be`，结果为 `e989bc9ba32a3f5b1f5a565d5971e07462a2d6a504e7af682bd36cc8cc263f29`。

完整固定对象只有一个 `.rsrc`（offset 60/size 800/SHA256 `0051d11dbb0208fbba9185ccf8634f81e3b4f47b10e3f6226832ea0340318864`），资源 type 24/name 1/language 0；payload 位于节内 offset 88。data entry 的节内 `0x48` 位置有一条指向 `.rsrc` section symbol 的 AMD64 ADDR32NB relocation。模板为 asInvoker 和 Windows 兼容声明；这只是精确对象/模板身份，不重现历史编译器、不验证发布 archive 签名，也不补出并不存在的 installed notice。

新 collector 重验固定对象/包/sourceLicenseEvidence、section 和 payload，再只允许相同来源的直接 LOAD 对象。XWin 的原 manifest/icon 校验继续生效，并要求最终可达资源树没有默认 payload；xkbcomp 必须在绑定到既有 private-link size/hash 的真实安装 PE 中只有该默认 manifest。两者资源计数如实记录为 2/1；不从 LOAD 推断 section 存活或链接器丢弃过程。

### 本地验证（尚非新 native 结果）

Windows Python 的新 COFF/replay/default-manifest 共 21 项通过；MSYS `/usr/bin/python3` 和 WSL 的资源/来源五个 suite 各 50 项通过，无 skip。只读真实 corpus 最终通过，两个默认 manifest 输入均按精确来源/section pin 识别，archive 成员没有资源。日志 `pr89-coff-exact-ci-corpus-verified.log`；它不包含私有组件全部对象或最终 PE，不能充当完整原生报告。未重跑本机完整构建、关闭防护或添加排除。

相关 code-spec 已加入 COFF 存储表示、长名、精确工具链对象以及最终可达资源契约。新提交仍需自己的完整/源码/native CI；通过后方可关闭本次资源审查实现阶段，X0 权限/预编译 DLL 内部、X2/X3 不随之完成。
