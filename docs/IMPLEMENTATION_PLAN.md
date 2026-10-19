# Longitude implementation plan

Milestone 5B authorization follow-up (October 19, 2026): the user explicitly authorized proceeding with 5B while reviewing Windows and Mac work together. This supersedes the earlier 5A approval gate for this task; outstanding Windows acceptance items remain disclosed in the historical [5A report](MILESTONE_5A.md). See the [5B report](MILESTONE_5B.md) for implementation and separate verification status. **Stop after 5B; Milestones 6 and 7 retain their unchanged text and scope.** Earlier gate wording below records the original plan, not a requirement to request approval again.

Updated October 19, 2026. **Milestone 5 is split into 5A — Windows Desktop Integration and 5B — macOS Desktop Integration. Complete and verify 5A, then stop for Windows review. Do not begin 5B without explicit approval.** The user authorizes the existing Windows scope with cross-platform boundaries. This revision updates the plan; it does not claim desktop implementation or verification. Milestones 1–3 are approved; [Milestone 4](MILESTONE_4.md) delivers browser persistence and a tested native adapter contract, with limitations in [PERSISTENCE.md](PERSISTENCE.md). Milestones 6 and 7 retain their existing scope and text.

The baseline evidence and architecture tradeoffs are recorded in [IMPLEMENTATION_AUDIT.md](IMPLEMENTATION_AUDIT.md). Work in the root `src/` project and preserve existing presentation and tokens. No replacement UI or service backend is proposed.

## Milestone 0 — Audit and architecture

Deliverables: audit, component/logic inventory, demonstrated defects, proposed architecture, dependencies and this sequence. Added documentation only. Original five tests and strict type check pass in an isolated harness; eight extra probes produce four passes and four failures. The prebuilt design pipeline can be rebuilt there. Native and visual verification remain pending. Audit delivery does not mark failed production requirements complete.

## Milestone 1 — Timezone foundation

**Changes:** add a root manifest/lockfile and test/typecheck scripts, preserving React 18 and Tailwind 3. Add the minimal Vite/mounted-entry build foundation needed for later integration without generating replacement components. Keep the browser-preview build separate. Preserve the time module facade; implement validated civil-time resolution and explicit earlier/later/reject policies with a pinned Temporal polyfill. Repair transition-cache bounds and calendar arithmetic, retain Intl-derived labels/offsets, normalize accepted IANA IDs and detect local system zone safely. Define a documented civil date range and historical precision contract; do not silently promise exact historical offsets while rounding away seconds.

**Primary files:** root package/build configs, `src/lib/time.ts`, `src/lib/time.test.ts`, small domain model/validation helpers, desktop-ready entry files, `docs/TIMEZONE_ENGINE.md`, `docs/ARCHITECTURE.md` and README. Isolate preview shims if the root manifest is ESM.

**Checks:** original tests; Manila/New York/London/Sydney; UTC; Adelaide half-hour and Kathmandu/Chatham quarter-hour offsets; midnight/date line/leap years; both fold instances; gap rejection/shift policy; invalid dates/instants/IDs; Lord Howe 30min transition; skipped civil date; 23h/25h midnight intervals; cache before/after Adelaide's half-hour UTC transition. Run strict type check and frontend/preview builds.

**Gate:** all timezone acceptance tests pass, with timezone semantics and runtime tzdb limitations documented. Overnight scheduling failures remain explicitly assigned to Milestone 3. No native claim.

## Milestone 2 — Interactive frontend integration

**Changes:** reuse controlled dial/readout/list/timeline. Implement click-to-select, accessible AM/PM choice and minimal date input where needed; fix day navigation to preserve civil time. Derive all main displays from one instant. Correct timeline labels and cells using actual local boundaries on one absolute axis, including fractional transitions; correct row strips. Make widget time controlled in preparation for the second window; keep preview timeout behavior coordinated with shared state. Fix stale suggestion dependencies where encountered, and prevent focus-reset effects during live ticks. Keep animation and keyboard behavior.

**Primary files:** `App.tsx`, store selectors, InteractiveClock, TimeReadout, TimezoneTimeline, TimezoneRow, CompactWidget, targeted primitive internals and interaction tests.

**Checks:** drag across midnight/multiple revolutions, hour hand, stationary click, wheel and keyboard, 1/5-minute snapping, direct entry/AM-PM/date input, fold alternative, Now returning to live, frozen planning time during ticks, timeline/dial alignment at fractional offsets and DST boundaries. Exercise dark/light, reduced motion, minimum size and focus through ticks. Capture baseline/comparison screenshots from the existing design at matching sizes/times.

**Gate:** all displayed instants agree and interaction regressions pass without unintended design changes. Document unresolved native widget delivery separately.

## Milestone 3 — Scheduling engine

**Changes:** exact work-interval coverage, weekdays anchored to shift-start dates, overnight/multiple intervals and local weekends. Validate conflicting work/sleep settings. Add bounded date-range, duration, participant subset, preferred-window, minimum-overlap and optional fairness inputs; expose them through small additions to the existing planner/editor. Deterministic lexicographic ranking, documented score and reasons. Memoize daily intervals; only move search to a worker if measurements justify it.

**Primary files:** `lib/schedule.ts`, domain recurrence/DST utilities if needed, schedule tests, WorkingHoursEditor, existing PlannerView/OverlapIndicator, store meeting/search models and architecture/timezone documentation.

**Checks:** the two reproduced scheduling failures; exact end-boundary exclusion and last-minute crossing; no overlap; multiple participants/intervals; overnight Friday/Saturday and Sun–Thu schedules; different durations; midnight and DST-spanning meetings; work/sleep conflicts; preferred/minimum filters; deterministic fairness ties; bounded invalid/large search inputs. Compare optimized results against a simple reference implementation in tests.

**Gate:** full-duration coverage tests pass, recommendations explain scores and never imply calendar availability. No mock suggestion results.

## Milestone 4 — Persistence and saved configuration

**Changes:** validated versioned envelope, legacy unversioned migration, deep defaults, reference/group invariants, favorites and label editing within existing controls. Async hydration prevents early default writes. Split durable preferences/groups/recent meeting inputs from live/planning session state. Serialize/debounce saves, recover malformed files without destroying the recovery copy, and surface disk failures. Implement the supported Tauri store adapter with a narrow native storage host if necessary; the full window/tray lifecycle remains Milestone 5. Verify crash-safe behavior of the pinned persistence implementation rather than assuming it.

**Primary files:** store, schema/migration/repository modules, Platform interface + browser adapter/test fake, minimal native persistence boundary and matching Cargo/config files as needed, group/search/settings/editor controls, persistence tests and docs.

**Checks:** save/reload/restart; missing settings; invalid JSON/types/zones/IDs; duplicate IDs; migration determinism; unsupported future schema; last-group deletion policy; active/reference fallback; favorites and same-zone different-city identity; load/save failures; ordered rapid saves; no overwrite before hydration; atomic-write failure/recovery behavior where implemented.

**Gate:** validated configurations survive restart and errors recover predictably. A storage-host smoke test is not evidence of completed desktop integration.

## Milestone 5A — Windows Desktop Integration

**Changes:** retain the previously approved Windows scope: complete Tauri 2 shell/config/capabilities, version and app identifier, main entry and widget entry. Preserve Claude Design's custom Windows chrome; add two native windows with independent visibility, pin/opacity, expand, restore and monitor-aware bounds. Rust authority serializes validated actions with revisions and broadcasts canonical snapshots; windows rehydrate on reconnect. Tray actions: open, widget, Now, settings, Quit. Add explicit close/tray preference and a configurable owned global shortcut with conflict errors/rollback. Optional autostart uses the existing row. Bundle Geist, icon sizes and local assets. Implement the Milestone 4 fixed-command native persistence host with atomic conditional commits and recovery using its shared schema/repository contract.

**Cross-platform requirements during Windows implementation:**

- Keep the existing React components, TypeScript application state, timezone/scheduling engines and persistence schema/repository platform-independent. Do not fork the frontend or introduce OS-specific calendar/timezone calculations.
- Put Rust commands and platform services behind portable interfaces. Isolate necessary OS differences in narrow adapters/conditional modules rather than scattering Windows checks through shared code. Window/tray/shortcut/notification services must describe capabilities and errors without assuming Windows event semantics. Do not add notification features solely to exercise this boundary.
- Resolve filesystem locations through Tauri-supported application directories, such as app-config/data directories; no hard-coded drive letters, user profile paths or Windows separators. Enforce fixed logical storage keys, locking, atomic replacement and recovery at the native boundary. Native commands must retain the shared schema's validation and migration semantics.
- Use a shared `tauri.conf.json` with supported platform overrides, including `tauri.windows.conf.json` and the planned `tauri.macos.conf.json`. Keep common assets, identifiers and capabilities shared where appropriate; review effective merged configuration so platform overrides do not accidentally broaden permissions or replace required window definitions.
- Review every new crate/plugin, feature and capability for maintenance, security, licensing, necessity and Windows/macOS support before adding it. Record platform/version limitations and fallback behavior. Scope commands to intended windows; grant no general filesystem or shell access when the fixed storage interface suffices. Document notification permissions only if the approved functionality needs notifications.

These requirements prepare the shared foundation; macOS-native behavior, macOS packaging and macOS CI execution belong to 5B after approval.

**Primary files:** `src-tauri/` shared Rust services plus Windows adapters/config/capabilities; `platform.tauri` and state bridge; existing main/widget entry points and containers; settings/chrome integration; native storage and coordination tests; README, architecture, dependency/security and desktop build documentation. Deliver `docs/MILESTONE_5A.md` and update `docs/MACOS_READINESS.md` with the boundary review.

**Checks:** preserve all Milestones 1–4 shared/browser regressions; Rust tests and `cargo check/test`; native launch, custom drag/caption actions, resize/minimum size; actual tray menu actions; shortcut registration/conflict/rebinding/rollback and cleanup; no orphan inaccessible process on close; explicit Quit versus hide; independent widget hide/show/expand/always-on-top/opacity; concurrent actions, no event echo loop, rejected out-of-order snapshots and reconnect hydration; native save/reload/process restart, interrupted-write/recovery and stale-write behavior; removed/negative-coordinate monitors; 100/125/150/200% scaling; dark/light and keyboard interactions. Verify scoped capabilities, app-directory paths, local assets and offline startup. Record actual Windows version/hardware, exact automated results, manual checks, before/after screenshots and idle/drag/memory measurements. Record unavailable Windows environments explicitly. Inspect abstractions and dependency support for macOS without claiming macOS runtime verification.

**Gate and Windows report:** demonstrate native behavior in the real Windows application; JS mocks or a storage-host smoke test alone cannot complete 5A. Report modified files, dependencies/capabilities, exact results, persistence integrity, performance, visual regressions, defects and unsigned/signed artifact paths and packaging status. Keep native integration verification separate from installer/release certification. **Stop after 5A and wait for Windows report approval before any 5B implementation.**

## Milestone 5B — macOS Desktop Integration

**Prerequisite:** explicit approval of the Milestone 5A Windows report. Reuse the shared Tauri application, Rust services, persistence schema and Claude Design components. No separate macOS frontend or rewritten timezone/scheduling engine.

**Changes:**

1. Add macOS Tauri configuration/overrides, declared minimum OS and target architectures, macOS assets and narrowly scoped capabilities. Document unsupported targets rather than assuming universal support.
2. Integrate native macOS window/title-bar behavior and appropriate controls through the existing chrome abstraction. Verify dragging, resize, focus, minimize/fullscreen and safe content insets without redesigning the interface.
3. Implement the menu bar/status item and application menus with open/widget/Now/settings/Quit actions, keyboard equivalents and appearance-appropriate icons. Do not assume Windows tray click behavior.
4. Register configurable global shortcuts with macOS modifier conventions, collision/error reporting, rollback and ownership cleanup. Avoid intercepting unrelated system shortcuts; handle any actual permission denial explicitly.
5. Implement the floating always-on-top widget with pin/opacity, hide/show/expand, focus and monitor-aware restoration. Specify/test Spaces, fullscreen and display-change behavior; document platform restrictions.
6. Integrate native filesystem persistence through the same fixed commands, schema and migration/recovery tests. Resolve macOS application directories through Tauri; test conditional atomic writes, concurrency, interrupted writes and restart on the actual filesystem.
7. Implement explicit lifecycle policies for close versus hide, dock/application reopen, main/widget restoration, last-window handling and Quit. Ensure saving/shortcut cleanup and no inaccessible background process; expose the existing preference consistently.
8. Add application/menu bar icons, `.app` and development packaging configuration, with target architecture and minimum OS recorded. Prepare unsigned development artifacts when credentials are unavailable, labeling actual unsigned/ad-hoc status precisely.
9. Verify system dark/light changes and existing appearance preferences, Retina/high-DPI rendering, logical versus physical bounds, mixed-scale displays and widget restoration. Preserve typography, animation and all existing clock interactions.
10. Review macOS-specific entitlements, usage descriptions, capabilities, hardened-runtime needs and Gatekeeper behavior for the selected dependencies/distribution path. Request only permissions required by implemented functionality; document denial/recovery instead of requesting blanket permissions.

**Primary files:** macOS Tauri override/metadata/icons/entitlements as required; narrow Rust/macOS service adapters; existing chrome/window/platform bridge; shared tests plus macOS native tests; a feasible macOS GitHub Actions workflow; `docs/MILESTONE_5B.md`, `docs/MACOS_READINESS.md` and desktop build/signing/distribution instructions. Keep platform differences out of shared domain code.

**Testing and CI:** preserve Windows/shared tests and rerun Windows regressions after shared changes. Run Rust and TypeScript checks, shared timezone/scheduling/persistence fixtures and browser interaction tests against the macOS runtime where feasible; verify WebKit/ICU differences rather than assuming Edge equivalence. Add native lifecycle, title-bar, menu bar, shortcut conflicts/denial, widget/Spaces/focus, filesystem recovery, theme and Retina tests. Record hardware, macOS/WebView versions, architecture, exact results and manual/unavailable checks. Runtime acceptance requires actual macOS hardware; mocks, cross-compilation and CI compilation do not substitute for it.

After 5A approval, configure GitHub Actions macOS builds if repository access/runner availability make this feasible. Use reviewed action revisions, least-privilege workflow permissions and locked dependency builds. Record runner OS/architecture and produce clearly labeled development artifacts with logs/checksums; do not publish a release automatically. If infeasible, document the reason and exact local build steps. CI build evidence remains distinct from physical-hardware runtime evidence.

**Signing/distribution:** document Apple Developer/Developer ID prerequisites, certificate/keychain and secret handling, hardened runtime and narrowly justified entitlements, notarization submission, stapling and signature/Gatekeeper verification for the chosen distribution route. Without credentials, prepare unsigned development `.app`/packaging artifacts where tooling permits and explain their installation limitations; do not bypass or disable system security. Record whether `.app`/DMG generation, signing, notarization, installation and launch were each performed, failed or unavailable. **CI compilation or DMG file creation alone never means release-ready distribution.** Do not claim architectures or distribution channels that were not built/tested.

**Gate and separate reports:** deliver `docs/MILESTONE_5B.md` with separate Windows and macOS verification matrices, exact checks, hardware/runtime evidence, visual/performance results, known limitations and packaging/signing/notarization status per platform. Preserve the 5A report as historical evidence. Missing actual Mac hardware leaves runtime acceptance open even if CI builds succeed. Stop for review after 5B; it does not authorize Milestone 6.

**Scope of later milestones:** Milestones 6 and 7 below are unchanged. Their Windows distribution gate remains applicable to Windows; macOS packaging/verification is recorded separately in 5B. If a cross-platform dependency forces a later-scope adjustment, document its necessity and exact impact explicitly for review instead of silently changing those milestones.

**Implementation references:** [Tauri platform configuration overrides](https://v2.tauri.app/reference/config/), [Tauri global shortcuts](https://v2.tauri.app/reference/javascript/global-shortcut/), [Tauri macOS bundles](https://v2.tauri.app/distribute/macos-application-bundle/), [Apple signing](https://developer.apple.com/documentation/xcode/creating-distribution-signed-code-for-the-mac/) and [Apple notarization](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution). Recheck pinned versions and platform requirements before implementation.

## Milestone 6 — Sharing, export and contextual DST

**Changes:** extend current preview/summary builders with explicit participant dates, zone labels and offsets. Use actual selected instant and labels. Wire clipboard/native dialog and destination-scoped export with separate success/cancel/error results. Preserve one-off UTC ICS; validate serialization and use robust UID generation, timestamps, UTF-8 folding, escaping and CRLF. Provide an explicit recurrence basis (fixed UTC or organizer wall time), default transparently, and make preview, occurrences, TZID/VTIMEZONE export and warnings agree. Move recurring calculations out of presentation. Add selected-date offset comparisons and relevant upcoming transition warnings without generic alerts.

**Primary files:** `lib/share.ts`, domain recurrence/DST helpers, MeetingSummary, DstNotice, native export/clipboard adapters and tests, timezone/testing docs.

**Checks:** full/compact preview equals copied content; every date from selected instant; Unicode/long lines/lone CR/escaping; start/end/UID/DTSTAMP/creation metadata; ICS parsing by an independent parser; weekly DST behavior in both recurrence modes; unaffected meetings have no spurious warning; actual dialog save/cancel/failure and clipboard. Manually import representative files into Outlook, Google Calendar and Apple Calendar when those clients are available; report any unavailable client check as pending.

**Gate:** export syntax and selected native I/O paths pass; do not label unavailable importer checks verified. Export never creates calendar events automatically.

## Milestone 7 — Quality assurance and Windows distribution

**Changes:** resolve remaining defects, profile idle/drag/startup, cap caches, suppress unnecessary hidden-window activity, finish keyboard/screen-reader/contrast/reduced-motion review. Configure Windows installer, application metadata/icons and reproducible locked builds. Verify installation, launch, offline behavior and uninstall. Add CI suited to the actual repository when version control exists. Do not invent a publisher identity or signing credentials; document unsigned artifacts if signing is unavailable.

**Primary files:** targeted fixes only, bundle/release config, meaningful regression/native tests, README, `docs/ARCHITECTURE.md`, `docs/IMPLEMENTATION_AUDIT.md`, `docs/TIMEZONE_ENGINE.md`, `docs/TESTING.md`, `docs/BUILD_AND_RELEASE.md`, `docs/MACOS_READINESS.md`.

**Checks:** full TS suite, type check/build, Rust tests/checks, production Tauri build and Windows installer; clean installation/relaunch/uninstall; native regression matrix; disconnected network; keyboard and screen-reader workflows; startup/idle CPU/memory/drag measurements with hardware recorded. Test Windows 10 and Windows 11 where available; record unavailable environments explicitly. macOS readiness remains a code-boundary review, with no claim of macOS runtime integration.

**Gate:** no failing critical correctness tests, no silently unverified release requirements, concrete installer path and truthful remaining limitations. If an external prerequisite blocks a requirement, report it and leave the affected gate open.

## Reporting and approval

At each milestone, report changes, modified files, exact checks/results, failures and remaining issues, and update the implementation docs. Existing baseline defects are tracked until the owning milestone fixes them. A failing required test keeps its milestone gate open; do not substitute a successful type check for behavior verification.

The user has split Milestone 5 into the authorized Windows phase 5A and a separately gated macOS phase 5B. **Stop after 5A for Windows approval; do not begin 5B until approved.** After 5B, provide separate Windows/macOS results, limitations and packaging status and stop for review. Milestones 6 and 7 remain unchanged; document any required cross-platform dependency adjustment explicitly. This document revision itself adds no runtime code or desktop verification claim.
