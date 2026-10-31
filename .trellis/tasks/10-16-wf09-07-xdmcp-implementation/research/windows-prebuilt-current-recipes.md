# Research: 当前 libwinpthread / zlib 发布包的精确配方材料

- Query: 将 PR #89 成功原生 run `41170743513` 的两个更新过的 DLL，绑定到发布包、`.BUILDINFO` 指定的精确配方、全部本地 source/patch 项及 notice 原文；不能套用 r495/zlib -2 的旧记录。
- Scope: mixed；只读已有缓存、成功 CI JSON、官方发布归档及 GitHub 原始文件/API。不执行包、构建脚本、编译器、链接器或源码，不改变包选择/安全策略。
- Date: 2026-10-31
- 状态：包/配方材料来源证据；不是历史内部链接或分发批准。`distributionApproved`、`bundled`、`desktopVerified` 继续为 false。

## Findings

### 1. 精确匹配结果

| 对象 | 发布包 SHA256 | `.BUILDINFO` 指定的 PKGBUILD SHA256 | 匹配的 MINGW-packages commit |
| --- | --- | --- | --- |
| libwinpthread `14.0.0.r569.g34eeafb7d-1` | `b4ebe2826e848c5e790e06ea7b37d3e0594e005f42382b0506886f17df8127da` | `ce977f0a06848c55cfdea7bdcbaa49036ca204eb4f1a1d11788712d355996367` | `aae0fa06746a677422daa223d479d34dc8895796` |
| zlib `1.3.2-3` | `130e6ef04c654fc2150a177600aa5ed0035087665a893479d2c85ba7485d5704` | `64c6315e3825a295aa82c3218017d5a700381711bfc58a5cbceb9f6bc685b55e` | `433ce7b2cb3ff79751e4a125974f7dfa25f60d57` |

方法：对已有缓存用系统 `tar -xOf` 将 `.PKGINFO`、`.BUILDINFO`、DLL 和 notice 只读到内存；官方 HTTPS 归档重新下载到内存，和缓存逐字节相同。再从 GitHub 官方路径历史获得候选 commit，读取该 commit 的 PKGBUILD 原始字节并匹配 `.BUILDINFO.pkgbuild_sha256sum`，不是只比较版本或网页显示文本。两个 DLL 的 size/SHA256 均与成功 native JSON 的 `privatePeLinkage.prebuiltDllsExcluded` 精确一致。

### 2. libwinpthread r569：当前配方已没有旧包装补丁

精确目录 `mingw-w64-winpthreads/` 在 `aae0fa06746a677422daa223d479d34dc8895796` **只有 PKGBUILD 一个文件**。配方第 29–30 行只有固定 Git source 和一个 checksum，没有本地 patch 项、没有 `prepare()`，不能继续把旧 `0001-Define-__-de-register_frame_info-in-fake-libgcc_s.patch` 作为本版本的实际输入。

- Source：`mingw-w64::git+https://git.code.sf.net/p/mingw-w64/mingw-w64#commit=34eeafb7d0e5b037b4644c17defc4f4131ad85cc`。
- 声明的 `sha256sums`：`09e0b1df237e310561963ade682286855ef45119550df4ca64e712854bc4aaa6`。这是 VCS source 的 makepkg checksum，不是某个 GitHub `.tar.gz` 下载字节的 hash。当前安装的 `usr/share/makepkg/source/git.sh:139` 中 `calc_checksum_git` 对 commit/tag 使用 `git -c core.abbrev=no archive --format tar` 再 hash；本次没有执行 Git 操作或独立重现这个 checksum，不能把它改名成已验证 tarball SHA256。
- GitHub 上游 mirror 的相同 commit 可读取，Git tree 为 `5f0e080af25527d7f317015568d86613ac49bb59`；只读到的 notice、Makefile 和 version.rc 均固定在该 commit。没有独立核验 commit 签名或 SourceForge checkout。
- 当前 `mingw-w64-libraries/winpthreads/Makefile.am` 仍有 `fakelib` bootstrap 规则，哈希和旧记录恰好相同；“包装补丁不再存在”不等于“没有 fakelib”，更不证明 DLL 最终选中哪些成员。当前 source 的 `src/version.rc` 也仍然带 MIT 文本，不能据此跳过它的真实资源编译/SDK 输入链。
- PKGBUILD 第 55 行从固定 source 的 winpthreads 子目录 configure；第 91–103 行的 split `package_libwinpthread()` 安装 DLL 并把 source 的 `mingw-w64-libraries/winpthreads/COPYING` 安装到 `share/licenses/libwinpthread/COPYING`。该 notice 2883 字节，SHA256 `63263614cdd29f2f93cba85e992f041b31f9fc7b4033692f31269489a8a1b177`，与包内原文精确相同，保留 MIT 与 Lockless BSD-3-Clause 的两段内容。
- `.BUILDINFO` 声明 GCC `16.2.0-6`、CRT/headers `14.0.0.r569.g34eeafb7d-1`、binutils `2.47-4`；构建环境里已安装的是 libwinpthread/winpthreads `r536.g7ce22f663-1`，不是输出版本 r569。该环境声明不能变成实际链接成员列表。

### 3. zlib -3：完整 recipe source 集合与范围区别

精确目录 `mingw-w64-zlib/` 在 `433ce7b2cb3ff79751e4a125974f7dfa25f60d57` 有 PKGBUILD 和五个本地 patch 文件；下面机器可读清单记录了**全部**目录文件的 blob/size/SHA256。配方第 29–44 行还声明官方 zlib release archive、其 `.asc` 和远端 `1165.patch`，总共八个 source 项。

- 官方 archive：`https://github.com/madler/zlib/releases/download/v1.3.2/zlib-1.3.2.tar.xz`，1320064 字节，SHA256 `d7a0654783a4da529d1bb793b7ad9c3318020af77667bcae35f95d0e42a792f3`；本轮内存下载与配方声明相同。
- `.asc`：235 字节，SHA256 `03ce710347e2f84fa7ed0a6ae6a93467b08031a3022fc296da40220a83b96667`；配方的对应 checksum 是 `SKIP`，并声明 `validpgpkeys=('5ED46A6721D365587791E2AA783FCD8E58BCAFBA')`。这是签名配置，不是本轮独立签名验证结果；不能由 `SKIP` 推断根本未声明 GPG 检查，也不能由 key 字段推断验证已成功。
- 远端 patch：`https://patch-diff.githubusercontent.com/raw/madler/zlib/pull/1165.patch`，695 字节，SHA256 `af9ce272d3495a27c91e3d37ccfe1146d7e1847ded8b871d86ce3c1875d7cea7`，本轮获取匹配配方固定值。URL 本身不是不可变 commit 路径，必须继续按精确 hash 检查，不接受将来 URL 返回的其它字节。
- `prepare()` 第 54–66 行把 01/03/04/1165 应用到 zlib 根，把 07/08 应用到 `contrib/minizip`。`build()` 第 73 行为 zlib shared 构建，第 83 行起才是 minizip 的独立 configure 和 `LIBS=-lbz2`。这证明配方的预定结构，不是 DLL 内部实际链接贡献；不能把 07/08/bzip2 全算入 zlib1.dll，也不能只靠配方排除所有潜在贡献。
- `package_zlib()` 第 99–109 行只在 `MSYSTEM=MINGW32` 声明 libgcc 包依赖；本次 UCRT64 不进入该分支。notice 来自 release source 的 `zlib-1.3.2/LICENSE`，安装到 `share/licenses/zlib/LICENSE`。该原文 1002 字节、SHA256 `e32ff4e00d9d94930537635291da39e7e612703334bf6fde8c7f1686fe8a45a2`，与包内原文以及 GitHub 上游 `v1.3.2` 的文件完全相同。
- 上游 `v1.3.2` 当前解析到 commit `da607da739fa6047df13e66a2af6b8bec7c2a498`、tree `79b5a06f88838dd54f90f821e8650254abfedb7e`。release archive 的 hash 才是此次 source 文件身份；tag 解析不是签名验证或 archive 全树与 commit 的同一性证明。
- `.BUILDINFO` 声明 GCC `16.2.0-6`、CRT/headers `14.0.0.r532.gdbbc8e99d-1`、binutils `2.47-4`，已安装 winpthreads `r495.g63ebe6cdb-2`/zlib `1.3.2-2`。这与旧 zlib -2 的 GCC15/CRT13 环境明显不同，必须独立留证。

### 4. 文件与既有代码路径

| 文件 | 作用 |
| --- | --- |
| `scripts/xserver_windows_inventory.py:34` | `package_evidence` 读取安装 owner/版本/notice/缓存 archive；现有入口没有把 `.BUILDINFO` 绑定 PKGBUILD |
| `scripts/xserver_windows_inventory.py:68` | `add_runtime_provenance` 从实际 PE provider 绑定包名，不能代表该 DLL 内部来源 |
| `scripts/xserver_windows_private_links.py:65` | 将 target-toolchain DLL 放入 `prebuiltDllsExcluded`，本研究不能移除这一排除 |
| `.trellis/.runtime/pr89-ci-native-41170743513/xserver-windows-review.json` | 成功的精确 HEAD 原生报告；本轮两个 DLL 的字节身份从这里核对 |
| `.trellis/.runtime/pr89-msys2/msys64/var/cache/pacman/pkg/` | 只读发布包缓存；重新匹配官方 URL 的响应字节，不安装或执行 |
| `research/windows-prebuilt-runtime-obligations.md` | 旧/新版本边界、B0–B4 与分发条件；本文件补当前两个版本的 B1 材料，不覆盖其内部贡献缺口 |

## Machine-Readable Pins

以下 JSON 是本次实际读取结果，不包含外部实现；`recipeFiles` 每项都可由 `repository + commit + path` 重新读取。`source` 的 declared 字段与实际下载/签名验证字段刻意分开。

```json
{
  "repository": "https://github.com/msys2/MINGW-packages",
  "packages": [
    {
      "package": "mingw-w64-ucrt-x86_64-libwinpthread",
      "version": "14.0.0.r569.g34eeafb7d-1",
      "archive": {"name": "mingw-w64-ucrt-x86_64-libwinpthread-14.0.0.r569.g34eeafb7d-1-any.pkg.tar.zst", "size": 34529, "sha256": "b4ebe2826e848c5e790e06ea7b37d3e0594e005f42382b0506886f17df8127da"},
      "archiveSignature": {"size": 566, "sha256": "3e16ed09ba3d0c4cd426cff73624326266b7cbb80b030f77093ca435598fb021", "independentlyVerified": false},
      "pkgInfo": {"size": 805, "sha256": "8dc1a10605a4ed040e105ca6039b4cb5b48f861374d463edd09daa27ad2b843a"},
      "buildInfo": {"size": 7477, "sha256": "455df1f932e3ad469181e178b5a0afabb34cfe1c68f39525b3f0e4b5a4dd10e3", "pkgbuildSha256": "ce977f0a06848c55cfdea7bdcbaa49036ca204eb4f1a1d11788712d355996367"},
      "dll": {"path": "ucrt64/bin/libwinpthread-1.dll", "size": 73820, "sha256": "ee4f503512b09d7e2668518c41d6c176755a354523ae15aa4d36220c9cb31791"},
      "recipeCommit": "aae0fa06746a677422daa223d479d34dc8895796",
      "recipeFiles": [
        {"path": "mingw-w64-winpthreads/PKGBUILD", "size": 3897, "sha256": "ce977f0a06848c55cfdea7bdcbaa49036ca204eb4f1a1d11788712d355996367", "gitBlob": "0416e8fe370b8ea345d7d92bb067c4cbbe433953"}
      ],
      "source": {
        "kind": "git",
        "url": "git+https://git.code.sf.net/p/mingw-w64/mingw-w64#commit=34eeafb7d0e5b037b4644c17defc4f4131ad85cc",
        "commit": "34eeafb7d0e5b037b4644c17defc4f4131ad85cc",
        "declaredMakepkgArchiveSha256": "09e0b1df237e310561963ade682286855ef45119550df4ca64e712854bc4aaa6",
        "makepkgArchiveChecksumIndependentlyReproduced": false,
        "localPatchFiles": [],
        "detachedSourceSignatureDeclared": false
      },
      "sourceAnchors": [
        {"path": "mingw-w64-libraries/winpthreads/COPYING", "size": 2883, "sha256": "63263614cdd29f2f93cba85e992f041b31f9fc7b4033692f31269489a8a1b177", "gitBlob": "3507701238b798b1ddbf4d5ffe16f285f4458963"},
        {"path": "mingw-w64-libraries/winpthreads/Makefile.am", "size": 2850, "sha256": "467faeff657654a97a31a893e7f701efe351c8ad7c583d7af4f4671d7b38287d", "gitBlob": "d341608c054edf09b050ceffd596e52a367d6793"},
        {"path": "mingw-w64-libraries/winpthreads/src/version.rc", "size": 2524, "sha256": "de400c09bf47f2e460cc08733307640ddfc420336745d40eb4c9fcfef68ba27a", "gitBlob": "19c2d1e702aa496b0482b63ca11b7f2ad09ffcb2"}
      ],
      "installedNotice": {"path": "ucrt64/share/licenses/libwinpthread/COPYING", "size": 2883, "sha256": "63263614cdd29f2f93cba85e992f041b31f9fc7b4033692f31269489a8a1b177"}
    },
    {
      "package": "mingw-w64-ucrt-x86_64-zlib",
      "version": "1.3.2-3",
      "archive": {"name": "mingw-w64-ucrt-x86_64-zlib-1.3.2-3-any.pkg.tar.zst", "size": 108848, "sha256": "130e6ef04c654fc2150a177600aa5ed0035087665a893479d2c85ba7485d5704"},
      "archiveSignature": {"size": 566, "sha256": "02f4d0f0e7dcee24cce17eb5d4fe8d74095c0caf3db98318afc56a2e8ec74d33", "independentlyVerified": false},
      "pkgInfo": {"size": 559, "sha256": "ad21f7367879d2ac725f08bb520407ccb7680831d7dcaf48ec44cefaa18e8dbd"},
      "buildInfo": {"size": 6075, "sha256": "1583e14da355bd89b68704ad64dae3196e151f05ed3fafd3608f7ee8f3313da1", "pkgbuildSha256": "64c6315e3825a295aa82c3218017d5a700381711bfc58a5cbceb9f6bc685b55e"},
      "dll": {"path": "ucrt64/bin/zlib1.dll", "size": 121530, "sha256": "8ae7aeb0467763a1e271cd831ca8e2f7fd101602adb9923100ea26c6be2a559b"},
      "recipeCommit": "433ce7b2cb3ff79751e4a125974f7dfa25f60d57",
      "recipeFiles": [
        {"path": "mingw-w64-zlib/PKGBUILD", "size": 4335, "sha256": "64c6315e3825a295aa82c3218017d5a700381711bfc58a5cbceb9f6bc685b55e", "gitBlob": "222183a0fc21f5e285dafd531d86d65bef15904a"},
        {"path": "mingw-w64-zlib/01-zlib-1.2.11-1-buildsys.mingw.patch", "size": 9316, "sha256": "b58b353d976d6fdd9a5094e60fa39439d4f14e9bf8be4a8bd475f2cd47f10226", "gitBlob": "ec7c0b8e38c37bf7cb86b73297948499c775f192"},
        {"path": "mingw-w64-zlib/03-dont-put-sodir-into-L.mingw.patch", "size": 172, "sha256": "7287d12db57dcf0f66964c861100bf06ebe1ddcb243e7ee0773fcab1b2935596", "gitBlob": "0fce7d5844646e21230ad3f4248629127a5dbd30"},
        {"path": "mingw-w64-zlib/04-fix-largefile-support.patch", "size": 756, "sha256": "8e1cdf8edfc6ac08b0e660ca42a977942a88fab3ff59c01c87ba96500e2c3e63", "gitBlob": "bcfb3f02ec0a3f6e3920127921d6b9d51c08f459"},
        {"path": "mingw-w64-zlib/07-Add-no-undefined-to-link-to-enable-build-shared-vers.patch", "size": 722, "sha256": "fb83292f494f649ea7f1835aa4abea61acc593d7f90625741d42cd99cac0e075", "gitBlob": "e2621b1d17ee47c55b68d917734212f334464c61"},
        {"path": "mingw-w64-zlib/08-Add-bzip2-library-to-pkg-config-file.patch", "size": 616, "sha256": "0be98a7e660e7c068856f08b9e92d6c73a6b0d88c3e29a9716140b147f7c23c5", "gitBlob": "306254e1442f7e929e833d3edfa695b15015d9a3"}
      ],
      "sourceFiles": [
        {"url": "https://github.com/madler/zlib/releases/download/v1.3.2/zlib-1.3.2.tar.xz", "size": 1320064, "sha256": "d7a0654783a4da529d1bb793b7ad9c3318020af77667bcae35f95d0e42a792f3", "matchesDeclaredChecksum": true},
        {"url": "https://github.com/madler/zlib/releases/download/v1.3.2/zlib-1.3.2.tar.xz.asc", "size": 235, "sha256": "03ce710347e2f84fa7ed0a6ae6a93467b08031a3022fc296da40220a83b96667", "declaredChecksum": "SKIP", "signatureIndependentlyVerified": false},
        {"url": "https://patch-diff.githubusercontent.com/raw/madler/zlib/pull/1165.patch", "size": 695, "sha256": "af9ce272d3495a27c91e3d37ccfe1146d7e1847ded8b871d86ce3c1875d7cea7", "matchesDeclaredChecksum": true}
      ],
      "declaredValidPgpKeys": ["5ED46A6721D365587791E2AA783FCD8E58BCAFBA"],
      "upstreamCommitAtVersionTag": "da607da739fa6047df13e66a2af6b8bec7c2a498",
      "sourceAnchors": [
        {"path": "zlib-1.3.2/LICENSE", "size": 1002, "sha256": "e32ff4e00d9d94930537635291da39e7e612703334bf6fde8c7f1686fe8a45a2", "gitBlobAtVersionTag": "b7a69d058e616651eae27b3f90c0b7fd36c099b2"},
        {"path": "zlib-1.3.2/configure", "size": 32907, "sha256": "c07499bd24003913f8488b4100db86c79830a8faa09e4b950f09f5b51a48787d"}
      ],
      "installedNotice": {"path": "ucrt64/share/licenses/zlib/LICENSE", "size": 1002, "sha256": "e32ff4e00d9d94930537635291da39e7e612703334bf6fde8c7f1686fe8a45a2"}
    }
  ]
}
```

## External References

- [R1] MSYS2 官方包归档：[libwinpthread r569](https://repo.msys2.org/mingw/ucrt64/mingw-w64-ucrt-x86_64-libwinpthread-14.0.0.r569.g34eeafb7d-1-any.pkg.tar.zst)、[zlib -3](https://repo.msys2.org/mingw/ucrt64/mingw-w64-ucrt-x86_64-zlib-1.3.2-3-any.pkg.tar.zst)。对应 `.sig` 只记录取得的字节，未独立验证。
- [R2] 固定配方：[winpthreads](https://github.com/msys2/MINGW-packages/blob/aae0fa06746a677422daa223d479d34dc8895796/mingw-w64-winpthreads/PKGBUILD)、[zlib](https://github.com/msys2/MINGW-packages/blob/433ce7b2cb3ff79751e4a125974f7dfa25f60d57/mingw-w64-zlib/PKGBUILD)。获取入口为 `https://api.github.com/repos/msys2/MINGW-packages/contents/<path>?ref=<commit>`，取 `content` 原始字节及 `sha`，不是 HTML。
- [R3] 固定上游 winpthreads：[COPYING](https://github.com/mingw-w64/mingw-w64/blob/34eeafb7d0e5b037b4644c17defc4f4131ad85cc/mingw-w64-libraries/winpthreads/COPYING)、[Makefile.am](https://github.com/mingw-w64/mingw-w64/blob/34eeafb7d0e5b037b4644c17defc4f4131ad85cc/mingw-w64-libraries/winpthreads/Makefile.am)、[version.rc](https://github.com/mingw-w64/mingw-w64/blob/34eeafb7d0e5b037b4644c17defc4f4131ad85cc/mingw-w64-libraries/winpthreads/src/version.rc)。原配方的 source URL 仍是 SourceForge，GitHub 读取不冒充一次 SourceForge checkout。
- [R4] zlib [1.3.2 release archive](https://github.com/madler/zlib/releases/download/v1.3.2/zlib-1.3.2.tar.xz)、[分离签名](https://github.com/madler/zlib/releases/download/v1.3.2/zlib-1.3.2.tar.xz.asc)、[1165.patch](https://patch-diff.githubusercontent.com/raw/madler/zlib/pull/1165.patch)、[固定 LICENSE](https://github.com/madler/zlib/blob/da607da739fa6047df13e66a2af6b8bec7c2a498/LICENSE)。
- [R5] 通过 Context7 `/msys2/msys2.github.io` 查询并读取的官方 [Creating Packages](https://www.msys2.org/wiki/Creating-Packages/) 与 [PKGBUILD](https://www.msys2.org/dev/pkgbuild/)：配方包含 PKGBUILD、安装脚本及本地 patch，不能只保存上游裸 source URL。Context7 未提供 VCS checksum 的具体算法，本文将本机 `calc_checksum_git` 作为当前实现观察，未声称它是已核验的历史 buildtool 来源。

## Related Specs

- `.trellis/spec/backend/xserver-windows-private-links.md`：实际 provider/version/hash 与排除范围；同版本配方不能代替 `.BUILDINFO` 精确字节。
- `.trellis/spec/backend/xserver-source-review.md`：只读、固定来源、失败闭合、采集完成不等于签名/许可/发行完成。
- `.trellis/spec/backend/xserver-windows-resources.md`：资源来源与最终 PE 证据，不覆盖预编译 DLL 内部。

## Caveats / Not Found

- 两个新版本的精确包/配方/本地材料和 notice 已绑定，但没有重建这些 DLL，也没有它们的实际 link map、选中 archive/object、编译 depfiles、生成输入或完整 resource 链。发布包分别只有 10/21 个成员，没有这些内部构建记录。
- 本轮没有对发布包 `.sig`、zlib source `.asc` 或 Git commit/tag 进行独立签名验证。下载匹配与包管理器历史行为不替代签名链验证。
- winpthreads 的整个 VCS tree/export checksum 尚未由本轮独立复现；GitHub commit/选定文件 hash 不是完整 SourceForge source export 的字节证据。
- `.BUILDINFO` 的 `!sign`、`!debug`、`!lto` 是声明的 buildenv/options；不能推断之后未给发布包签名，或以此关闭 GCC Runtime Library Exception 条件审查。
- 未联系作者、补造资源授权或批准第三方组件；未变更链接方式、打包、能力标志、用户网络或杀软设置。旧 r495 的 fake-libgcc 包装补丁不能当作 r569 输入；当前 `fakelib` 源规则仍需 B2 实际贡献证据。
