# Building and releasing Longitude

## Publishing a release

1. Update the version in `package.json`, `package-lock.json` (root entry), `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`, and add a section to `CHANGELOG.md`.
2. Commit, push `main` and wait for **Windows CI** to pass.
3. Tag and push: `git tag v0.1.0 && git push origin v0.1.0`.
4. The **Release (draft)** workflow checks that the tag matches every version field, builds the Windows NSIS installer and the macOS universal DMG (ad-hoc signed), and attaches both plus `SHA256SUMS.txt` to a **draft** release. The notes come from `.github/release-notes.md`.
5. Review the draft on GitHub, ideally installing both files on real machines, then click **Publish release**. Nothing is published automatically.

A release on a private repository is only downloadable by people with access to it. Make the repository public before announcing downloads. Signing stays off until credentials exist: Windows remains unsigned, and macOS needs a Developer ID certificate plus notarization (see the signing section below).

## Engineering history: Windows development and packaging — Milestone 5A

## Milestone 6 local sharing and development verification

The existing build commands now include native text clipboard and user-selected calendar Save services. They add no installer, updater, release publishing or signing credential. [ICS_EXPORT.md](ICS_EXPORT.md) specifies both platform adapters, atomic destination replacement, input limits and cancellation/error semantics. A browser preview initiates a local Blob download; the desktop uses a real OS Save dialog. No general frontend filesystem or clipboard-read permission is needed.

For actual Windows sharing verification, build the debug executable, then run `node scripts/verify-native-sharing.mjs`. It uses the established isolated `LONGITUDE_TEST_ROOT` and awaits actual native Cancel/Save actions. Debug picker tests start in that test root; the initial-directory override is absent in release builds and never bypasses a user Save/Cancel action. The file is independently parsed and compared with the preview. All native harnesses use the same debug port, so run them sequentially. The [M6 report](MILESTONE_6.md) distinguishes final Windows checks, Mac CI and unexecuted physical Mac cases. Milestone 7 remains unstarted.

Requires Node 24/npm 11, stable Rust >=1.90 targeting `x86_64-pc-windows-msvc`, Visual Studio C++ build tools/Windows SDK and installed WebView2. Use the existing repository root, not the empty `longitude-ui` folder.

```powershell
npm ci
npm run desktop:dev
npm run desktop:test
npm run desktop:build
```

`desktop:dev` starts the existing Vite server on loopback port 5173 and builds the Tauri shell; stop a conflicting preview server before starting it. `desktop:build` typechecks/builds the frontend, generates JavaScript/native dependency notices, performs the locked Rust release build and creates the configured Windows NSIS package. Shared config is in `src-tauri/tauri.conf.json`, Windows overrides in `tauri.windows.conf.json`, capability manifests in `capabilities/`. Keep Cargo.lock and package-lock.json committed. No local server is required by the built executable.

Expected artifacts are `src-tauri/target/release/longitude.exe` and `src-tauri/target/release/bundle/nsis/Longitude_0.1.0_x64-setup.exe`. Inspect the milestone report for which artifacts were actually generated/tested and their checksums. The NSIS configuration installs for the current user. It may download Microsoft's WebView2 bootstrapper if the runtime is absent; therefore installation on a fresh offline machine without WebView2 is not certified offline. An already installed runtime permits local application operation.

No publisher/signing credentials are configured. Development artifacts are unsigned unless signature verification explicitly reports otherwise. Expect normal Windows trust warnings for an unknown publisher; do not disable or bypass system security. Native runtime tests do not substitute for clean install/update/uninstall, Windows 11, accessibility, mixed-DPI or installer certification. Milestone 7 retains its Windows distribution gate.

Automated native integration:

```powershell
npm exec tauri build -- --debug --no-bundle
node scripts/test-native.mjs
```

The native harness runs the actual debug executable/WebView2 with isolated files under ignored `performance-results/` and a loopback debug endpoint on 9224. Do not run another native instance/debug endpoint concurrently. It queries native state/window properties and drives frontend controls; physical input/tray/monitor checks remain separately identified. Debug test-root overrides are excluded from release builds. Native Rust tests use temporary directories; interrupted-file tests are not hardware power-loss tests.

## macOS development builds — Milestone 5B

Verification follow-up: the first actual Mac CI run failed before Rust tests because Tauri's build-script allowlist checks the direct dependency feature list. A named feature forwarding to `tauri/macos-private-api` alone is insufficient on a fresh Mac checkout. Use the official CLI to prepare/build the debug target before running Cargo tests directly:

```sh
npm ci
npm exec tauri build -- --debug --no-bundle --target aarch64-apple-darwin
cargo test --manifest-path src-tauri/Cargo.toml --locked --target aarch64-apple-darwin --features macos-transparency
```

The workflow now includes this prerequisite. Do not disable the allowlist or add broad permissions to work around it. The [current 5B report](MILESTONE_5B.md) records actual architecture/run/artifact results; the original delivery had not run CI, but this follow-up executes both hosted targets. Physical Mac acceptance remains separate.

5B is now authorized for joint review. Build **on macOS** with Xcode command-line tools, Node 24/npm 11 and Rust 1.99.0 (used by Windows and hosted Mac checks). The configured minimum is macOS 12.0, a deployment target rather than a tested compatibility claim. Targets are separate `aarch64-apple-darwin` and `x86_64-apple-darwin`; no universal binary is configured or claimed.

```sh
npm ci
rustup target add aarch64-apple-darwin
npm run desktop:dev
# Ad-hoc development build, without a Developer ID identity:
APPLE_SIGNING_IDENTITY=- npm run desktop:build -- --target aarch64-apple-darwin
node scripts/inspect-macos-artifacts.mjs aarch64-apple-darwin
```

Substitute `x86_64-apple-darwin` for Intel. Tauri merges `tauri.macos.conf.json` into the shared config; its complete windows array intentionally replaces the shared Windows-shaped array. Expected output is `src-tauri/target/<target>/release/bundle/macos/Longitude.app` and `bundle/dmg/*.dmg`. The inspection script archives the app with `ditto` (preserving bundle metadata), verifies the DMG structure, records hashes, actual signing/Gatekeeper output, host/architecture/toolchain and explicit `runtimeVerified: false`. Run the physical [Mac acceptance checklist](MACOS_ACCEPTANCE.md) separately. A generated DMG is not an installed, notarized or release-ready product.

`.github/workflows/macos-development.yml` prepares native Apple Silicon (`macos-15`) and Intel (`macos-15-intel`) builds. Official actions are pinned to reviewed tag commits; contents permission is read-only and checkout credentials are not retained. No signing secrets, release publishing or accounts enter the app. CI retains logs and development artifacts for 14 days. The workflow is versioned in implementation checkpoint `a8c18e9`; the user has authorized pushing source and documentation to GitHub. It runs only for manual dispatch or matching pull requests, so a push to `main` alone does not launch Mac builds. Actual final-source job outcomes and downloadable development artifacts are linked from [MILESTONE_5B.md](MILESTONE_5B.md). WebKit browser checks deliberately exclude the nine Edge screenshot comparisons; they do not stand in for the actual system WKWebView/native app. Use the [printable checklist](../output/pdf/Longitude-Milestone-5B-Mac-Acceptance-Checklist.pdf) as a blank worksheet; keep the authoritative Markdown checklist updated during physical Mac acceptance.

### Signing, notarization and security

Transparent Mac widgets enable Tauri's **macos-private-api** feature only on the Mac target and set `macOSPrivateApi` in the Mac override. Tauri documents that this excludes Mac App Store acceptance. Developer ID distribution is the intended future route, subject to actual signing/notarization review; no App Store eligibility is claimed. There are no new dependencies or generic IPC permissions. Native entitlements are not broadened: no camera, microphone, location, Apple Events, accessibility automation, key capture or sandbox exceptions are requested. Global hotkey registration uses the existing official plugin, not a keyboard-event monitor. Permission/conflict failures must be shown and leave the previous owned shortcut intact. This still requires actual Mac denial/conflict testing.

The app uses Rust plus system WKWebView, not a bundled Node/JIT runtime. No speculative `allow-jit`, unsigned-executable-memory or disabled-library-validation entitlement is added. `hardenedRuntime` is enabled. The current build is not sandboxed; the versioned configuration is confined by fixed commands to Tauri's application configuration directory. Launch-at-sign-in remains opt-in and uses the plugin's default LaunchAgent (not AppleScript automation). macOS login-item approval/relocation, OS permission denial and logoff remain acceptance checks. Notifications are outside this phase; no notification permission/plugin is introduced.

For distributable builds, obtain an Apple Developer membership, Developer ID Application certificate/private key and appropriate notarization credentials. Import the identity into an isolated build keychain; supply signing/notarization credentials as CI secrets without committing them or printing them in logs. Replace the development `APPLE_SIGNING_IDENTITY=-` setting with the verified identity. Tauri supports Apple ID/app-specific-password/team credentials or App Store Connect API credentials; follow its current official guide when configuring them. Do not place secrets in config files. Preserve hardened runtime, review actual signed entitlements, verify embedded code, submit/notarize the distribution artifact, staple its ticket and verify on a clean Mac.

```sh
codesign --verify --deep --strict --verbose=2 Longitude.app
codesign --display --entitlements :- Longitude.app
spctl --assess --type execute --verbose=4 Longitude.app
xcrun stapler validate Longitude.app
# After notarization/stapling the DMG:
xcrun stapler validate Longitude.dmg
spctl --assess --type open --context context:primary-signature -v Longitude.dmg
```

These are future acceptance commands, not recorded successes. Ad-hoc/unsigned development packages have no trusted Developer ID or notarization ticket; Gatekeeper may reject them. Do not disable Gatekeeper or remove quarantine to manufacture a pass. Clean install/update/uninstall, signature/notarization, minimum-OS, architecture, offline operation and physical-hardware runtime results must be recorded separately. See [Tauri bundle guidance](https://v2.tauri.app/distribute/macos-application-bundle/), [signing guidance](https://v2.tauri.app/distribute/sign/macos/), [configuration restrictions](https://v2.tauri.app/reference/config/) and [GitHub runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners). Milestones 6 and 7 remain unchanged.

### Clean installation and manual update acceptance

The following is a procedure to execute on a test Mac, not a completed installation result. There is no automatic updater or update service in 5B.

1. Use the matching architecture and a separately verified, trusted distribution artifact. Record its hash, signature, notarization and Gatekeeper outcome. Mount the DMG, copy Longitude.app into Applications, eject the image and launch that installed copy. The current ad-hoc CI packages do not satisfy the trusted-distribution prerequisite.
2. On a clean test profile, confirm defaults and that launch at login remains off. Save groups/preferences, quit normally through the flush barrier, reopen and record the actual Tauri `app_config_dir` and retained files. Do not infer that path from a Windows location or create another schema.
3. Before updating, quit both windows normally and back up the entire existing app-config directory. Replace the application bundle while preserving `app.longitude.desktop` and the configuration files. Verify labels/groups/schedules, native preferences, recovery and future-schema protection after relaunch. Test login-item relocation separately; do not silently enable or repair opt-in registration. Downgrade compatibility is not promised for unsupported future schemas.
4. Before uninstalling, explicitly disable launch at login and quit. Removing the application bundle does not implement a user-data purge; retained configuration/backups need a separate, explicit user choice. Verify no orphaned process/login item remains. Record install/update/uninstall outcomes in [MACOS_ACCEPTANCE.md](MACOS_ACCEPTANCE.md); all remain Blocked until executed.
