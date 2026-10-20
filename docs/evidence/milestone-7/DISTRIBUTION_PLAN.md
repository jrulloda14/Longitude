# Milestone 7 distribution plan (draft for approval)

October 20, 2026. Planning document produced during M7.0. **Nothing here is implemented or verified yet.** Each phase needs separate approval.

## Decisions recorded

| Decision | Choice | Source |
| --- | --- | --- |
| Platform priority | Windows and macOS both prioritized; Windows ships first, macOS follows once Apple credentials exist | User, Oct 20 |
| Windows signing | Unsigned for now (SmartScreen "unknown publisher" warning expected) | User, Oct 20 |
| Updates | Manual only. No updater and no network contact, preserving the local-first design | User, Oct 20 |
| Mac packaging | One universal (Apple Silicon + Intel) DMG, as the default | User had no preference |
| Mac route | Developer ID direct download. The App Store is excluded because the transparent widget needs `macos-private-api` | Existing 5B review |

## Open prerequisites (user)

1. **Project license.** `package.json` says `UNLICENSED`, which blocks any public open-source release.
2. **Apple Developer Program enrollment** ($99/yr). Approval can take days; organizations also need a D-U-N-S number.
3. **Physical Mac access** for acceptance (any Apple Silicon or Intel Mac on macOS 12+).
4. **Publisher identity** for installer metadata: publisher name, copyright line, homepage URL.

## Windows (first)

Current state: NSIS per-user installer, `webviewInstallMode: downloadBootstrapper`, unsigned, built locally only.

- **Installer metadata:** publisher, copyright, short/long description, homepage, and the license once chosen. Keep the per-user install (no admin prompt).
- **WebView2:** keep the download bootstrapper. Windows 11 and serviced Windows 10 already include the Evergreen runtime. Document that a fresh offline Windows 10 without WebView2 cannot install. `offlineInstaller` would add about 127 MB and isn't proposed.
- **Acceptance, all verifiable on this host:**
  - clean install in **Windows Sandbox**, available on Windows 10 Pro;
  - upgrade over the prior version, keeping configuration;
  - uninstall removes the app, the autostart entry and the shortcut; whether configuration is kept or removed is decided explicitly and documented;
  - offline launch;
  - tray, global shortcut and widget behavior after install.
- **Windows 11:** a Hyper-V Generation 2 VM with vTPM can run on this Windows 10 Pro host. Otherwise it's recorded as unavailable.
- **CI:** add a `windows-latest` workflow mirroring the macOS one (typecheck, unit, Rust, browser, NSIS build, SHA-256). It uploads artifacts only, no publishing.

## macOS (soon)

Current state: separate ad-hoc-signed arm64/x64 `.app` and DMG from hosted CI. Gatekeeper rejects them, as expected.

- **Universal build:** `tauri build --target universal-apple-darwin` (both Rust targets installed). Inspect `lipo -archs` in CI.
- **Signing and notarization, gated on secrets:** `APPLE_CERTIFICATE` (base64 .p12), `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `KEYCHAIN_PASSWORD`, and an App Store Connect API key (`APPLE_API_ISSUER`, `APPLE_API_KEY`, `.p8` content). Until these secrets exist, steps skip and artifacts stay labelled "development, ad-hoc".
  - Secrets live only in GitHub; never in the repo, config or logs.
  - Use a temporary keychain that is deleted after the job.
- **Verification:** the existing `codesign`, `spctl` and `stapler` commands in [BUILD_AND_RELEASE.md](../../BUILD_AND_RELEASE.md). Record actual outputs; CI success alone is not acceptance.
- **Physical acceptance:** [MACOS_ACCEPTANCE.md](../../MACOS_ACCEPTANCE.md) on real hardware, including clean install, update and uninstall of the notarized DMG.

## Release workflow (both platforms)

- Trigger: a pushed `v*` tag or manual dispatch.
- Builds the Windows NSIS installer and the macOS universal DMG, then writes `SHA256SUMS`.
- Creates a **draft** GitHub release. Publishing remains a manual action by the user.
- Least-privilege permissions: `contents: write` only on the release job. Actions are pinned to reviewed commit SHAs.

## Proposed order

1. M7.0 measurement foundation (in progress).
2. Windows: metadata, CI workflow and Sandbox install/update/uninstall acceptance.
3. Mac: universal build and the secrets-gated signing/notarization workflow. It can be prepared and dry-run (ad-hoc) before enrollment.
4. Draft-release workflow.
5. Signed Mac acceptance on hardware, once credentials and a device are available.
