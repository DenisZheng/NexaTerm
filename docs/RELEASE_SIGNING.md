# Release Signing and Notarization

This document describes the credentials required by the NexaTerm tagged-release workflow.

No certificate, private key, password, Apple credential, or Tauri updater private key belongs in the repository.

## Release policy

- `workflow_dispatch` remains a build/asset validation path.
- A `v*` tag is the only path that publishes a GitHub Release.
- Tagged Windows builds must be Authenticode-signed.
- Tagged macOS builds must use a Developer ID Application certificate and complete Apple notarization/stapling.
- Tauri updater artifacts remain independently signed with the configured updater signing key.
- A missing OS-signing credential or failed post-build verification stops the tagged release before publish.

## GitHub Secrets

### Tauri updater

Required for release artifact signing:

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` when the updater private key is password-protected

The corresponding public key remains in `src-tauri/tauri.conf.json`.

### Windows Authenticode

Required for tagged Windows releases:

- `WINDOWS_CERTIFICATE`: base64-encoded PFX/PKCS#12 code-signing certificate including its private key
- `WINDOWS_CERTIFICATE_PASSWORD`: PFX export password

Optional repository variable:

- `WINDOWS_TIMESTAMP_URL`: RFC 3161/authenticode timestamp service URL. If absent, the workflow uses `http://timestamp.digicert.com`.

The runner imports the certificate into `Cert:\CurrentUser\My`, extracts the certificate thumbprint, and injects it into the Tauri build configuration at runtime. The thumbprint is not committed.

After build, the workflow verifies both the NexaTerm executable and the NSIS installer with `Get-AuthenticodeSignature`. Any non-`Valid` result fails the release.

## macOS Developer ID and notarization

Required for tagged macOS releases:

- `APPLE_CERTIFICATE`: base64-encoded Developer ID Application `.p12`
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_ID`: Apple account email used for notarization
- `APPLE_PASSWORD`: app-specific password for that Apple account
- `APPLE_TEAM_ID`

The workflow creates an ephemeral keychain, imports the certificate, discovers the `Developer ID Application` identity, and exports only the identity name to the Tauri build environment.

Tauri receives the Apple notarization credentials for the tagged build. After build the workflow verifies:

- `codesign --verify --deep --strict` on `NexaTerm.app`
- Gatekeeper assessment with `spctl --assess --type execute`
- a stapled notarization ticket on the DMG with `xcrun stapler validate`

Any failure stops the release before the publish job.

## Rotation

When rotating either OS certificate:

1. replace the corresponding GitHub Secret values;
2. do not change application source merely to update the Windows certificate thumbprint;
3. run a tagged release candidate and inspect signing/notarization verification logs;
4. keep the same trusted publisher identity when practical so platform reputation is not needlessly reset.

When rotating the Tauri updater signing key, update both the GitHub updater private-key secret and the public key embedded in `tauri.conf.json` in the same controlled release.

## Official references

- Tauri Windows code signing: https://v2.tauri.app/distribute/sign/windows/
- Tauri macOS code signing and notarization: https://v2.tauri.app/distribute/sign/macos/
- Tauri updater: https://v2.tauri.app/plugin/updater/
