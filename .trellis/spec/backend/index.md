# Backend Development Guidelines

> Best practices for backend development in this project.

---

## Overview

This directory contains guidelines for backend development. Fill in each file with your project's specific conventions.

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Module organization and file layout | To fill |
| [Database Guidelines](./database-guidelines.md) | ORM patterns, queries, migrations | To fill |
| [Connection Groups](./connection-groups.md) | WF-04A canonical group model, SQLite v3 migration and repository contracts | Active |
| [Credential & Vault Boundaries](./credential-vault-boundaries.md) | WF-09-03B revoked handles, deletion rollback and secret exclusion | Active |
| [Error Handling](./error-handling.md) | Error types, handling strategies | To fill |
| [Quality Guidelines](./quality-guidelines.md) | Code standards, forbidden patterns, CI security gates | Active |
| [Security Evidence](./security-evidence.md) | 密钥硬门禁、依赖审计报告、CI artifact 与工具故障契约 | Active |
| [Session Log Writer](./session-log-writer.md) | WF-09-05B bounded exclusive UTF-8 file sink; live capture integration pending | Active |
| [Logging Guidelines](./logging-guidelines.md) | Structured logging, log levels | To fill |
| [Tauri Command Contracts](./tauri-command-contracts.md) | Command payloads, validation, storage contracts | Active |

---

## How to Fill These Guidelines

For each guideline file:

1. Document your project's **actual conventions** (not ideals)
2. Include **code examples** from your codebase
3. List **forbidden patterns** and why
4. Add **common mistakes** your team has made

The goal is to help AI assistants and new team members understand how YOUR project works.

---

**Language**: All documentation should be written in **English**.

- [Local Connection Probe](./connection-probe.md) — bounded DNS/TCP/loopback-bind probes, reservation IPC, cancellation and sanitized results.

- [Loopback File Service](./loopback-file-service.md) — bounded single-file HTTP, main-window leases, token and shutdown contracts.

- [XDMCP Managed Runner](./xdmcp-runner.md) — external development engine ownership, process group/job cleanup and explicit incomplete bundled capability.

- [Rlogin Protocol Core](./rlogin-protocol.md) — L0 request/handshake/window framing, bounded private rejection handling and loopback TCP fixtures; terminal/OOB integration remains L1.

- [Native Legacy Sockets](./legacy-native-sockets.md) — L1 reserved source sockets and native OOB/mark/flow/window controller; session/IPC/terminal integration remains pending.

- [Rlogin Native Establish](./rlogin-connect.md) — BSD profile validation, one total deadline and owned ACK-tail transfer; session/IPC/UI remain pending.

- [Rlogin Session Owner](./rlogin-session.md) — consented generation leases, real worker lifetime and byte-bounded pull/ACK/flush delivery; IPC/UI pending.
