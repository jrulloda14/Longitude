# Longitude implementation plan

Prepared October 19, 2026. **Milestones 1 and 2 approved; Milestone 3 authorized and implemented. Stop for review before Milestone 4.** See [MILESTONE_1.md](MILESTONE_1.md), [MILESTONE_2.md](MILESTONE_2.md) and [MILESTONE_3.md](MILESTONE_3.md) for actual changes and verification. Milestones 4–7 remain plans, not implemented features.

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

## Milestone 5 — Native desktop integration

**Changes:** complete Tauri 2 shell/config/capabilities, version and app identifier, main entry and widget entry. Preserve custom main chrome; add two native windows with independent visibility, pin/opacity, expand, restore and monitor-aware bounds. Rust authority serializes validated actions with revisions and broadcasts canonical snapshots; windows rehydrate on reconnect. Tray actions: open, widget, Now, settings, Quit. Add explicit close/tray preference and configurable owned global shortcut with conflict errors/rollback. Optional autostart uses the existing row. Bundle Geist, icon sizes and local assets. Keep platform-specific code out of shared domain logic.

**Primary files:** `src-tauri/`, `platform.tauri` and state bridge, entry points, App/widget containers, settings/chrome integration, native tests, README and build/macOS documentation.

**Checks:** Rust tests and `cargo check/test`; native launch, custom drag/caption actions, resize/min size; actual tray menu actions; shortcut conflict/rebinding; no orphan inaccessible process on close; independent widget hide/show/expand/pin; concurrent actions/no event echo loop/out-of-order snapshots; restart; removed/negative-coordinate monitors; 100/125/150/200% scaling. Verify scoped capabilities and offline startup. Record checks that require manual Windows interaction as such.

**Gate:** native behaviors demonstrated in the real Windows app. JS mocks/unit tests alone cannot complete this milestone. Document signing/installer status separately.

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

The user approved Milestone 2 and authorized Milestone 3, including local Git baseline creation, then explicitly authorized commits/uploads to the Longitude GitHub repository. The overnight attribution and sampled-duration defects are fixed with permanent regressions and a baseline comparison. **Do not begin Milestone 4 without approval.**
