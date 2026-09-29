# Remote MCP loopback-only transport

Date: 2026-09-29

## Decision

Remote MCP's HTTP/SSE listener is **loopback-only**. NexaTerm no longer supports binding the managed MCP sidecar directly to LAN/public interfaces.

The canonical bind address is `127.0.0.1`. Remote machines must reach it through an authenticated transport such as an SSH tunnel.

This closes the Review P2-1 requirement by choosing the **tunnel-only** branch instead of adding a second TLS certificate lifecycle to NexaTerm.

## Threat model

The MCP HTTP transport carries:

- bearer token material;
- connection metadata;
- command arguments and output;
- file-operation requests/results.

Plain HTTP is acceptable only on the local loopback boundary. It must not be placed directly on a LAN/public interface.

## Defense in depth

Three independent layers enforce the rule:

1. **Settings/repository layer**
   - every save persists `remote_host = 127.0.0.1`;
   - legacy `0.0.0.0` / LAN settings are migrated on the next save;
   - the old exposure acknowledgement field remains deserializable only for compatibility and is always persisted as `false`.

2. **Managed sidecar launch**
   - the parent passes only the effective canonical loopback host.

3. **Sidecar CLI/runtime**
   - `mxterm-mcp serve --host ...` rejects every non-loopback host even when launched manually;
   - accepted TCP peers are checked again and non-loopback peers are closed.

The bearer token remains required even over loopback/tunnel access.

## Remote access

Example where the NexaTerm machine runs MCP on port 8765:

```bash
ssh -N -L 8765:127.0.0.1:8765 user@nexaterm-host
```

The remote Agent then connects to:

```text
http://127.0.0.1:8765/mcp
```

and sends the existing bearer token.

A different local tunnel port is also valid; clients must then change their local URL accordingly.

## Legacy migration

Older settings may contain `remote_host = 0.0.0.0` and an exposure acknowledgement.

- They are never honored as a bind address by the new runtime.
- Status may report that the stored legacy host was downgraded.
- Any subsequent MCP settings save canonicalizes the stored host to `127.0.0.1` and clears the acknowledgement.

No automatic network listener remains on the legacy address.

## Non-goals

- NexaTerm does not terminate public TLS for MCP in this model.
- NexaTerm does not manage certificates, ACME, DNS, or reverse-proxy configuration for MCP.
- Direct LAN HTTP access is intentionally unsupported.

## Verification

CI source tests guard the backend canonicalization, sidecar host rejection and removal of LAN-bind controls from the settings UI. Rust tests cover sidecar rejection and legacy settings migration.
