# Milestone 5A — Windows Desktop Integration

October 19, 2026 (Asia/Singapore). **Windows implementation is available for review. Automated checks pass; the manual acceptance items below remain open. Stop before Milestone 5B.** No macOS functionality, build or runtime verification is claimed. Milestones 6 and 7 retain their approved text/scope.

## Delivered changes

The Tauri 2 Windows shell embeds the existing Claude Design frontend. Main and compact widget are independent native windows using the same React components and one canonical planning state. Existing typography, styling, animations, timezone/scheduling engines and browser behavior are preserved. Native chrome uses the actual platform, while the browser retains its design preview.

A Rust authority serializes revisioned, validated state transactions. The existing TypeScript reducer provides immediate optimistic interaction; conflicts rebase pending actions, stale snapshots are ignored and acknowledgements do not echo. Group/participant creation uses stable queued IDs. Failed transactions retain pending changes with Retry/Discard. Reloaded WebViews rehydrate canonical state. Durable writes use the shared schema, fixed app-config paths, file locks, synced temporary files and atomic compare-and-swap replacement with retained backups/recovery. Future schemas and external edits are protected.

Native integration includes minimize/maximize/close, monitor-aware placement, widget show/hide/expand/pin/opacity, tray Open/widget/Now/Settings/groups/Quit actions, configurable owned shortcuts with conflict rollback, and opt-in sign-in preference. Close follows explicit Hide/Quit behavior; hiding requires a tray icon. A second launch restores the existing main window. Quit waits for generation-tagged client flushes, pausing on failures rather than silently discarding pending edits. Hidden windows pause clock ticks. A widget preview timeout cannot reset a newer main-window planning selection.

New controls are limited to functional native settings: shortcut editing, close behavior and the existing sign-in row. Browser screenshots remain unchanged. No server, account, telemetry, synchronization, notification plugin or generic JavaScript filesystem/shell access was added.

See [desktop architecture](DESKTOP_ARCHITECTURE.md), [persistence schema](PERSISTENCE.md), [build instructions](BUILD_AND_RELEASE.md) and [dependency/capability review](DESKTOP_DEPENDENCIES.md).

## Exact test/build results

| Check | Final result |
| --- | --- |
| Strict TypeScript | `npm run typecheck`: exit 0. Also enforced by the desktop frontend build. |
| Unit/shared regressions | **689 passed**, zero failed/pending, nine files, reported **4.93 s**. [Raw JSON](evidence/milestone-5a/unit-results.json). |
| Browser regressions | **79 passed**, zero skipped/flaky/unexpected, **140522.304 ms**, one worker, no retries, installed Edge. [Raw JSON](evidence/milestone-5a/browser-results.json). |
| Rust tests | **21 passed**, zero failed/ignored/filtered, **0.06 s** test execution. [Log](evidence/milestone-5a/rust-tests.txt). |
| Rust compile/format | Locked `cargo check` exit 0; `cargo fmt --check` exit 0. [Check log](evidence/milestone-5a/rust-check.txt). |
| Real Windows executable/WebView2 | **27 passed**, zero failed/page exceptions. Cumulative individual check durations **29291.9248 ms**; this excludes initial harness setup. [JSON](evidence/milestone-5a/native-results.json), [log](evidence/milestone-5a/native-tests.txt). |
| Final optimized executable smoke | **5 passed**, zero failed; launch, shared planning state, independent widget show/hide and clean flush/Quit. Recorded SHA-256 matches the final executable. [JSON](evidence/milestone-5a/release-smoke.json). |
| Windows global keyboard input | Ctrl+Alt+T showed and then hid the release widget, leaving main visible, verified through native properties. Two additional checks on the recorded pre-hardening release, separate from the native suite. [Evidence](evidence/milestone-5a/windows-input.json). |
| Debug desktop build | Exit 0; actual `longitude.exe` generated; Rust build **12.40 s**. [Log](evidence/milestone-5a/debug-build.txt). |
| Release desktop build/package | Exit 0; optimized incremental Rust build **3m 46s**, x64 NSIS package generated. Initial cold native release build took **10m 03s**. [Log](evidence/milestone-5a/release-build.txt). |
| Preserved design export pipeline | `npm run build:prototype`: exit 0; CSS **812 ms**, reported JS 319K/CSS 20K. Existing stale Browserslist notice remains. |
| Visual comparison | All nine strict screenshot assertions pass with zero permitted differing pixels. Separate RGBA comparison: **zero changed pixels in all nine**. [Gallery](evidence/milestone-5a/visual/index.html). |
| Security | npm production **0** vulnerabilities, full npm **5 high development-only**; Cargo-audit **0 vulnerability entries plus 5 informational warnings** in all-target graph. See dependency section. |

Unit breakdown: timezone foundation 516, exact scheduling/reference comparisons 73, persistence/recovery 41, native state bridge 13, time axis 19, original time tests 5, worker 7, domain boundaries 11, web storage 4. Original overnight attribution/full-duration fixes, DST/fractional offsets, pointer capture outside the dial, keyboard/direct entry and persistence regressions continue passing.

Rust tests exercise the shared TypeScript state fixture, full-state validation, stale revisions, durable backup/recovery, external edits, read-only future data, failed storage without revision advance, session/durable separation, late subscribers, negative/removed displays, fractional-scale minimums, real filesystem restart/CAS, path restrictions, concurrent writers, interrupted prepared files and visibly failing lock contention.

The native harness uses actual built assets and Rust commands, isolated app-config/WebView profiles and real window properties. It verifies network-offline reload/IPC, caption controls, visibility independence, stable geometry through show/restart, shared planning selection, widget preview ownership, pin/opacity, preferences, immediate reload, invalid/occupied shortcut rollback/rebinding, capability denial, close/reopen, quit flush, process restart, single-instance launch, corrupted-head recovery and future-version protection. It does not pretend that CDP frontend input is physical mouse/monitor or tray hit-testing certification.

## Native and visual evidence

The nine before-images reuse the approved Milestone 4 after-images; they are not described as fresh pre-change screenshots. Final comparison uses matching fixed instants, Edge, viewports, fonts and disabled screenshot animation. No goldens were replaced to hide changes. Source style/font/token files and timezone/scheduling engines remain preserved; native-only settings additions are outside the browser baseline.

Actual Windows WebView captures were inspected: [clock](evidence/milestone-5a/visual/native/clock.png), [widget](evidence/milestone-5a/visual/native/widget.png), [native settings](evidence/milestone-5a/visual/native/settings.png). These supplement the [browser gallery](evidence/milestone-5a/visual/index.html); they are not an exhaustive native theme/DPI matrix.

Integration testing found and fixed startup IPC before service registration, repeated outer/content-size growth, restart height drift, unstable optimistic IDs and an old widget timeout resetting a newer main selection. The native harness checks these behaviors. A Windows command-spawn failure led to direct Node entry points in the desktop frontend preparation script. Native tests reject stale Rust executables instead of accidentally testing an older binary. An initial restart harness timeout was increased to allow actual WebView startup under build load; final assertions were not retried or waived.

## Performance and hardware

Measurement provenance: the raw file identifies the measured executable SHA-256. Final hardening rejects read-only durable transactions before OS preference side effects, limits configuration calls to relevant fields and reapplies saved widget pinning on connection/show. Final artifact hashes are separate; clock/rendering/idle paths are unchanged, but that final build did not repeat the full resource trial. The earlier measurement is not a byte-identical final-artifact benchmark.

The release resource trial uses the actual Windows executable/WebView2, a visible four-location main window and a created hidden widget, **60-second warmup** and **120-second nominal live/planning intervals**. No builds/test suites run during the trial. Process CPU retains observed exited-process peaks; memory is sampled aggregate private bytes/working sets. Main-thread frame proxies are not input-to-photon latency. Raw results and hardware: [native performance](evidence/milestone-5a/native-performance.json). The measured summary is recorded in [PERFORMANCE.md](PERFORMANCE.md).

| Release measurement | Live | Planning |
| --- | --- | --- |
| Actual sampled interval | 128.4423 s | 123.4283 s |
| CPU, total machine | **9.0599%** | **1.7754%** |
| Sampled peak private memory | **213.6445 MiB** | **217.8398 MiB** |
| Main renderer task time | **23.5675 ms/s** | **7.8152 ms/s** |
| Process set | Stable, eight processes | Stable, eight processes |

Both **CPU targets fail on this trial** (live ≤1%, planning ≤0.25%); no budget was relaxed. Native resource profiling/optimization remains an open issue for the existing Milestone 7 scope. Private memory was below the 250 MiB ceiling in this workload, but a ten-minute growth trial and separate visible-widget increment were not performed. Do not turn this sample into a blanket memory certification.

Native dragging: 120 moves, **59/59 outside moves captured**, event→frame p95 **2.5 ms**, observed commit/frame proxy p95 **25.4 ms**, frame interval p95 **16.9 ms** / maximum **17.0 ms**, **zero main-thread Long Tasks**. These are within the provisional frame budgets for this workload. Observed mount was **1536.25 ms** (not a cold-start benchmark). The trial ran on a shared development desktop; a brief image-comparison process/document work also ran, so host contention and the single-run method remain limitations. No concurrent compiler or regression suite ran.

Hardware: Intel Core i5-6500 @ 3.20 GHz, four cores/threads; **17,067,753,472 bytes RAM (15.90 GiB)**; MSI MS-7A70; Windows 10 Pro 19045; Intel HD Graphics 530 driver 31.0.101.2111. Node 24.15.0, Rust 1.99.0, Edge/WebView2 155.0.4283.62. No Windows 11, mixed-monitor or macOS performance result is claimed. An initial resource run could not launch its sampler (`spawn EPERM`); the sampler now uses the explicit system PowerShell path with bounded retries. Only a completed run is treated as measurement evidence.

## Dependencies, security and capabilities

Before installation, reviewed necessity, maintenance, security, licenses and Windows/macOS support for pinned stable Tauri 2 API/CLI/Rust/build crates, official shortcut/autostart/single-instance plugins, serde/serde_json and tempfile. No Tauri 3 prerelease or extra timezone library was selected. Direct metadata and upstream references are retained in [DESKTOP_DEPENDENCIES.md](DESKTOP_DEPENDENCIES.md). Native services use portable Tauri/plugin interfaces and Rust standard file locking; Windows-specific command/NSIS settings are isolated in its configuration override.

Main/widget receive only fixed state/window commands and event-listening/drag capability. Only main can hydrate raw storage; those commits are rejected after authority initialization. There are no general frontend filesystem, shell, network, autostart or shortcut plugin permissions. Production CSP limits scripts/assets/IPC to local origins. Signing credentials and publisher identity were not invented.

Fresh npm [production](evidence/milestone-5a/npm-audit-production.json)/[full](evidence/milestone-5a/npm-audit-all.json) reports remain zero / five high in the pre-existing braces/micromatch/chokidar/fast-glob/Tailwind development chain. Exploit conditions and remediation options remain in [BUILD_ADVISORIES.md](BUILD_ADVISORIES.md).

The all-target [RustSec report](evidence/milestone-5a/cargo-audit.json) has zero vulnerability entries, four unmaintained-package warnings (proc-macro-error, zbus_names, zvariant, zvariant_derive) and one glib iterator unsoundness warning. All five are absent from the recorded [Windows target tree](evidence/milestone-5a/windows-dependencies.txt). Warnings are disclosed, not suppressed or called fixes; reassess upstream dependencies before other targets. Frontend/native notices ship with the bundle; generated native notices cover all 477 resolved dependency entries including platform/build packages. Audits do not rule out undisclosed defects.

## Artifacts and packaging status

- `src-tauri/target/release/longitude.exe`: **9,040,384 bytes**, unsigned development executable.
- `src-tauri/target/release/bundle/nsis/Longitude_0.1.0_x64-setup.exe`: generated x64 current-user development installer, **2,354,057 bytes**, approximately **2.25 MiB**. Hashes and signature status are in the [artifact manifest](evidence/milestone-5a/artifacts.json).

The executable was launched and measured; the NSIS artifact was generated and signature-inspected, not clean-install/uninstall certified. No publication, upload, signing or release claim follows from package generation. A missing WebView2 runtime may require the installer to download Microsoft's bootstrapper; fresh offline installation without that runtime is not certified. Application assets/IPC operate offline with an installed runtime.

## Modified files and documentation

[File inventory](evidence/milestone-5a/modified-files.json) distinguishes source changes against the saved pre-5A snapshot from the overall working tree, which already contained uncommitted Milestone 4 work. That approved source was preserved in an ignored local baseline archive; existing work was not reset.

Primary additions: `src-tauri/` manifest/lock/config/capabilities/icons, portable authority/storage/placement and native tests; `src/desktop/` platform/state bridge/provider and tests; native test/performance/build/notices scripts. Shared edits: App/store/platform/entry, schema additive native preferences, existing CompactWidget/SettingsPanel, package/lock/build scripts, browser evidence routing and documentation. No separate frontend or domain engine rewrite. Desktop architecture, build/release, dependency review, persistence, testing, performance, readiness, plan/audit/README and this report provide current status.

## Open acceptance items and limitations

- Physical tray icon/menu hit testing (including all group/Now/Settings/Quit entries), caption dragging/outside-window mouse capture, desktop opacity compositing and actual sign-in/logoff launch still need manual Windows acceptance. Sign-in registration enable/disable and restoration are verified, alongside shortcut key injection and native API/frontend tests.
- The computer-use helper read the native accessibility tree and sent keyboard input, but its graphics capture timed out and coordinate geometry was unavailable. Native WebView screenshots and CDP controls do not erase that limitation.
- Real removed/negative-coordinate monitors and 125/150/200% mixed-DPI scenarios remain unverified hardware checks; portable placement tests cover the arithmetic. Tested display scale is 100%. Windows 11 and full accessibility/IME/high-contrast certification remain open.
- Native storage tests cover atomic API/interruption/restart behavior, not a physical power-cut experiment. A kill can lose frontend edits not yet committed. Browser-profile data does not automatically import into native files; local data remains unencrypted. External file edits require restart/reconciliation, not silent merge.
- A lost IPC response after a committed non-idempotent action may require reloading canonical state rather than replaying pending edits; schema validation prevents duplicate IDs from silently entering storage. This does not affect the passing rapid-update/conflict cases but remains a transport-failure limitation.
- Debug WebView2 runs with CDP emitted `Chrome_WidgetWin_0` unregister error 1412 during shutdown. Tests exited successfully with no page exceptions; this upstream/runtime diagnostic remains noted rather than hidden.
- Release idle CPU exceeds both provisional budgets despite a stable process set and full warmup. Memory/frame observations do not offset that open performance issue; ten-minute growth and separate visible-widget resource checks remain unverified.
- Unsigned installer clean install/update/uninstall, signing/publisher trust and distribution certification remain Milestone 7 gates. No macOS functionality/artifact/CI or runtime result exists; 5B still requires approval and actual Mac hardware.

**Windows manual acceptance remains open. Stop for review; do not begin Milestone 5B.**
