# macOS physical-hardware acceptance - Milestone 5B

**Overall physical-hardware acceptance: Blocked.** No physical test Mac is available in this Windows task. All twelve native acceptance outcomes below are unexecuted; none is Pass. CI builds/Rust filesystem tests and shared/Windows results provide separate evidence and cannot complete this matrix. The current [5B report](MILESTONE_5B.md) records actual CI results, including failed attempts.

Use this file as the authoritative status record. The [printable three-page checklist](../output/pdf/Longitude-Milestone-5B-Mac-Acceptance-Checklist.pdf) is a blank worksheet, not a completed test record or current CI status report. Back up user data and use isolated debug configuration for destructive recovery checks.

## Device and test record

- Tester/date and exact source revision/executable SHA-256: not supplied.
- Device/model, CPU architecture/RAM and macOS build: not supplied.
- Native system WKWebView/Safari-WebKit version, displays/scales and toolchain: not supplied.
- App path, actual signature/notarization/Gatekeeper status and evidence: not supplied.

Test Apple Silicon and Intel separately. macOS 12.0 is a declared deployment minimum, not verified minimum-OS compatibility. Record Pass, Fail or Blocked for each executed case; include trigger, expected/actual behavior, evidence and remediation. Retain previous failed evidence when rerunning.

## Authoritative native matrix

Each implementation is **Implemented, awaiting native verification**. Outcome remains **Blocked** because the actual physical-device case has not run. The cited shared/Windows tests do not change that native outcome.

| Area | Required actual checks | Outcome | Evidence / blocker |
| --- | --- | --- | --- |
| Native title bar | Real traffic lights, 80-point safe inset, double-click, drag, minimize, Zoom/fullscreen, restore; no duplicated HTML lights, resize at minimum size | Blocked | [Mac config](../src-tauri/tauri.macos.conf.json), [chrome browser tests](evidence/milestone-5b-followup/browser-results.json). Physical Mac case not executed. |
| Application menus | About, Settings, Services, Hide/Hide Others/Show All, Edit cut/copy/paste/undo/redo/select-all, Window, Cmd+W, Cmd+Q; focused text inputs/IME | Blocked | [Native menus](../src-tauri/src/macos.rs), [architecture](NATIVE_ARCHITECTURE.md). Physical Mac case not executed. |
| Status item | Template icon in light/dark/highlight/high contrast; primary click opens menu without toggling twice; groups, Now, Open, widget, Settings, Quit; no duplicate action dispatch | Blocked | [Status/menu dispatch](../src-tauri/src/main.rs), [template icon](../src-tauri/src/macos.rs). Physical Mac case not executed. |
| Lifecycle | Close=Hide with/without status item, close=Quit, widget close, all windows hidden, Dock reopen and second launch, Cmd+H/unhide, OS Quit, interrupted/failed flush pauses Quit, actual logoff | Blocked | [Lifecycle policy](../src-tauri/src/lifecycle.rs), [Windows native checks](evidence/milestone-5b-followup/native-results.json). Physical Mac case not executed. |
| Shortcut | Fresh profile Option+Command+T; saved/imported shortcut unchanged; unrelated system shortcuts untouched; occupied/invalid/new bindings, permission failure, old binding rollback, cleanup on Quit | Blocked | [Shortcut policy](../src-tauri/src/shortcuts.rs), [Rust tests](evidence/milestone-5b-followup/rust-tests.txt), [real Windows conflict](evidence/milestone-5b-followup/native-results.json). Physical Mac case not executed. |
| Floating widget | Pinned/unpinned property after show/reload/restart, opacity 60–100%, hide/show/expand/focus, multiple Spaces, fullscreen app/Stage Manager restrictions | Blocked | [Widget host](../src-tauri/src/main.rs), [Windows native checks](evidence/milestone-5b-followup/native-results.json). Physical Mac case not executed. |
| Persistence | Actual Tauri app-config path, rapid writes, two-window changes, restart, CAS/locking, prepared-file interruption, recovery/backup, malformed/future schema, stale or lost responses | Blocked | [Shared storage](../src-tauri/src/storage.rs), [Rust tests](evidence/milestone-5b-followup/rust-tests.txt), [CI results](MILESTONE_5B.md). Physical Mac case not executed. |
| Appearance/display | System dark/light live changes, explicit theme override, Retina text/icons, 100/200% and mixed scaling, negative/removed monitors, safe work area, fullscreen bounds not saved as ordinary placement | Blocked | [Native appearance](../src-tauri/src/macos.rs), [placement](../src-tauri/src/placement.rs), [Rust tests](evidence/milestone-5b-followup/rust-tests.txt). Physical Mac case not executed. |
| Clock/domain | Same DST/fractional-offset fixtures, local midnight, manual selection immune to live updates, 1/5-minute snapping, direct entry/AM/PM/keyboard, drag captured outside dial and window | Blocked | [Shared regressions](evidence/milestone-5b-followup/unit-results.json), [browser interaction results](evidence/milestone-5b-followup/browser-results.json). Physical Mac case not executed. |
| Sign-in | Opt-in LaunchAgent on/off, user denial/settings change, restart/logoff/login, app relocation; restore original preference after testing | Blocked | [Official plugin host integration](../src-tauri/src/main.rs), [Windows registration/restoration checks](evidence/milestone-5b-followup/native-results.json). Physical Mac case not executed. |
| Offline/privacy | Built app with networking disabled, no loopback dev server, no accounts/telemetry; only implemented file/shortcut/login services | Blocked | [Capabilities](../src-tauri/capabilities/desktop.json), [permission tests](../src/desktop/capabilities.test.ts), [Windows offline checks](evidence/milestone-5b-followup/native-results.json). Physical Mac case not executed. |
| Distribution | Actual per-architecture .app/DMG, signature/hardened-runtime/entitlements, notarization/stapling/Gatekeeper, clean install/update/uninstall | Blocked | [Mac config](../src-tauri/tauri.macos.conf.json), [build/signing instructions](BUILD_AND_RELEASE.md), [actual per-target CI status](MILESTONE_5B.md). Physical Mac case not executed. |

## Native performance

All measurements below are **Blocked - not measured**. Use a 60-second warmup and controlled repeated trials on each physical device/architecture; keep builds and regression suites stopped during trials. Record raw native process-tree samples, host, source/hash, intervals and measurement definitions.

| Measurement | Provisional target / required record | Outcome |
| --- | --- | --- |
| Live CPU | <=1% total machine | Blocked |
| Planning CPU | <=0.25% total machine | Blocked |
| Aggregate private memory | Sampled peak <=250 MiB | Blocked |
| Ten-minute growth | Sample series and growth | Blocked |
| Visible-widget increment | Matched hidden/visible widget workloads | Blocked |
| Cold / warm startup | Explicit launch definition and repeated trials | Blocked |
| Drag / frame response | Native input, outside-dial/window capture, frame/Long Task observations | Blocked |

[Performance provenance and Windows failures](PERFORMANCE.md) remain separate. Neither Windows nor headless/hosted-browser observations substitute for Mac native metrics. System WKWebView is not the exact Playwright WebKit test browser. Do not sacrifice clock responsiveness or visual quality to manufacture a pass.

## Review gate

Reviewer/date/decision: **not supplied**. Open defects and blocked cases remain listed in [MILESTONE_5B.md](MILESTONE_5B.md). Do not mark hardware acceptance complete from compilation, a generated DMG, policy mocks or this checklist's existence. Signing/notarization, clean installation and physical input/display/lifecycle acceptance are separate requirements. Do not begin Milestone 6 until explicitly approved.

## Milestone 6 sharing follow-up

M6 is approved; the current stop gate is before M7. The original twelve physical 5B areas above remain Blocked. These additional M6 outcomes are also **Implemented, awaiting native verification / Blocked**; Windows UI tests and Mac CI do not complete them.

| Physical Mac case | Outcome | Evidence / next check |
| --- | --- | --- |
| Four copy modes, Unicode and OS pasteboard errors/denial | Blocked | Shared adapter/unit checks and actual Windows clipboard in [M6 report](MILESTONE_6.md); test real Mac pasteboard |
| Save panel, cancel, TCC denial, existing destination and filesystem errors | Blocked | Shared Rust temporary-file checks and actual Windows picker; execute native Mac panel and verify selected bytes |
| Focus/keyboard/IME and Quit while Save is active | Blocked | Windows guard/cancel/quit checks; physical AppKit/WKWebView behavior not executed |
| Manual Apple Calendar import and reference-wall recurrence display | Blocked | Independently parsed UTC ICS; manual client import not performed |

Record device/source/artifact hashes and actual outcomes before approving native acceptance. No account or external calendar integration is required or implemented.
