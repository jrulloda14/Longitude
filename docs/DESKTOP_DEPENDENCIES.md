# Milestones 5A/5B dependency review

## Milestone 6 additions

The original 5A/5B review below is historical. [M6 dependency review](MILESTONE_6_DEPENDENCY_REVIEW.md) records native clipboard-manager 2.5.0, dialog 2.8.3 and development-only ical.js 2.2.1 before addition. Native notice graph is now 520 dependency entries; no generic OS permission is granted to the frontend. Current audits and target exposure are in [DEPENDENCIES.md](DEPENDENCIES.md). Native clipboard/export are implemented for M6 behind the same Platform port; they are no longer deferred functionality.

Follow-up correction from actual Mac CI: `macos-transparency` selects the resolved feature but does not alone satisfy Tauri's build-script static direct-dependency allowlist. Run the official CLI to prepare the Mac manifest before direct Cargo tests. The corrected workflow does so; the original forwarding-only test instruction below is superseded. No new dependency or permission is introduced. See [current dependency audit](DEPENDENCIES.md) and [native architecture](NATIVE_ARCHITECTURE.md).

5B adds no npm package or Rust crate/version. The existing pinned Tauri dependency gains a **`macos-private-api` feature selected only by Mac configuration**, necessary to preserve the translucent widget/opacity interactions. A named application feature, `macos-transparency`, forwards to it and survives Tauri CLI's automatic rewriting of direct dependency features on Windows. The Mac config selects that feature; ordinary Windows builds do not. Direct Mac Cargo tests must pass `--features macos-transparency`. Per [Tauri's configuration reference](https://v2.tauri.app/reference/config/), transparent windows using this feature are unsuitable for Mac App Store submission. Developer ID/notarized distribution remains a separate unverified route. This is an explicit compatibility/distribution tradeoff, not an extra entitlement or a second frontend. New icon assets derive from the existing artwork. Cargo/package locks and capability manifests remain unchanged relative to the 5A source baseline.

The existing autostart plugin supports LaunchAgent on Mac by default, avoiding an AppleScript/Automation permission. Shortcut and single-instance plugins use the existing portable services; Mac target trees are retained under `evidence/milestone-5b/`. The five all-target RustSec warnings are absent from both recorded Mac target trees and the Windows tree. A fresh audit still records zero vulnerability entries/five warnings; npm remains zero production/five high inherited development advisories. Physical Mac permission, runtime and packaging checks remain open.

CI review: official GitHub `actions/checkout` v6.0.2 (`de0fac2e4500dabe0009e67214ff5f5447ce83dd`), `actions/setup-node` v6.3.0 (`53b83947a5a98c8d113130e565377fae1a50d02f`) and `actions/upload-artifact` v6.0.0 (`b7c566a772e6b6bfb58ed0dc250532a479d7789f`) were resolved from upstream tag refs before configuration. All are pinned, maintained official actions under MIT licenses, used only for checkout/toolchain/artifact retention. Permissions are read-only, checkout persistence is off, no secrets/caches or release publication is configured, and Rust installation uses the runner's rustup rather than another action. [Official checkout source](https://github.com/actions/checkout), [setup-node](https://github.com/actions/setup-node), [upload-artifact](https://github.com/actions/upload-artifact). Their runtime/network access is build infrastructure, not application behavior. This review does not claim the unrun workflow is verified or free of undisclosed defects.

Reviewed before installation October 19, 2026. Stable Tauri 2 is required; Tauri 3 prereleases are excluded. Registry metadata and upstream documentation were checked. All versions below are pinned, with resolved npm/Cargo lockfiles retained. Installation is followed by npm and RustSec audits; metadata alone is not a security clearance.

| Addition | Necessity, maintenance, license and portability |
| --- | --- |
| `@tauri-apps/api 2.12.4`, Rust `tauri 2.12.4` | Native IPC/events/window/tray shell; maintained by Tauri, recent stable release October 14. MIT OR Apache-2.0. Windows/macOS desktop support; native behavior differs and needs separate verification. |
| `@tauri-apps/cli 2.12.3` (development), `tauri-build 2.7.3` (build) | Build existing Vite frontend into the native shell, generate capabilities and package Windows artifacts. Same maintainers/licenses. No second frontend scaffold. |
| `tauri-plugin-global-shortcut 2.4.1` | Owned shortcut registration/conflict detection and cleanup; Tauri plugins workspace, October 10 release, MIT OR Apache-2.0, Windows/macOS support. Rust-only use; no frontend plugin permission. |
| `tauri-plugin-autostart 2.7.0` | Existing sign-in preference; official maintained plugin, October 1 release, MIT OR Apache-2.0, Windows/macOS support. Opt-in only. No automatic enrollment during testing. |
| `tauri-plugin-single-instance 2.5.4` | Route second launch to the existing state authority rather than creating conflicting native writers. Official plugin, October 14 release, MIT OR Apache-2.0, desktop support. |
| `serde 1.0.229`, `serde_json 1.0.154` | Typed IPC serialization and bounded storage envelopes; established maintained Rust ecosystem projects, MIT OR Apache-2.0. No timezone calculations. |
| `tempfile 3.27.0` | Same-directory unique temporary file, flush, atomic replacement and cleanup for storage commits. Maintained Stebalien project, March release, MIT OR Apache-2.0. Windows/macOS support. Atomic replacement does not alone promise physical power-loss durability; interruption tests and limitations are required. |

Use Rust standard-library file locking instead of adding another locking crate. Native commands accept fixed logical keys, never arbitrary filesystem paths. Use Tauri app directories; keep required OS differences in adapters. No general shell/filesystem, network, telemetry, notification or account plugin is needed. Existing clipboard/export runtime behavior remains Milestone 6 scope. Review all resolved transitive packages and capabilities after build; document advisories rather than forcing upgrades that redesign the frontend.

References: [Tauri commands](https://v2.tauri.app/develop/calling-rust/), [tray](https://v2.tauri.app/learn/system-tray/), [shortcuts](https://v2.tauri.app/plugin/global-shortcut/), [capabilities](https://v2.tauri.app/security/capabilities/), [Rust file locks](https://doc.rust-lang.org/std/fs/struct.File.html#method.lock), [tempfile persist](https://docs.rs/tempfile/latest/tempfile/struct.NamedTempFile.html#method.persist). macOS-specific implementation remains gated after 5A.

## Resolved security/license status

Fresh npm audits retain zero production vulnerabilities and five high development-only findings in the existing brace-pattern chain; see [BUILD_ADVISORIES.md](BUILD_ADVISORIES.md). No forced Tailwind migration was made. Native full graph: 478 package entries including Longitude; generated notices cover the 477 dependency entries, including platform/build dependencies. Notices ship as bundle resources alongside frontend notices.

Cargo-audit 0.22.2 reports zero vulnerability entries and five informational warnings in the all-target lockfile:

| Package | Warning | Exposure/remediation review |
| --- | --- | --- |
| proc-macro-error 1.0.4 | RUSTSEC-2024-0370, unmaintained | Not in the resolved Windows target tree. Track upstream replacement; do not force a transitive API-breaking override. |
| zbus_names 4.3.5 | RUSTSEC-2026-0371, unmaintained | Non-Windows D-Bus stack in the all-target graph; absent from Windows target. Review upstream replacement before adding another target. |
| zvariant 5.15.1 | RUSTSEC-2026-0370, unmaintained | Same non-Windows D-Bus exposure; track maintained upstream transition. |
| zvariant_derive 5.15.1 | RUSTSEC-2026-0372, unmaintained | Same stack; no Windows compilation/runtime path in the recorded tree. |
| glib 0.18.5 | RUSTSEC-2024-0429, unsound VariantStrIter iterator implementations | GTK-related non-Windows dependency; absent from Windows target. No Windows exploit path established. Reassess affected iterator use/upstream updates for any GTK target. |

These warnings have not been hidden or treated as vulnerability fixes. [All-target audit](evidence/milestone-5a/cargo-audit.json), [target-filtered advisory report](evidence/milestone-5a/cargo-audit-windows.json) and [resolved Windows tree](evidence/milestone-5a/windows-dependencies.txt) are retained. Advisory target filters alone do not remove irrelevant packages from a cross-platform lockfile; the actual target tree is the exposure evidence. Audits do not rule out undisclosed defects or certify macOS.

The official RustSec Windows audit tool was downloaded solely into ignored test tooling, with its published SHA-256 verified: `0a7316540862c13d954f648917ceacca593747baed6eec180fafa590be2710ab`. Tauri validated downloaded NSIS/tool DLL hashes during packaging. Neither is an application dependency. No signing identity, remote service, telemetry or generic filesystem/shell capability was added.
