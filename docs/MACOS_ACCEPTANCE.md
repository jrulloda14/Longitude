# macOS physical-hardware acceptance — Milestone 5B

Status: **not executed**. A Windows host cannot supply these results. CI runs on hosted Macs/VMs do not complete this physical-device matrix. Use a normal user account with a backed-up configuration; use isolated debug configuration for destructive recovery cases. Do not modify production preferences to simulate corruption.

Record device/model, CPU architecture, RAM, macOS build, system WKWebView/Safari/WebKit version, displays/scales, toolchain, source revision, executable hash, app path and signature/notarization status. Attach screenshots/videos and exact counts. Test Apple Silicon and Intel separately; a configured target is not a verified target. Minimum macOS 12 compatibility remains provisional until tested.

| Area | Required actual checks | Current status |
| --- | --- | --- |
| Native title bar | Real traffic lights, 80-point safe inset, double-click, drag, minimize, Zoom/fullscreen, restore; no duplicated HTML lights, resize at minimum size | Unavailable |
| Application menus | About, Settings, Services, Hide/Hide Others/Show All, Edit cut/copy/paste/undo/redo/select-all, Window, Cmd+W, Cmd+Q; focused text inputs/IME | Unavailable |
| Status item | Template icon in light/dark/highlight/high contrast; primary click opens menu without toggling twice; groups, Now, Open, widget, Settings, Quit; no duplicate action dispatch | Unavailable |
| Lifecycle | Close=Hide with/without status item, close=Quit, widget close, all windows hidden, Dock reopen and second launch, Cmd+H/unhide, OS Quit, interrupted/failed flush pauses Quit, actual logoff | Unavailable |
| Shortcut | Fresh profile Option+Command+T; saved/imported shortcut unchanged; unrelated system shortcuts untouched; occupied/invalid/new bindings, permission failure, old binding rollback, cleanup on Quit | Unavailable |
| Floating widget | Pinned/unpinned property after show/reload/restart, opacity 60–100%, hide/show/expand/focus, multiple Spaces, fullscreen app/Stage Manager restrictions | Unavailable |
| Persistence | Actual Tauri app-config path, rapid writes, two-window changes, restart, CAS/locking, prepared-file interruption, recovery/backup, malformed/future schema, stale or lost responses | Unavailable |
| Appearance/display | System dark/light live changes, explicit theme override, Retina text/icons, 100/200% and mixed scaling, negative/removed monitors, safe work area, fullscreen bounds not saved as ordinary placement | Unavailable |
| Clock/domain | Same DST/fractional-offset fixtures, local midnight, manual selection immune to live updates, 1/5-minute snapping, direct entry/AM/PM/keyboard, drag captured outside dial and window | Unavailable |
| Sign-in | Opt-in LaunchAgent on/off, user denial/settings change, restart/logoff/login, app relocation; restore original preference after testing | Unavailable |
| Offline/privacy | Built app with networking disabled, no loopback dev server, no accounts/telemetry; only implemented file/shortcut/login services | Unavailable |
| Distribution | Actual per-architecture .app/DMG, signature/hardened-runtime/entitlements, notarization/stapling/Gatekeeper, clean install/update/uninstall | Unavailable |

Measure each architecture/device separately: 60-second warmup, live/planning CPU, aggregate private memory with ten-minute growth and visible-widget increment, drag/frame/Long Task observations and cold/warm startup. Preserve provisional budgets (live CPU ≤1%, planning ≤0.25%, sampled private memory ≤250 MiB). The Windows 5A CPU failures remain open; no Mac result can be inferred from them. System WKWebView cannot use Windows WebView2/CDP harness assumptions. Use native input/inspection and test records; Playwright WebKit is a separate browser engine test, not this app's actual webview.

If any check fails, record the trigger, expected/actual behavior, raw evidence and remediation. Do not mark 5B runtime acceptance complete, sign/publish a release or proceed to Milestone 6 based solely on compilation or mocked policy tests.
