# P1-3 MobaXterm Session Import

## Goal

Make MobaXterm migration a low-friction P1 on-ramp without turning external session files into a hidden overwrite path or pretending unsupported settings were preserved.

The first slice is deliberately preview-only: parse the source file, classify sessions, expose missing input and unsupported settings, and establish a stable backend contract before any database mutation.

## Source format facts

`.mxtsessions` exports are INI-like bookmark files. Bookmark sections are named `Bookmarks` / `Bookmarks_N`; `SubRep` stores the folder path. Session values are `#`-separated characteristic groups and the first group is `%`-separated. Older sessions can contain fewer trailing fields than newer sessions, so the parser must read known indexes defensively instead of requiring an exact field count.

The initial mapping is based on the public reverse-engineered format notes at:

- https://gist.github.com/Ruzgfpegk/ab597838e4abbe8de30d7224afd062ea

The 2026-09-29 validation sample additionally covers:

- SSH sessions with the normal port and non-standard ports;
- sessions with and without an explicit username;
- PuTTY PPK private-key path references;
- a WSL session in the same export;
- both shorter legacy SSH records and longer records with newer trailing fields.

The real validation sample is not committed to the repository.

## First slice: preview contract

### Supported for parsing

The parser recognizes common MobaXterm session type codes so the preview can report them accurately:

- SSH (`0`)
- Telnet (`1`)
- RDP (`4`)
- VNC (`5`)
- SFTP (`7`)
- Serial (`8`)
- WSL (`14`)

Only SSH is an import candidate in the first slice. Other recognized types are returned as `unsupported`, not silently converted to SSH.

### SSH fields mapped in preview

- bookmark name -> candidate NexaTerm connection name
- `SubRep` -> source folder path (preserved as text for the later group-mapping step)
- remote host
- port
- explicit username
- private-key path reference

The parser also detects settings that cannot yet be faithfully mapped:

- startup command
- SSH gateway / jump chain
- non-default proxy
- X11 forwarding

Those settings produce explicit warnings. Gateway/proxy settings require review before import because silently dropping them could change connectivity or security semantics.

### Missing username

MobaXterm can leave the per-session username empty and use a global/default login. NexaTerm currently requires an explicit username for saved SSH profiles.

The preview therefore returns such sessions as `needs_input` with `missing_fields = ["username"]`. The UI slice should provide one editable default username that fills only sessions where the source username is absent, plus per-row override if needed. Do not infer the remote username from the local OS account without showing it to the user.

### Private keys and secrets

A `.mxtsessions` record can reference a local private-key path. The importer may preserve that path as a reference, but it must warn that the file needs to exist on the machine running NexaTerm.

The importer must not treat the source file as a credential vault:

- do not import passwords or passphrases into NexaTerm secrets from this format;
- do not copy private-key contents;
- do not commit user-provided session exports as fixtures;
- use sanitized synthetic fixtures in tests.

A key-path reference can later map to `credential_mode = inline`, `inline_auth_kind = private_key`, with no passphrase. SSH sessions without a key path should use prompt authentication unless the user explicitly maps them to a saved credential.

## Encoding and compatibility

Prefer valid UTF-8 when present and fall back to Windows-1252/CP1252, which is used by traditional MobaXterm exports. CRLF and LF are both accepted. UTF-8 BOM is ignored.

The parser must not require an exact number of `%` fields. It only reads indexes it understands and ignores unknown trailing fields.

## Import conflict rules (next slice)

MobaXterm exports do not provide a NexaTerm UUID, so the first importer should avoid destructive overwrite semantics.

Recommended rules:

1. Exact local duplicate: same protocol + name + host + port + username -> default `skip`.
2. Same target but different name -> keep as a distinct candidate and show a possible-duplicate warning.
3. Same name but different target -> require rename before import; suggest `Name (MobaXterm)` rather than overwriting.
4. Never overwrite an existing NexaTerm connection solely because an external bookmark has the same name.
5. Re-preview and verify the source-file fingerprint immediately before mutation, matching the existing connection-transfer TOCTOU protection pattern.

## Folder mapping

The parser preserves the full `SubRep` path. Until hierarchical connection groups are stored canonically, the importer must not discard parent segments. The first mutation slice can either:

- keep the full source path as one flat group label; or
- wait for the group hierarchy schema and map it losslessly.

The UI should show the source folder path in preview either way.

## WSL

WSL is recognized in preview but is not imported in the first slice. NexaTerm currently discovers Local/WSL profiles through the local-terminal provider rather than storing them in `ConnectionProfile`, so coercing WSL into an SSH connection would be incorrect.

A later Local/WSL saved-profile model can add a proper mapping.

## Acceptance for the preview slice

- A valid `.mxtsessions` file returns a stable SHA-256 fingerprint.
- Short and long SSH records both parse without exact-length assumptions.
- Host, port, explicit username, key path, and folder path are surfaced.
- Missing username is `needs_input`, not a parse failure.
- WSL is recognized as WSL and returned as unsupported, never as SSH.
- CP1252 session names decode correctly.
- Unsupported network settings are visible as warnings.
- No source session file or real host/key data is committed to the repository.
