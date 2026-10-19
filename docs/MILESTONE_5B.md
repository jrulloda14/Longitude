# Milestone 5B - macOS Native Integration

October 19, 2026. **Current status: build-ready on Windows and both macOS CI targets; implemented, awaiting native Mac verification. Physical-hardware acceptance and native Mac performance are Blocked.** Final build/package outcomes are recorded in the architecture table below. No physical Mac runtime, Developer ID signing/notarization or release-ready distribution claim follows from CI compilation. Stop before Milestone 6.

This report supersedes the original unrun-CI 5B delivery. The [mandatory audit](evidence/milestone-5b-followup/AUDIT.md) began at clean commit `b52dce4cb39d168ee4375b8ee020b07fb7d7338b`; existing 5A/5B code was inspected and reused. Current application/test source is `8f81408311447f24f6cf2dd13a062083a541b312` (native fixes in `658d6e9`, WebKit interaction fixes in `09ea9ef`, native widget close control in `8f81408`). Later documentation/evidence commits do not alter the implementation tested by Mac CI. The [5A report](MILESTONE_5A.md) and original evidence remain historical.

## Implementation and explicit status

| Area | Implementation status | Verification boundary |
| --- | --- | --- |
| Shared frontend, timezone/scheduling and schema | Implemented and verified | Shared unit/Windows browser checks; Mac CI is separate below. No second engine/frontend/schema |
| Mac configuration/identity/icons/minimum OS | Implemented, awaiting native verification | Native target builds/package metadata are separate from physical installation; macOS 12 is a declared minimum, not tested minimum-OS support |
| Native traffic lights/title bar, dragging, Zoom/fullscreen/restoration | Implemented, awaiting native verification | Real overlay controls, 80-point inset; browser inset tests are not AppKit hit testing |
| App menus, status item, saved groups/Now/settings | Implemented, awaiting native verification | Existing command routing/prefixed IDs/template icon reused; physical clicks/menu/Dock behavior Blocked |
| Dock reopen, second launch, hide/close/Quit | Implemented, awaiting native verification | Shared policy/Windows native tests pass; actual Mac lifecycle/flush/logoff cases Blocked |
| Floating widget, pin/opacity/focus/placement | Implemented, awaiting native verification | Independent native window/shared state/60-100% opacity; Retina, mixed displays, Spaces/fullscreen/Stage Manager Blocked |
| Filesystem storage/recovery/CAS | Implemented, awaiting native verification | Shared schema and native temporary-file tests; actual Mac app-config path/application restart/physical interruption acceptance remains Blocked |
| Shortcut validation and alias handling | Implemented and verified | Parsed-chord/policy tests and actual competing-process conflict on Windows; Mac OS registration/denial remains awaiting native verification |
| Mac global shortcut and opt-in login | Implemented, awaiting native verification | Option+Command+T default, official plugin/LaunchAgent, rollback and cleanup reused; Mac login/denial/logoff/relocation Blocked |
| Explicit/system native appearance | Implemented, awaiting native verification | New Tauri app-theme mapping; shared policy tests pass; physical appearance/Retina/IME/a11y Blocked |
| Mac CPU/memory/startup/drag performance | Blocked | No physical Mac supplied; no Windows/headless numbers substituted |
| Developer ID signing/notarization/clean distribution | Blocked | Credentials absent; no personal credentials committed; development packaging is separate |
| Native clipboard/export dialogs | Not implemented | Explicitly unchanged Milestone 6 scope; no Milestone 6 work begun |

The [authoritative checklist](MACOS_ACCEPTANCE.md) records **Blocked** and evidence for every unexecuted native area and performance item. The [PDF checklist](../output/pdf/Longitude-Milestone-5B-Mac-Acceptance-Checklist.pdf) remains a blank printable worksheet, not a completed acceptance record.

## Focused changes

1. Kept existing Mac Tauri config, identity, native controls/menus, Dock lifecycle, widget, persistence, plugins and packaging. Added the requested [native architecture entry point](NATIVE_ARCHITECTURE.md); Windows abstractions were not rewritten.
2. Applied saved explicit/system appearance to native Mac chrome through the existing Tauri API, with Mac-only preference change detection. Windows appearance behavior stays unchanged. Future read-only data still prevents native side effects.
3. Compared shortcuts by parsed chord, so Ctrl/Control aliases preserve the owned binding rather than attempting duplicate registration. Rejected bare typing keys and standard Command-only Mac application/Control+Space input-source chords before OS changes. Remaining occupied shortcuts are rejected by the OS/plugin with rollback.
4. Replaced the old alias-only Windows occupied-shortcut case with an independent native process holding a real OS registration. Added alias-equivalence and bare-typing cases. Added four exact capability/CSP guards and seven Rust policy cases; no package, plugin, schema or permission was added.
5. Ran real Mac CI. Its baseline exposed a Tauri allowlist failure: a named forwarding feature alone does not satisfy the static direct-dependency check. The workflow now uses the official CLI to prepare/build the debug target before direct Cargo tests; validation was not disabled.
6. Real Mac WebKit then exposed four failures with two interaction roots. First pointer focus now owns native caret placement so select-all survives, while subsequent clicks still allow caret editing. Planner dialogs explicitly remember their opener, and the active modal handles Tab/Escape at document level when Safari leaves body focused. Existing styling, layout, typography and clock animation are preserved; no timezone/scheduling algorithm changed.
7. Removed the compact native Mac widget's illustrative red close dot, replacing it with a neutral X in the same footprint. The main window keeps actual native traffic lights; browser design preview and Windows controls remain unchanged. Added a targeted regression (3/3 focused WebKit chrome checks pass).

## Exact Windows and shared results

| Check | Final result | Evidence |
| --- | --- | --- |
| TypeScript | Exit 0 | [Log](evidence/milestone-5b-followup/typecheck.txt) |
| Unit tests | **696 passed, 0 failed**, 11 files | [JSON](evidence/milestone-5b-followup/unit-results.json) |
| Browser/Edge | **84 passed, 0 skipped/flaky/unexpected**, one worker, no retries, **125270.769 ms** | [JSON](evidence/milestone-5b-followup/browser-results.json), [log](evidence/milestone-5b-followup/browser-tests.txt) |
| Rust and formatting | **33 passed, 0 failed/ignored/filtered**, 0.28 s execution; format exit 0 | [Log](evidence/milestone-5b-followup/rust-tests.txt) |
| Actual Windows executable/WebView2 | **29 passed, 0 failed/page exceptions** | [JSON](evidence/milestone-5b-followup/native-results.json), [log](evidence/milestone-5b-followup/native-tests.txt) |
| Production frontend | Exit 0; Vite production build **2.79 s** | [Log](evidence/milestone-5b-followup/frontend-build.txt) |
| Debug native build | Exit 0; Rust **9.50 s** | [Log](evidence/milestone-5b-followup/debug-build.txt) |
| Optimized Windows/NSIS and smoke | **Exit 0**, optimized Rust **2m 41s**, unsigned NSIS generated; **5 smoke checks passed** | [Build](evidence/milestone-5b-followup/release-build.txt), [smoke](evidence/milestone-5b-followup/release-smoke.json), [hashes/signatures](evidence/milestone-5b-followup/windows-artifacts.json) |
| Visual regression | Nine strict snapshot assertions pass; separate RGBA comparison **0 changed pixels in all nine** | [Gallery](evidence/milestone-5b-followup/visual/index.html), [comparison](evidence/milestone-5b-followup/visual/comparison.json) (declared per-channel tolerance), [baseline provenance](evidence/milestone-5b-followup/visual/provenance.json) |
| Focused Windows WebKit compatibility probe | **6 passed**; separate from actual Mac CI and native WKWebView | [Log](evidence/milestone-5b-followup/windows-webkit-targeted.txt) |

All prior timezone/DST/fractional offsets, local midnight, planning stability, direct entry/AM-PM, 1/5-minute snapping, outside-dial capture, overnight/full-duration scheduling, persistence and cross-window cases remain covered. Three new browser cases protect first-click versus later caret behavior, modal keys after body focus and the native widget close control without an HTML traffic light. Before-images reuse approved 5B after-images, not fresh pre-change captures. Style/font/assets and domain/schema implementations are preserved; generated CSS may include additional unused utilities from source scanning, so no byte-identical compiled-CSS claim is made.

One Windows attempt stopped at helper-process launch with `spawn EPERM`: [failed result](evidence/milestone-5b-followup/native-fixture-launch-failure.json), [log](evidence/milestone-5b-followup/native-fixture-launch-failure.txt). The helper now retries only that launch error up to three times using the same explicit executable/path; readiness and test assertions never retry. The final complete native run passes. The earlier pre-WebKit-fix Windows run also passed; its evidence is retained separately. Shutdown still logs WebView2 `Chrome_WidgetWin_0` unregister error 1412 with successful exit/no page exceptions; this diagnostic is disclosed rather than suppressed.

## Actual macOS builds and tests

The local host is Windows x64 with only the MSVC Rust target, no Xcode/sw_vers and no connected physical Mac. GitHub API access confirmed an active workflow; both hosted Mac runners were actually available. Hosted results are not physical-device acceptance.

| Architecture | Source/run | Unit / Rust / WebKit | Debug / optimized .app / DMG | Native hardware |
| --- | --- | --- | --- | --- |
| Apple Silicon arm64 | `8f81408`, [final run](https://github.com/jrulloda14/Longitude/actions/runs/39269770931) | **Pass: 696 / 33 / 75**, zero failures/skips/flaky; Rust 0.06 s, browser **97452.675 ms** | **Pass**: debug 1m 47s, optimized 3m 26s; .app and DMG generated/inspected | Blocked |
| Intel x86_64 | Same source/run | **Pass: 696 / 33 / 75**, zero failures/skips/flaky; Rust 0.15 s, browser **169505.112 ms** | **Pass**: debug 5m 08s, optimized 7m 06s; .app and DMG generated/inspected | Blocked |

Apple Silicon retained evidence: [unit](evidence/milestone-5b-followup/macos-arm64/unit-results.json), [Rust](evidence/milestone-5b-followup/macos-arm64/rust-tests.txt), [browser](evidence/milestone-5b-followup/macos-arm64/browser-results.json), [toolchain](evidence/milestone-5b-followup/macos-arm64/toolchain.txt), [artifact/signature metadata](evidence/milestone-5b-followup/macos-arm64/macos-artifacts.json), [job log](evidence/milestone-5b-followup/ci-final-arm64.log.txt). [Download ARM64 development artifacts](https://github.com/jrulloda14/Longitude/actions/runs/39269770931/artifacts/12194304001) (14-day CI retention; app ZIP and DMG, not a release). The downloaded artifact SHA-256 matches GitHub's recorded `79640f5d51952b37788c079341724d04912781d6f0d8ae932d0242fa7ee38213`.

Intel retained evidence: [unit](evidence/milestone-5b-followup/macos-intel/unit-results.json), [Rust](evidence/milestone-5b-followup/macos-intel/rust-tests.txt), [browser](evidence/milestone-5b-followup/macos-intel/browser-results.json), [toolchain](evidence/milestone-5b-followup/macos-intel/toolchain.txt), [artifact/signature metadata](evidence/milestone-5b-followup/macos-intel/macos-artifacts.json), [job log](evidence/milestone-5b-followup/ci-final-intel.log.txt). [Download Intel development artifacts](https://github.com/jrulloda14/Longitude/actions/runs/39269770931/artifacts/12195214569), also retained for 14 days. Downloaded artifact SHA-256 matches GitHub's `b01f34e621f340d52e7d00988f1c5b715c5549dbf338a1dad48b0340c33688e7`. [Final job status](evidence/milestone-5b-followup/ci-final-jobs.json) and [artifact index](evidence/milestone-5b-followup/ci-final-artifacts.json) pin both targets to `8f81408`. Both pass typecheck, production frontend, Rust formatting, architecture inspection and DMG checksum verification. Hosted ARM64 uses macOS 15.7.9 / Xcode 16.4 / VirtualMac2,1 (3 CPUs, 7 GiB); Intel reports Macmini6,2 (4 CPUs, 14 GiB), macOS 15.7.9 and Xcode 16.4. These hosted build environments do not supply an interactive physical-device acceptance session.

The Mac browser suite explicitly excludes the nine Edge screenshot goldens; it does not relax their threshold or pretend they are Mac visuals. Playwright WebKit is not the app's exact native system WKWebView. No native Mac smoke/input test or before/after screenshot was performed on physical hardware. Native test results must remain separate from compilation, unit tests and a packaged binary.

### Failed attempts and corrections

- [Baseline run 39264501704](https://github.com/jrulloda14/Longitude/actions/runs/39264501704), source `b52dce4`: both architectures failed the static Tauri feature allowlist before Rust tests. [ARM64 log](evidence/milestone-5b-followup/ci-baseline-arm64.log.txt), [Intel log](evidence/milestone-5b-followup/ci-baseline-intel.log.txt), [job status](evidence/milestone-5b-followup/ci-baseline-jobs.json). No native/package pass is claimed for it.
- [Run 39265526785](https://github.com/jrulloda14/Longitude/actions/runs/39265526785), source `658d6e9`: both native debug targets compiled, Rust suites passed, but each WebKit suite had **68 passed / 4 failed** (readout pointer entry and planner focus/Escape). Packaging did not run after these failures. [ARM64 log](evidence/milestone-5b-followup/ci-attempt2-arm64.log.txt), [Intel log](evidence/milestone-5b-followup/ci-attempt2-intel.log.txt), [jobs](evidence/milestone-5b-followup/ci-attempt2-jobs.json).
- [Run 39267581587](https://github.com/jrulloda14/Longitude/actions/runs/39267581587), source `09ea9ef`: ARM64 completed successfully (696 unit / 33 Rust / 74 WebKit, development app/DMG). Intel passed the same test totals but its release build was cancelled when the final-source run superseded it; no Intel package pass is claimed for that attempt. [ARM log](evidence/milestone-5b-followup/ci-attempt3-arm64.log.txt), [Intel log](evidence/milestone-5b-followup/ci-attempt3-intel.log.txt), [jobs](evidence/milestone-5b-followup/ci-attempt3-jobs.json).
- The final `8f81408` run includes the native-widget control correction and third added browser regression. Earlier failures/cancellation are retained rather than waived. Final job/artifact evidence is separate below.

## Packaging, signing and acceptance

Architecture-specific ad-hoc development `.app`/DMG packaging is configured, with actual final outcomes in the table above and per-target manifests. Artifact inspection checks Mach-O architecture, DMG structure and hashes, and records actual codesign/Gatekeeper output. Both targets' actual strict codesign verification is **Pass (exit 0)** with `adhoc,runtime` flags and no TeamIdentifier. Both Gatekeeper assessments are **Fail (rejected, exit 3)**, expected for this development identity; it is not waived or treated as trusted distribution. Requested ad-hoc signing is not Developer ID trust, notarization, stapling or release readiness. No credentials or broad entitlement were committed. No GitHub release was published. [Signing/distribution instructions](BUILD_AND_RELEASE.md) cover hardened runtime, entitlements, notarization/stapling, Gatekeeper and clean install/update/uninstall.

Mac transparency uses Tauri's documented private-API feature to preserve opacity and excludes Mac App Store submission. That tradeoff is explicit; no system security bypass was introduced. A configured macOS 12 deployment minimum and compiled architecture are not minimum-OS/physical compatibility certification. All native title-bar/menu/status/Dock, Spaces/Stage Manager, login approval/denial/relocation, IME/a11y, mixed/removed displays, actual app-config/restart and clean installation cases remain Blocked in [MACOS_ACCEPTANCE.md](MACOS_ACCEPTANCE.md).

## Native performance

**Mac hardware measurements: Blocked, not verified.** No live/planning CPU, private memory, ten-minute growth, visible-widget increment, cold/warm startup or native drag/frame number is substituted from Windows, CI browsers or unit tests. [PERFORMANCE.md](PERFORMANCE.md) records the unchanged 60-second warmup, repeated-trial requirements and provisional <=1% live CPU, <=0.25% planning CPU and <=250 MiB sampled private-memory ceilings.

Windows regression hardware remains i5-6500 @3.20 GHz/four cores, 15.90 GiB RAM, Windows 10 Pro 19045, Intel HD Graphics 530; Node 24.15.0, Rust 1.99.0, Edge/WebView2 155.0.4283.62. Resource performance was not remeasured for this follow-up. Historical 5A measured live/planning CPU **9.0599% / 1.7754%**, exceeding targets, with private peaks **213.6445 / 217.8398 MiB**. Those figures apply only to the recorded old executable and remain open, not inferred fixed. No worker or clock quality reduction was added to manufacture a pass.

## Dependencies, security and remaining issues

Fresh [production npm audit](evidence/milestone-5b-followup/npm-audit-production.json): **0**; [full npm audit](evidence/milestone-5b-followup/npm-audit-all.json): **5 high inherited development findings**. [RustSec](evidence/milestone-5b-followup/cargo-audit.json): **0 vulnerability entries**, four unmaintained and one unsoundness informational warning in the all-target graph. Target trees and exposure are recorded in [dependency review](DEPENDENCIES.md); [BUILD_ADVISORIES.md](BUILD_ADVISORIES.md) retains affected packages, exploit conditions and remediation options. No package/plugin/version/lockfile or capability changed.

The four new permission guards and real Windows denied-command cases pass. No generic filesystem/shell/network or remote-origin capability, account, server or telemetry was introduced. Files use Tauri application directories and the same validated schema. Application metadata still declares `UNLICENSED`; this task does not select a project license.

Remaining limitations include physical Mac/Windows acceptance, trusted signing/notarization/installation, untested minimum OS, existing Windows CPU budgets, uncommitted edits under forced termination, uncertain durability after a metadata-sync error and lost IPC response after a committed non-idempotent edit potentially requiring canonical reload. Geometry remains a best-effort cache rather than another durable schema. These are disclosed; no unexecuted native item is marked passed.

## Inventory, documentation and stop gate

[Exact changed-file inventory](evidence/milestone-5b-followup/modified-files.json) compares this follow-up against `b52dce4`; [verification summary](evidence/milestone-5b-followup/verification-summary.json) records final counts and source hashes. Existing approved work is preserved. Requested report, checklist, native architecture, testing, performance, dependencies and advisory documents are updated, with supporting build/readiness/README links. Historical evidence remains separate from new runs.

Milestone 6/7 approved plan text and the shared timezone/scheduling/persistence implementation remain unchanged. No forced push, release publication or signing credentials are introduced. **Stop after 5B for review. Hardware acceptance is not complete; do not start Milestone 6.**
