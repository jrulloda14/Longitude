# Longitude implementation audit

Current follow-up: [Milestone 1](MILESTONE_1.md) establishes the timezone foundation; [Milestone 2](MILESTONE_2.md) integrates the existing interactive frontend. The baseline findings below are retained as audit history. Scheduling defects remain open for Milestone 3, which is not authorized yet.

Audit date: October 19, 2026 (Asia/Singapore).

This document preserves the pre-implementation Milestone 0 baseline. Milestone 1 has since been authorized and implemented; [MILESTONE_1.md](MILESTONE_1.md), [TIMEZONE_ENGINE.md](TIMEZONE_ENGINE.md), [DEPENDENCIES.md](DEPENDENCIES.md) and [PERFORMANCE.md](PERFORMANCE.md) describe current implementation and measurements. The invalid-date and stale transition-cache findings below now have fixes and permanent regressions. The overnight and duration-evaluation scheduling defects remain open for Milestone 3. Later milestone descriptions here are recommendations rather than completion claims.

Scope: Milestone 0 only. No application source, dependencies, design tokens, generated prototype assets, or native configuration were changed. Milestone 1 requires the user's approval, as explicitly requested in the supplied brief. This is an audit of source and isolated automated checks, not a certification of production readiness or native Windows behavior.

## 1. Existing project structure

The authoritative editable project is the root `src/` tree. `longitude-ui/` is empty. The ZIP has 60 entries including directories; every archived file has a byte-identical counterpart at the root (SHA-256 comparison). Do not extract another application or implement in the empty directory.

```text
Longitude/
  src/
    App.tsx                     Provider + Shell + PlannerView
    index.tsx                   Design-bundle exports, no DOM mount
    platform.ts                 Typed interface + browser adapter
    state/store.tsx             Models, reducer, context, selectors, live timer
    lib/
      time.ts, time.test.ts     Intl conversions + five Vitest tests
      schedule.ts               Work/sleep states, overlap, suggestions
      share.ts                  Summary text + ICS serialization
      cities.ts, search.ts      Bundled city catalogue + runtime zone search
      parse.ts, sun.ts          Direct time parsing + solar shading
    components/                 14 component modules; see inventory below
    primitives/index.tsx        Existing controls, menus, dialog, tooltip
    frame/PrototypeWindow.tsx   Browser-only resizable window simulation
    shims/                     CommonJS bridges to global React/ReactDOM
    styles.css                  Scoped base styles, animation, controls
    tokens.fallback.css         Generated light/dark CSS tokens
  prototype/
    index.html                  Runnable prebuilt browser preview
    bundle.js, bundle.css       Generated preview assets
    lib/                       React/ReactDOM UMD distributions
  build.mjs                     esbuild IIFE + Tailwind CLI bundle pipeline
  tsconfig.json                 Strict TS, ES2020, bundler resolution, noEmit
  tailwind.config.cjs            Tailwind 3 token mappings, preflight disabled
  tokens.json, gen_fallback.py   Token source + CSS generation
  DESIGN.md, DIRECTIONS.md       Instrument design and interaction rules
  HANDOFF.md, SETUP.md           Handoff contracts and proposed desktop setup
  docs-index.d.ts                Documentation-only component declarations
  *.svg                         App mark and icon artwork
  longitude-ui.zip               Duplicate design export
```

There was no README, package manifest, lockfile, installed dependency directory, Vite configuration, mounted production entry point, Cargo manifest, Tauri configuration, capabilities, installer configuration, CI configuration, or license file. `git status` reports that this directory is not a Git repository. No applicable `AGENTS.md` was found in the workspace or the checked parent locations.

### Actual stack and dependency evidence

| Item | Evidence and conclusion |
| --- | --- |
| Framework | React function components and TypeScript; no routing framework |
| React / ReactDOM | Bundled UMD files identify **18.3.1** |
| TypeScript | Strict configuration exists; original compiler version cannot be determined without a manifest/lockfile |
| Styling | Tailwind 3 syntax and token CSS; SETUP recommends **3.4.17** |
| Icons | `lucide-react` imports; SETUP recommends **0.441.0**; original resolved version unknown |
| Font | Geist intended; prototype HTML requests Google Fonts, so font loading is currently network-dependent |
| Build | `build.mjs` imports esbuild and invokes `npx tailwindcss`; neither original resolved version is recorded |
| State | React reducer/context, component-local transient state; no external state library |
| Timezone | Browser `Intl.DateTimeFormat` / runtime ICU, epoch milliseconds; no timezone library installed |
| Tests | One `src/lib/time.test.ts` file with five Vitest tests; no test configuration or scripts |
| Desktop | Tauri 2 is proposed in documentation; no Tauri or Rust implementation exists |

Read documentation: DESIGN, DIRECTIONS, HANDOFF, SETUP, component declarations, and source comments. HANDOFF's references to `components/src/`, `components/index.d.ts`, and a README do not match this export. Its description of timezone/scheduling logic as production-grade is not supported by the additional checks below.

## 2. Functional components and current hierarchy

```text
prototype/index.html -> PrototypeWindow -> LongitudeApp -> StoreProvider -> Shell
  TitleBar -> Clock / Planner / Settings
  Clock: InteractiveClock + TimeReadout + GroupSelector + TimezoneList
         + optional Timeline + OverlapIndicator
  PlannerView: small InteractiveClock + Timeline + suggestions + DST notices
  SettingsPanel
  modal layers: TimezoneSearch, MeetingSummary, Onboarding
  compact mode: CompactWidget replaces the main shell content
```

Components receive props/callbacks. `App.tsx` is the state-reading container. Presentation imports some domain functions and store model types, but components do not directly subscribe to the store. Preserve that useful boundary.

| Module | Implemented behavior observed in source | Limitation / next integration |
| --- | --- | --- |
| InteractiveClock | SVG minute/hour drag, angular accumulation across revolutions, pointer capture, wheel thresholds, keyboard steps, 1/5-minute precision, ghost hands, reset, sky ring, reduced motion | Pointer-down starts a drag but a stationary click does not select a dial position; date keys add fixed 24h; AM/PM window is decorative |
| TimeReadout | Editable time, parser errors, DST resolution note with alternative occurrence, previous/next day, live/planning indicator | Date arrows add 86,400,000ms; AM/PM can be typed but there is no separate selection control or date picker |
| TimezoneRow / TimezoneList | Computed offsets/dates, labels, reference choice, remove, pointer/keyboard reorder, context menu, work/sleep editor | Mini day strip assumes 48 half-hour cells; weekday/sleep and keyboard event edge cases need tests |
| TimezoneSearch | City/country/alias/IANA/abbreviation/offset search, keyboard results, loading skeleton prop | Small catalogue; synchronous search repeats on every live second; identity checks use separate name/zone arrays |
| TimezoneGroupSelector | Create, rename, duplicate, delete, switch; reducer protects last group | No schema validation; menu lacks the arrow-key behavior supplied by MenuList |
| TimezoneTimeline | Absolute span between successive reference midnights, drag/keyboard meeting selection, now/overlap/meeting overlays, fractional-offset row starts | Header text assumes elapsed 6/12/18h equals civil 6/noon/18; cells advance fixed hours and miss fractional DST boundaries |
| MeetingOverlapIndicator | Good/partial/poor working-hour verdict, per-person reasons, polite announcements, calendar disclaimer | Correctness depends on sampled scheduling engine |
| MeetingSummary | Live full/compact text, title/duration/format controls, copy/export callbacks, weekly shift notes | Duration 90 label is constructed as `1.5.5 h`; summaries omit per-row explicit dates, zone IDs, offsets |
| DstNotice | Upcoming offset-change sentences, weekly fixed-UTC local shifts | Does not compare now/selected offsets; weekly logic lives inside presentation; cache defect can produce stale notices |
| SettingsPanel | Format, precision, theme, motion, default hours/days, timeline, widget pin/opacity, tray preference | Autostart is always false with no-op setter; global shortcut is a label; chrome selector is preview-only |
| CompactWidget | Existing 264px design, up to first five rows, pin/opacity callbacks, expand/close, 8-second preview timeout | Separate local `offsetMin`; uses now rather than shared selected time; no favorites model; no native window |
| WindowChrome | Custom caption buttons, compact action, drag-region attributes, alternate macOS artwork | Browser window callbacks are no-ops; no native hit testing/lifecycle |
| Onboarding / EmptyState | Home/preset choices, live preview, quick-add locations, replay | Default `onboarded=true`; fallback home is Manila if no exact system-zone catalogue match; narrow onboarding needs checking |
| Primitives | Existing buttons, segmented controls, switches, tooltip, menus, popovers, dialog focus trapping/restoration | Focus effects depend on frequently recreated callbacks/items; live rerenders may reset focused fields/menus; browser verification required |

### State and live/planning behavior

`selected: number | null` is a good existing canonical instant: `null` means live, and Shell derives `at = selected ?? now`. `useNow` aligns a timeout to second boundaries. Ticks do not overwrite selected planning time. Clock, rows, main timeline, planner and summary mostly derive from that shared instant already. The compact preview and onboarding preview are exceptions; onboarding is intentionally illustrative, but the production widget must become controlled.

The reducer already supports group/location CRUD, reference fallback after removal, reordering, settings and meeting edits. It trusts all actions and saved data. `initialState({groups: []})` accesses `groups[0].id`; invalid IDs and malformed fields can also reach render code.

## 3. Mock or incomplete features

- Native window minimize/maximize/close, compact mode and pin operations are browser no-ops. Mode currently swaps content inside one simulated window.
- No tray, global OS shortcut, shortcut-conflict handling, close-to-tray policy, window restore, monitor recovery, second native window or cross-window synchronization.
- Browser clipboard is real, including a legacy fallback; file export uses a Blob download rather than a native save dialog.
- Persistence is opt-in (`persist` defaults false); the supplied prototype does not enable it. When enabled, localStorage contains an unversioned object despite the `longitude.v1` key name.
- No favorites data or UI. Widget displays the first five locations, despite empty-state copy calling them favorites.
- No multiple work intervals, preferred meeting windows, minimum-overlap filter, selected participant subset or fairness option. Planner searches only the selected reference day.
- Upcoming DST and fixed-UTC recurrence warnings exist, but not all contextual warnings requested in the brief.
- No installer, version/application identity, raster/ICO build assets, release documentation, native tests or offline font bundle.

## 4. Missing or incorrect application logic

### Confirmed correctness defects

| Finding | Evidence / reproducible case | Required correction |
| --- | --- | --- |
| Overnight work assigned to wrong weekday | UTC Friday-only 22:00–06:00 schedule reports Saturday October 24, 2026 02:00 as `off` | Attribute post-midnight tail to the shift's starting local date |
| Duration evaluation misses boundary crossings | UTC Friday October 23, 2026 16:55, duration 10min, work ends 17:00 reports `work` | Evaluate exact half-open meeting interval against resolved work intervals |
| Transition cache returns a past transition | Adelaide queried October 3, 2026 16:00Z then 16:45Z with two-day horizon; second query returns already-passed 16:30Z transition | Cache by correct validity bounds and re-check query bounds; bound cache growth |
| Invalid dates misclassified as DST gaps | `resolveWall('UTC', 2026, 2, 30, 12, 0)` does not reject invalid date | Validate civil fields independently of timezone disambiguation |

These four expected-behavior audit probes fail against untouched source. They remain unresolved in Milestone 0.

### Other source findings requiring implementation or verification

1. `resolveWall` infers candidate offsets from only three instants around the requested date and uses a pre-offset fallback for every no-hit case. It lacks explicit rejection policies and broad historical/date-skip coverage. `offsetMinutes` rounds offsets to whole minutes, so historical second-level offsets are not represented exactly. Define supported civil date range and use a proven resolution implementation.
2. Civil date navigation in both clock keys and readout arrows must use `addLocalDays` semantics rather than elapsed 24h. The existing `addLocalDays` helper drops seconds/milliseconds; make that policy explicit.
3. London October 25, 2026: timeline header position `dayStart + 12h` is 11:00 local but says Noon. Row cell boundaries based on absolute one-hour increments also need Lord Howe's half-hour DST coverage. DayStrip's sampled span/cursor mapping disagrees on 23/25-hour days.
4. Scheduling cost alone is not the requested lexicographic ranking. Suggestions have no public numeric suitability score or detailed inconvenience metrics. Range stepping approximates boundaries; unvalidated zero/negative step could cause nontermination. Sleep is prioritized ahead of work, so overlapping sleep/work config can veto an overnight shift.
5. `suggestTimes` memo dependencies omit `p.at`, although proximity is a tie-breaker; recommendations can become stale as the selected instant moves within a day.
6. Schema validation, deep default merging, migrations, load/save error reporting, asynchronous hydration and debounced serialized durable writes are absent. Every state action triggers the persistence effect, including dial movement even though selected time is serialized as null; mode is saved too, contrary to the handoff description.
7. Aliases are split on spaces, breaking some multiword aliases. Zone IDs are accepted through runtime Intl without a canonical normalization boundary. Runtime supported-zone enumeration and a legacy filter are not a complete canonical search dataset. Same-zone cities are supported, which should be preserved.
8. Approximate bare-zone coordinates are passed into the sky ring; show no ring when coordinates are unknown rather than implying accurate solar data.
9. The Platform synchronous load/save and void window methods cannot faithfully expose asynchronous Tauri errors. Its comment proposes resizing a single window, while HANDOFF asks for a second window. Resolve this in favor of the user's separate-window requirement.
10. Sharing lacks per-participant explicit dates and unambiguous zone labels. One-off ICS has UTC times, UID, DTSTAMP, escaping, UTF-8 folding and CRLF already. Validate inputs, lone CR/control characters and all text paths before promising interoperability. Native cancel must be distinct from a save error. No importer tests exist.
11. Weekly recurrence deliberately uses fixed UTC and warns about local shifts. This is a real current behavior, not inherently invalid ICS. An organizer-wall-time recurrence is a different contract: implement it consistently in preview/warnings/export, using TZID/VTIMEZONE, rather than silently changing semantics.
12. One broad context broadcasts `now` each second to Shell; domain verdicts/timeline cells can be recomputed while planning time is unchanged. Search computes while closed. Formatter/abbreviation/transition caches grow without bounds. Memoize stable day data and avoid background work in hidden windows before adding workers.
13. Accessibility scaffolding exists but is not independently certified. Check menu focus on second ticks, bubbling row Enter/Delete from child buttons, group menu keys, named default weekdays, focus restoration, clipping at minimum size, screen readers, contrast, and DPI. No new UI framework is needed.

## 5. Technical risks

| Priority | Risk | Mitigation / gate |
| --- | --- | --- |
| Critical | Incorrect recommendations appear fully inside work hours | Exact interval engine and edge-case tests before claiming scheduling complete |
| High | Corrupt saved data crashes startup or overwrites valid data | Validated schema, recovery backup, hydration gate, serialized writes and restart tests |
| High | Multiple windows race and diverge | One authoritative native revisioned state owner; frontend submits validated actions |
| High | DST conversion, date navigation and timeline disagree | One domain conversion boundary; regression tests in Node and WebView2 |
| High | Native capabilities too broad or close/tray behavior hides all entry points | Window-specific capabilities, explicit lifecycle policy, recoverable tray controls |
| Medium | Source cannot be reproducibly installed | Root manifest/lockfile, pinned compatible versions, preserved React 18/Tailwind 3 |
| Medium | WebView tzdb differs across installations | Document runtime tzdb dependency; verify supported zones/dates and test target WebView |
| Medium | Current local-font assumption fails offline | Bundle Geist and remove runtime font requests in desktop entry |
| Medium | Native restore position is outside current monitor bounds | Clamp restored physical/logical coordinates to available monitors with DPI-aware tests |
| Medium | Handoff overstates tested features | Treat actual source/check results as authority; retain explicit verification limits |

No network-backed service is needed for normal operation. Dataset and font redistribution require license attribution. The project currently has no project license; document that fact rather than choosing a license for the owner.

## 6. Recommended implementation architecture

Preserve file layout and public component props where practical. Add narrow modules; do not create a replacement frontend.

| Layer | Existing base | Proposed additions |
| --- | --- | --- |
| Presentation | Components, primitives, token styles, App container | Controlled widget, small missing controls within existing menus/settings/planner |
| Application | Reducer/context, models and selectors | Validated actions, hydration/error state, favorites, search inputs, recurrence mode, durable/transient split |
| Domain | `lib/time`, `schedule`, `share`, `parse`, city/search utilities | Validated timezone boundary, exact work intervals, deterministic ranking/reasons, domain recurrence/DST helpers |
| Platform | Existing typed Platform and web adapter | Async `platform.tauri`, runtime capability flags, error results, state bridge, native commands |
| Native | Absent | `src-tauri`: lifecycle, main/widget windows, tray, shortcut ownership, revisioned state, durable storage coordination |

Keep epoch milliseconds as the canonical selected instant. Add runtime validation (finite valid instant, allowed fields, bounded search range and duration) rather than trusting TypeScript types at persistence/IPC boundaries.

**Timezone decision proposed for Milestone 1:** retain the current `lib/time.ts` facade and cached Intl formatting, but use `@js-temporal/polyfill` behind civil-time resolution/calendar arithmetic. Its earlier/later/reject disambiguation allows explicit ambiguous/nonexistent handling without maintaining a bespoke offset-search algorithm. Validate calendar fields with overflow rejection first. Keep the import local rather than globally patching Date/Temporal. Tradeoff: extra bundle/runtime cost and continued runtime timezone-data dependence; measure the production bundle. Retaining the custom resolver would save bytes but expands correctness and maintenance obligations. Do not add a second Rust timezone engine unless an independently justified native need appears. See the [polyfill maintainer documentation](https://github.com/js-temporal/temporal-polyfill).

**Work interval decision:** weekdays belong to the local start date. Resolve each interval's start/end in its participant zone, advance the end date for overnight shifts, and compare absolute half-open ranges. Fully working means the union covers the entire meeting. Resolve DST folds/gaps by a documented boundary policy and test it. Support a list of intervals in the schema even if the initial editor shows one; add another interval action inside the existing editor when implemented. Explicit user work overrides a contradictory sleep hint, or validation requires correcting the conflict.

**Ranking decision:** bounded configurable candidate grid; rank by fully covered participant count descending, total out-of-work minutes, preferred-window distance, optional worst-participant inconvenience for fairness, requested-date distance, then absolute start instant. Expose the tuple and explanation alongside a documented normalized score. Candidate stepping controls search granularity; it must not control interval correctness. Use working-hour language only.

**State/persistence decision:** browser reducer remains useful and testable. Desktop hydration completes before mounting the interactive store. Rust owns the authoritative revision and validates proposed changes; both windows receive canonical snapshots/events and request a fresh snapshot after missed/reordered events. Serialize mutations to prevent lost updates and avoid rebroadcast loops. Persist only durable settings/groups/recent meeting config, debounce disk writes, and keep selected instant live in session only. Use Tauri store for the supported local JSON persistence mechanism, with versioned validated envelopes and recovery backup. Do not assume atomicity from the plugin name: inspect the selected version's implementation, then add temp-file/replace or equivalent crash-safe coordination if necessary. [Tauri store is asynchronous](https://v2.tauri.app/plugin/store/), so the existing synchronous interface needs an intentional update.

**Native decision:** one main window and one independently hideable widget. Rust owns tray/lifecycle/global-shortcut behavior; native events invoke the same typed actions as UI controls. Restore bounds against active monitors, register only an owned configured shortcut, and leave the prior binding intact when replacement fails. Main close-to-tray is explicit and cannot leave the app inaccessible when tray is disabled. Use least-privilege [per-window Tauri capabilities](https://v2.tauri.app/security/capabilities/), local assets/CSP, no shell permission, and file writes limited to a user-selected export destination or app data. Optional autostart can use the existing row after the required integrations work.

## 7. Integration strategy

Detailed sequencing and completion gates are in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

1. Use the root project. Establish a reproducible toolchain around existing source; keep preview shims/frame isolated from the desktop entry.
2. Repair domain behavior behind existing names and add tests before modifying interaction wiring.
3. Keep controlled clock/row/timeline props; use the shared selected instant and calendar-safe date navigation everywhere.
4. Extend existing editor, selector, planner and settings controls only where required features lack an entry point.
5. Build persistence/schema before two-window synchronization; introduce async platform interfaces with browser test doubles.
6. Add the Tauri shell, native adapter, two windows, tray and shortcuts; verify native behavior separately.
7. Finish contextual DST, explicit summary dates and native export; preserve current one-off UTC ICS representation.
8. Test packaging, offline behavior, performance, accessibility and installer on Windows. Record macOS readiness as architecture only.

Preserve dark/light tokens, graphite/ivory/orange palette, Geist typography, SVG dial, unwrapped hand transitions, responsive breakpoints, working-hour vocabulary and all existing keyboard alternatives. Keep the exported browser prototype as a visual reference.

## 8. Dependency changes required (proposed, not installed in the project)

| Purpose | Proposed dependency / tooling |
| --- | --- |
| Preserve UI runtime | React/ReactDOM 18.3.1, compatible React 18 types, lucide-react 0.441.0 initially |
| Offline font | `@fontsource-variable/geist` |
| Reproducible frontend build | TypeScript, Vite + React integration, Tailwind 3.4.17 + PostCSS/autoprefixer as needed; retain esbuild for preview pipeline |
| Civil time | `@js-temporal/polyfill`, pinned version verified at implementation |
| Tests | Vitest; Testing Library + DOM environment for meaningful interaction tests; browser/native harness where feasible |
| Desktop | Tauri 2 JS API/CLI and matching Rust Tauri/build dependencies with tray support |
| Native adapters | Supported store, dialog, clipboard, global-shortcut, window-state plugins; scoped fs only if export uses it; optional autostart |
| Native models | Rust serde/serde_json; add other crates only for an implemented requirement |
| Data | Existing bundled cities retained/expanded with attributed local data and canonical ID mapping; full GeoNames/worker is optional, not necessary for the requested lightweight catalogue |

Avoid a new UI framework, backend/database server, cloud/calendar service, telemetry, broad shell access or gratuitous animation/state library. Decide validator library versus small explicit validators based on actual schema complexity. Pin exact compatible versions and commit npm/Cargo lockfiles during implementation, not in Milestone 0.

## 9. Audit checks and limitations

Checks ran on a copy under `%TEMP%/longitude-audit-2485ebfa7c88450a946afac37d818fc2`. Dependencies were installed there only, with install scripts disabled. Test tool versions are audit harness choices, not discovered original project dependencies: React/DOM 18.3.1, React 18 types, TypeScript 5.9.3, Vitest 3.2.4, Tailwind 3.4.17, lucide-react 0.441.0 and esbuild 0.28.2. The temporary package lock records their exact resolutions.

| Check | Result |
| --- | --- |
| Original `vitest run src/lib/time.test.ts` | **5 passed**: four-zone conversion, summary/ICS, London/New York transitions, NY fold/gap, Kathmandu |
| `tsc --noEmit --pretty false` with unchanged tsconfig/source | **Passed** in isolated dependency harness |
| Additional timezone probes | **4 passed**: London 23h/25h days, Adelaide +09:30, leap day calendar advance |
| Required-behavior regression probes | **4 failed**: overnight weekday attribution, full-duration work coverage, transition-cache freshness, invalid civil-date rejection; see section 4 |
| `node build.mjs audit-dist` in isolated harness | **Passed**, approximately 114KB minified JS (React external) and 20KB CSS; Browserslist data warning |
| ZIP/root comparison | Every archived file matched an existing root file; empty subdirectory is not a second project |
| Native checks / installer / visual interaction | **Not run**: no native app or production build exists; unit results do not establish native behavior |

The first isolated bundle attempt failed because the audit harness used `type: module`, making existing CommonJS `.js` shims invalid. Removing that field from the temporary harness made the unchanged pipeline pass. A future Vite ESM manifest must exclude those shims or rename/isolate them, not break the preview build. No source fix was made.

For the four failing probes, expected behavior and test inputs are recorded above; the temporary `audit-probes.test.ts` contains the executable checks. Promote them into the permanent suite in the relevant approved milestones. No new production test suite was introduced during this audit.

Host evidence: Node 24.15.0, npm 11.12.1, Rust/Cargo 1.99.0, Visual Studio 2022 Build Tools with x86/x64 C++ tools, Windows SDK 10.0.26100.0 and registered WebView2 155.0.4283.62 are present. This is prerequisite discovery, not a successful Rust link or installer test. Compare with [Tauri's Windows prerequisites](https://v2.tauri.app/start/prerequisites/) when configuring the selected versions.

Missing test coverage includes Sydney/Lord Howe DST, historical skips, malformed persistence/migrations, reducer invariants, exact multi-interval/overnight coverage, participant fairness, recurrence/export parsing, widget synchronization, native events, accessibility and monitor/DPI behavior.

## 10. Milestone 0 outcome

Audit and proposed implementation plan delivered; implementation remains gated on user approval. Existing source compiles and the original five tests pass in the isolated harness, but four additional correctness probes fail. These are documented baseline defects, not passed acceptance checks. Production correctness, desktop functionality and distribution remain unimplemented/unverified.

Files added in Milestone 0: `README.md`, `docs/IMPLEMENTATION_AUDIT.md`, `docs/IMPLEMENTATION_PLAN.md`. No pre-existing files modified. Remaining work: the approved milestones and all documented defects; no Milestone 1 work started.
