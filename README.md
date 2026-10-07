# NexaTerm

[![CI](https://github.com/DenisZheng/NexaTerm/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/DenisZheng/NexaTerm/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

English | [简体中文](README.zh-CN.md)

**Sessions, terminals, remote files and operations tools in one desktop workspace.**

NexaTerm is a lightweight, cross-platform remote workstation built with Tauri, React and Rust. It brings session management, terminals, remote files, split workspaces, MultiExec, tunnels and remote desktops into a unified desktop app.

![NexaTerm Home with Quick Connect, recent sessions and the Sessions sidebar](docs/assets/readme/home.png)

## Why NexaTerm

- **One session workflow.** Start from Quick Connect or a saved profile; organize profiles with groups, favorites and recent connections.
- **Independent instances.** Open the same profile more than once, arrange instances in tabs or split panes, and keep each terminal's Files context separate.
- **Explicit control.** MultiExec sends to the instances you select. Changing focus or reconnecting a host does not silently change the receiving targets.
- **A connected toolbox.** Files, editing, monitoring, commands, tunnels, Docker and AI assistance stay close to your active session.

## Screenshots

Native macOS Tauri windows, using fictional profiles and local test servers.

### SSH + Files

Files lives in the left sidebar and follows the active SSH instance or split pane. Directory following is an explicit, per-instance setting.

![SSH terminal with its instance-bound Files sidebar](docs/assets/readme/ssh-files.png)

### Split workspace + MultiExec

Choose two or four panes, then explicitly select the instances that receive live input or a submitted command.

![Split workspace with active MultiExec and selected receiver instances](docs/assets/readme/split-multiexec.png)

### Sessions and groups

Browse saved profiles, favorites and groups, see open instances, and preview a group batch before opening connections.

![Session manager with groups, favorites and open instance indicators](docs/assets/readme/session-manager.png)

### Operations tools

Use saved commands and session tools alongside the terminal.

![Operations tools alongside an SSH terminal](docs/assets/readme/tools.png)

### Appearance and settings

English and Simplified Chinese, light/dark/system appearance, and an independently configurable terminal color scheme.

![NexaTerm appearance settings](docs/assets/readme/settings.png)

## Core features

| Area | Capabilities |
| --- | --- |
| Sessions | Unified Session Manager, Quick Connect, favorites, nested groups, recent connections, search, multiple instances per saved profile and batch-open preview. |
| Terminals and desktops | SSH, Local Shell, WSL on Windows, Serial, Telnet, RDP and VNC; protocol availability and desktop rendering mode depend on the platform and installed runners. |
| Workspace | Instance tabs, two/four-pane splits, adjustable pane ratios and fixed-target MultiExec in live or send mode. Disconnected targets become invalid; reconnecting does not rejoin them automatically. |
| Files and editing | SSH/SFTP Files bound to the active instance/pane, per-instance directory following, transfer queue, upload/download, file operations and a remote text editor with save-conflict checks. |
| Networking | SSH Tunnel Manager for local, remote and dynamic SOCKS forwarding; multi-hop Jump Host chains; X11 forwarding with an available local X server. |
| Operations | Saved Commands and history, host monitoring, Docker containers/images/logs, network diagnostics and remote scheduled tasks. |
| AI and MCP | AI terminal assistant with selectable session context and command suggestions; configurable model provider. MCP exposes authorized connection/SSH tools; Remote MCP binds to loopback and remote access uses an authenticated tunnel. |
| Persistence and settings | Workspace Restore, English/zh-CN, Light/Dark/System, encrypted data import/export, WebDAV synchronization and application updater infrastructure. |

Workspace Restore retains layout, instance references and per-instance Files directories/follow settings. Reconnection is configurable; MultiExec always returns **off**. Passwords, private keys, runtime handles and active broadcast state are not stored in the workspace snapshot. Unsaved remote-editor drafts are not restored.

Data migration from **legacy mXterm to NexaTerm app data** is separate from session-file import. A dedicated **MobaXterm `.mxtsessions` importer** is also present: it previews SSH session definitions, reports unsupported entries and requires missing usernames or network settings to be reviewed. It does not import passwords or non-SSH sessions; referenced private-key paths may need adjustment.

## Protocol and capability matrix

| Capability | Status |
| --- | --- |
| SSH / SFTP | Core |
| Local Shell | Core |
| WSL | Core / Windows |
| Serial | Core; additional platform/device validation remains |
| Session Manager / Quick Connect | Core |
| Tabs / Split Workspace | Core |
| Fixed-target MultiExec | Core |
| Saved Commands / Remote Editor | Core |
| Tunnels / multi-hop Jump Host | Core |
| Workspace Restore | Core |
| Monitoring / Docker tools | Available with a suitable remote environment |
| AI assistant / MCP | Available; provider/access configuration required |
| Telnet | Experimental |
| RDP | Experimental |
| VNC | Experimental |
| X11 | Experimental |
| Application updater | Implemented; final release validation pending |

**Experimental** means the feature is available, but full cross-platform maturity is not part of the current v1 release gate. RDP/VNC modes depend on platform capabilities and detected runners. X11 has Windows GUI acceptance evidence; macOS/Linux GUI validation and X-server distribution decisions remain open. Serial does not yet have a complete real-device matrix. Linux IME acceptance remains deferred ([PR #12](https://github.com/DenisZheng/NexaTerm/pull/12)).

## Current release status

NexaTerm is completing its **final v1 release validation**. Core workflows **A01–A14 have completed acceptance within their documented platform and environment scope**; this is not a claim of complete three-platform release acceptance.

Final **A15** validation still covers:

- Packaged installation and launch.
- Platform signing and macOS notarization.
- Updater upgrade, recovery and rollback.
- Legacy mXterm app-data migration.
- Packaged performance and stability.
- Artifact hash reconciliation.

Release signing, notarization and updater pipelines are implemented and undergoing final release validation. See the [roadmap](ROADMAP.md) and [acceptance report](.trellis/tasks/09-23-nexaterm-workflow-mainline/validation/acceptance-report-2026-10-04.md) for evidence and remaining platform boundaries.

## Download

[GitHub Releases](https://github.com/DenisZheng/NexaTerm/releases) · [Latest Release](https://github.com/DenisZheng/NexaTerm/releases/latest)

No public GitHub Release has been published at this documentation update. Available builds will be distributed through GitHub Releases; the Latest Release link currently redirects to the release list and will point to a version after the first publication. Final A15 sign-off is still pending.

## Platform support

| Platform | Status | Release artifacts | In-app updater target |
| --- | --- | --- | --- |
| Windows x64 | Supported target | NSIS installer, portable ZIP | NSIS installation |
| macOS ARM64 / Apple Silicon | Supported target | App / DMG, updater archive | Installed app |
| Linux x64 | Supported target | AppImage, deb, rpm | AppImage |

These are build and release targets; final packaged acceptance remains under A15. macOS Intel is outside the initial release target set. Windows portable ZIP and Linux deb/rpm remain manual-download formats.

## Development

Install Node.js, the pnpm version specified by [`package.json`](package.json), Rust and the [Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/).

```sh
pnpm install
pnpm run tauri:dev
```

Checks and frontend build:

```sh
pnpm run check
pnpm test
pnpm run test:scripts
pnpm run build
```

Package on the corresponding host platform:

```sh
pnpm run package:win
pnpm run package:mac-arm64
pnpm run package:linux
```

`pnpm run package:all` selects the current host's supported target; it does not cross-build all three platforms. The development server uses port 5520 by default. Node.js/pnpm are build tools; the desktop runtime uses Rust/Tauri and a native WebView, without a Node/Express service.

### Contributing

Read [AGENTS.md](AGENTS.md) and the [workflow specification](docs/WORKFLOW_SPEC.md) before changing behavior. Development tasks and engineering conventions are maintained with Trellis in [`.trellis/workflow.md`](.trellis/workflow.md) and [`.trellis/spec/`](.trellis/spec/). Real-service fixtures are documented in [`tests/fixtures/README.md`](tests/fixtures/README.md).

## Release and signing overview

The [release workflow](.github/workflows/release.yml) builds the three target platforms. A `v*` tag publishes a GitHub Release; manual `workflow_dispatch` performs build and asset validation without publishing.

Versions in `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json` must match. The pipeline prepares platform packages, source archives, updater `latest.json`, third-party notices and `SHA256SUMS.txt`. Tagged releases enforce Windows Authenticode and macOS Developer ID/notarization verification; updater artifacts have a separate signing trust chain. Required credentials and procedures are in [Release Signing and Notarization](docs/RELEASE_SIGNING.md). Pipeline implementation does not constitute completed real-release validation.

## Project documentation

- [Current roadmap and release boundaries](ROADMAP.md)
- [Product requirements](NEXATERM_REQUIREMENTS.md)
- [Workflow specification](docs/WORKFLOW_SPEC.md)
- [A01–A15 acceptance report](.trellis/tasks/09-23-nexaterm-workflow-mainline/validation/acceptance-report-2026-10-04.md)
- [Release signing and notarization](docs/RELEASE_SIGNING.md)
- [Third-party licenses](THIRD_PARTY_LICENSES.md)

## Project lineage

NexaTerm is a **hard fork of [syscryer/mxterm](https://github.com/syscryer/mxterm)**, originally released under the MIT License. NexaTerm develops independently, with its own bundle ID (`com.nexaterm.app`) and release/update channel. Upstream security fixes may be reviewed selectively.

mXterm and MobaXterm are distinct projects. NexaTerm is not a MobaXterm fork and is not officially affiliated with MobaXterm.

## License

[MIT License](LICENSE). See [third-party notices](THIRD_PARTY_LICENSES.md) for dependencies and bundled components.

## Acknowledgements

Thanks to the original mXterm contributors and the Tauri, React and Rust ecosystems.
