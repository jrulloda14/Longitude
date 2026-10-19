# Windows development and packaging — Milestone 5A

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

5B is now authorized for joint review. Build **on macOS** with Xcode command-line tools, Node 24/npm 11 and Rust 1.99.0 (the tested Windows toolchain; Mac build verification pending). The configured minimum is macOS 12.0, a deployment target rather than a tested compatibility claim. Targets are separate `aarch64-apple-darwin` and `x86_64-apple-darwin`; no universal binary is configured or claimed.

```sh
npm ci
rustup target add aarch64-apple-darwin
npm run desktop:dev
# Ad-hoc development build, without a Developer ID identity:
APPLE_SIGNING_IDENTITY=- npm run desktop:build -- --target aarch64-apple-darwin
node scripts/inspect-macos-artifacts.mjs aarch64-apple-darwin
```

Substitute `x86_64-apple-darwin` for Intel. Tauri merges `tauri.macos.conf.json` into the shared config; its complete windows array intentionally replaces the shared Windows-shaped array. Expected output is `src-tauri/target/<target>/release/bundle/macos/Longitude.app` and `bundle/dmg/*.dmg`. The inspection script archives the app with `ditto` (preserving bundle metadata), verifies the DMG structure, records hashes, actual signing/Gatekeeper output, host/architecture/toolchain and explicit `runtimeVerified: false`. Run the physical [Mac acceptance checklist](MACOS_ACCEPTANCE.md) separately. A generated DMG is not an installed, notarized or release-ready product.

`.github/workflows/macos-development.yml` prepares native Apple Silicon (`macos-15`) and Intel (`macos-15-intel`) builds. Official actions are pinned to reviewed tag commits; contents permission is read-only and checkout credentials are not retained. No signing secrets, release publishing or accounts enter the app. CI retains logs and development artifacts for 14 days. The workflow is versioned in implementation checkpoint `a8c18e9`; the user has authorized pushing source and documentation to GitHub. It runs only for manual dispatch or matching pull requests, so a push to `main` alone does not launch Mac builds. No successful workflow execution is recorded in this report. WebKit browser checks deliberately exclude the nine Edge screenshot comparisons; they do not stand in for the actual system WKWebView/native app. Use the [printable checklist](../output/pdf/Longitude-Milestone-5B-Mac-Acceptance-Checklist.pdf) to record physical Mac acceptance after obtaining an actual build.

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
