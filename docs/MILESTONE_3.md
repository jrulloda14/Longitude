# Milestone 3 — Scheduling Engine

Delivered October 19, 2026 for review. Milestone 2 was approved and Milestone 3 authorized. **Stop here; do not begin Milestone 4 without approval.**

## Outcome

Both original scheduling defects are resolved. Overnight shifts use the weekday of their start date. Full-duration suitability and overlap use exact half-open absolute ranges instead of 15-minute sampling. Recommendations support split work intervals, participant-local working days/weekends, elapsed durations, inclusive date ranges, preferred windows, participant subsets, minimum fully-working counts/shared minutes and optional fairness. Deterministic scores have plain-language reasons. No calendar availability is implied.

Claude Design's component architecture, typography, style/token/font files, clock animations and pointer interactions are retained. Minimal controls were added within the existing planner and working-hours dialog. Track/strip colors now reflect exact sub-hour boundaries while retaining geometry/labels. The Milestone 1 timezone engine is unchanged. No second resolver, worker, server, authentication, telemetry or dependency was added.

## Git baseline and upload

Before implementation, Git confirmed there was no repository. Reviewed `.gitignore`: dependencies, builds, traces, performance profiles and native targets remain excluded; added env-file, log and OS metadata exclusions. Created a clean baseline commit containing the approved Milestone 2 state: **`f8edbc157cfcf3a3f9f8cd877cedd3ed6e23b962`**. An existing generated-notice EOF whitespace warning was preserved with approved baseline content.

The user subsequently authorized commits/uploads to [jrulloda14/Longitude](https://github.com/jrulloda14/Longitude). Remote inspection found an empty repository. The baseline was pushed to `main` without force; the verified Milestone 3 delivery is committed/uploaded to that same branch. No Milestone 4 code is included.

## Defect proof

`node scripts/check-scheduling-regressions.mjs` bundles baseline/current schedulers against the same unchanged timezone engine. [Raw before/after assertions](evidence/milestone-3/audit-regressions.json):

| Case | Baseline | Milestone 3 | Required |
| --- | --- | --- | --- |
| Friday 22:00–06:00, Saturday 02:00 | off | work | work |
| 14-minute meeting starting 16:50, work ends 17:00 | work | edge | edge |

Permanent regressions also detect a one-millisecond crossing past work end and a one-minute sleep interval hidden between the old samples. Meeting end is exclusive: ending exactly at work end remains inside work.

## Algorithm and controls

[SCHEDULING_ENGINE.md](SCHEDULING_ENGINE.md) defines semantics, validation, complexity and limits. Queries are partitioned at engine-provided offset transitions. Local recurring work/edge/sleep predicates are expanded within constant-offset segments, swept into exact state ranges and indexed by cumulative durations. Binary search at both meeting endpoints gives complete coverage. Shared ranges are exact simultaneous intersections. Repeated intervals can occur twice, nonexistent minutes contribute zero time, and skipped start dates cannot create phantom overnight shifts. Historical offset seconds are retained.

Lexicographic ranking: sleeping person-minutes, outside-work person-minutes, off-hours person-minutes, optional maximum individual prior+current burden, distance from the selected search instant, then earlier instant. Burden weights are work/edge/off/sleep = 0/1/3/8, normalized by duration. Canonical participant ordering prevents input-order differences in aggregation. UI fairness starts equally and tracks no history.

The domain API returns numeric scores. Existing suggestion buttons and “Why these times” expose complete-duration working counts, shared minutes and reasons; the numeric score vector is not rendered. Search subsets affect recommendations; group-wide timeline/suitability/share remains whole-group, disclosed in the dialog. Custom requests retain the selection at Search and do not rerank on live ticks. Sleep overrides overlapping work, with an editor warning. Invalid defaults remain a draft and cannot enter app state.

## Exact verification

| Check | Result |
| --- | --- |
| Unit suite, default + JSON reporters | **623 passed, 5 files, zero failed**, 2.14 s; exit 0. All 551 Milestone 2 tests plus 72 scheduling tests. [Raw](evidence/milestone-3/unit-results.json). |
| Browser suite | **59 passed, zero failed/skipped/flaky, zero retries**, **64.309707 s**; 50 interaction + nine visual cases. [Raw report](evidence/milestone-3/browser-results.json). |
| `npm run build` | Exit 0; strict typecheck passed; Vite 1580 modules, 1.49 s. JS **433.48 kB / 134.40 kB gzip**, CSS **23.66 / 5.94 kB**. Notices regenerated for unchanged nine-package runtime inventory. |
| `npm run build:prototype` | Exit 0; original esbuild/Tailwind pipeline; Tailwind 568 ms; rounded output bundle.js 298K / bundle.css 20K. |
| Baseline regression comparison | Exit 0; both original failures reproduced before and corrected after. |
| Scheduling benchmark | Exit 0; Node/Edge result instants and scores match across all four workloads. [Raw](evidence/milestone-3/scheduling-performance.json). |
| Visual comparison | Exit 0; four identical scenarios and five reviewed intentional corrections, below. |
| Production audit | Exit 0; **0 vulnerabilities**. [Raw](evidence/milestone-3/npm-audit-production.json). |
| Full audit | Exit 1; **5 high development-only**, zero moderate/critical/low. Outstanding condition, not a passing full audit. [Raw](evidence/milestone-3/npm-audit-all.json). |

The independent slow wall-minute oracle compares every minute in ten full zone/date scenarios across UTC, New York, London, Lord Howe, Kathmandu, Chatham, Adelaide and Apia, plus meeting durations. A separate brute-force oracle compares all candidate scores/order for a 47-minute meeting. Exact millisecond/second fixtures supplement minute-resolution comparisons. Coverage includes Sun–Thu/overnight/multiple shifts, conflicts, folds/gaps, fractional offsets, skipped dates, subsets/preferred/minimum filters, deterministic fairness, safe caches, invalid/null/sparse inputs and bounded-search rejection. The oracle shares installed timezone data; it is not independent tzdb verification.

All 38 prior browser interaction cases remain passing. Twelve new cases cover integrated overnight/duration verdicts, split editor save, disabled days/equal endpoints, sleep warnings/eight-row scrolling, custom duration and all filters/fairness, invalid/no-feasible results/live ticks, invalid defaults, Lord Howe repeat, narrow dialogs/focus and sub-hour shading. Final screenshot assertions use no update-snapshot flag.

Initial development checks caught an Apia phantom tail and eight-interval dialog overflow; both were fixed and have regressions. Two runner invocations exited before tests started (one server startup error, one exit without a diagnostic); complete suites subsequently passed without test retries. Non-fatal output includes stale caniuse-lite, occasional Vite callback timings, NO_COLOR/FORCE_COLOR and Git LF/CRLF notices. No failing required assertion is waived.

## Before/after visuals

[Gallery](evidence/milestone-3/visual/index.html), [counts/bounds](evidence/milestone-3/visual/comparison.json), [baseline metadata](evidence/milestone-3/visual/before/metadata.json). Before capture used approved Milestone 2 source before scheduler changes. Same fixed times/viewports, local Geist and installed Edge 155.0.4283.62.

| Scenario | Changed pixels | Intended change |
| --- | ---: | --- |
| Settings, narrow clock, compact widget, London fall-back | 0 each | Identical. |
| Dark clock / planning clock | 860 each (0.180672%) | Exact half-hour work/edge colors only, x444–746/y327–408. |
| Light clock | 862 (0.181092%) | Same exact-band correction. |
| Kathmandu | 878 (0.184454%) | Same fractional-track correction, x489–824/y327–408. |
| Planner | 9368 (1.968067%) | Required search/reason controls, exact bands and ranked recommendation values. |

Original before images remain. Five corrected goldens were visually reviewed/stored separately. Assertions allow zero perceptual changed pixels against the appropriate original/corrected golden (threshold 0.1); the separate RGBA counter uses channel delta >16. [Search controls](evidence/milestone-3/visual/after/search-controls.png) and date popups at [380](evidence/milestone-3/visual/after/date-picker-380.png)/[850](evidence/milestone-3/visual/after/date-picker-850.png) supplement the nine comparisons. Animation is disabled only for screenshots; motion/pointer regressions remain active.

## Scheduling measurements

Actual host: Intel Core i5-6500 3.20 GHz, four cores/logical processors; RAM 17,067,753,472 bytes (~15.90 GiB); MSI MS-7A70, Windows 10 Pro 19045, Intel HD 530 driver 31.0.101.2111. Node 24.15.0 / ICU 78.2 / tzdb 2026a; headless Edge 155.0.4283.62. Raw scheduling evidence records CPU/RAM/OS/runtimes; frontend evidence includes GPU/system details.

Two intervals per participant, eight zones including fractional offsets, 47-minute duration, 30-minute starts, fairness enabled. One first query plus seven cached runs in separate Node/Edge processes, sequentially after builds/tests stopped. Earlier workloads can warm shared date caches/JIT; these short development measurements are not statistical guarantees.

| Participants / days / candidates | Node first / warm median | Edge first / warm median / max |
| --- | ---: | ---: |
| 4 / 1 / 47 | 25.28 / 0.45 ms | 21.70 / 0.60 / 1.20 ms |
| 12 / 7 / 335 | 25.51 / 5.96 ms | 22.90 / 6.10 / 6.60 ms |
| 24 / 14 / 671 | 46.92 / 12.51 ms | 31.70 / 13.80 / 16.40 ms |
| 32 / 31 / 1487 | 81.18 / 45.53 ms | 73.00 / 36.40 / 45.90 ms |

No worker was introduced: typical queries remain within one-to-two frame intervals and custom queries run on explicit actions rather than live ticks. The measured cap can briefly pause the main thread; it is not claimed smooth at 60 Hz. Provisional query budgets: <=50 ms first query at 24/14 and <=100 ms at 32/31 on this host. These workloads pass; the allowed 5000-start/eight-interval worst case is unprofiled. Heap/RSS include GC/runtime retention, not native app memory. Frontend drag/idle measurements and outstanding native resource budgets are in [PERFORMANCE.md](PERFORMANCE.md) and [raw frontend evidence](evidence/milestone-3/frontend-performance.json).

Final frontend harness: live/planning sampled private memory **352.69/247.08 MiB**, total-machine CPU estimates **7.98%/0.69%** over **22.71/22.50 s**. Drag commit-to-next-frame proxy p50/p95/max **16.8/16.9/17.0 ms**, frame p95 **16.8 ms**, **59/59** outside moves captured, **36** committed snapped updates, **zero** drag long tasks/page errors/external requests, **428/428** domain probes. Changing process sets and headless overhead mean CPU is a short-run lower-bound estimate; native CPU/memory budgets remain unmet/unverified. This does not certify input-to-photon latency.

## Dependencies/security

Manifest and lockfile unchanged; no runtime/dev dependency added or upgraded. Existing runtime notices are unchanged. Fresh production audit is zero; full audit retains braces 3.0.3, micromatch 4.0.8, chokidar 3.6.0, fast-glob 3.3.3 and Tailwind 3.4.17 as five high development findings. [BUILD_ADVISORIES.md](BUILD_ADVISORIES.md) explains their single root stack-exhaustion issue, hostile build/glob input conditions and compatible-patch/reviewed-fork/separately-approved migration options. No forced styling migration. Scheduling stays offline and accepts no build patterns.

## Modified files

Root: `H:/Projects/Longitude`. [Complete machine-readable inventory](evidence/milestone-3/modified-files.json) includes generated evidence.

| Files | Purpose |
| --- | --- |
| `.gitignore` (baseline preparation) | Reviewed env/log/OS/build exclusions. |
| `src/lib/schedule.ts`, new `schedule.test.ts` | Exact compiler/coverage/intersection/search/scoring/validation/cache and 72 tests. |
| `src/App.tsx`, new `src/components/PlannerSearchControls.tsx` | Filters, reasons, custom duration, stable search proximity and 32-location UI cap. |
| `src/components/TimezoneList.tsx` | Multi-interval editor, start weekdays, sleep warnings and scrolling. |
| `src/components/SettingsPanel.tsx` | Validated default-hours draft. |
| `src/components/MeetingOverlapIndicator.tsx` | Exact coverage tooltip on existing rows. |
| `src/components/TimezoneTimeline.tsx`, `TimezoneRow.tsx` | Exact colors/strips, preserved cells/labels. |
| `docs-index.d.ts` | Public split-interval configuration. |
| `tests/browser/fixture.tsx`, new `scheduling.spec.ts`, `visual.spec.ts`, `interactions.spec.ts`, `playwright.config.ts` | Scheduling fixtures/cases, reviewed screenshots/current report paths; existing worker/retry/browser policy. |
| New `scripts/check-scheduling-regressions.mjs`, `measure-scheduling.mjs` | Baseline proof and Node/Edge benchmark. |
| `scripts/capture-visual.mjs`, `compare-visual.mjs`, `measure-performance.mjs` | Milestone-specific evidence and labels. |
| New `docs/MILESTONE_3.md`, `SCHEDULING_ENGINE.md` | Delivery and algorithm documentation. |
| `README.md`, `docs/ARCHITECTURE.md`, `IMPLEMENTATION_PLAN.md`, `IMPLEMENTATION_AUDIT.md`, `TESTING.md`, `TIMEZONE_ENGINE.md`, `PERFORMANCE.md`, `DEPENDENCIES.md`, `BUILD_ADVISORIES.md` | Status, verification, performance/security and approval boundary. |
| New `docs/evidence/milestone-3/` | Reports, measurements, before/after PNGs/metadata, corrected goldens, gallery and inventory. |

Timezone files/tests, clock/readout pointer behavior, store/reducer, platform interface, style/token/font files and Tailwind config match baseline. Builds, traces and temporary measurement bundles remain ignored. No native or durable-persistence implementation.

## Remaining limits

- **Both original defects are resolved.** No known required-test failure remains in exercised scenarios.
- Bounded candidate grid, not continuous optimization: at most 32 people, eight intervals, 31 elapsed days, 5000 starts and 1440-minute duration. The measured maximum uses 1487 starts; full worst-case performance remains unprofiled.
- All work intervals share start weekdays. No per-date exceptions, per-interval day sets, public holiday feed or calendar busy/free data. Sleep precedence is explicit.
- UI fairness has equal prior burden; filters are session state/reset on group/view unmount. Recommendations can use a subset while group-wide suitability/share remains whole-group, disclosed in the dialog.
- Extreme queries can briefly block the main thread. Native CPU/memory, physical touch/IME, full screen-reader, high-DPI, 120Hz and multi-monitor behavior remain unverified.
- Five high development advisories/stale Browserslist data remain documented; production audit is zero.
- Runtime tzdb and the timezone engine's six-hour transition separation assumption remain. Scheduling reserves two days inside the instant envelope for neighboring civil dates.
- Tauri, actual second window/tray/caption integration, installer and validated durable hydration remain later milestones. No macOS runtime claim.

**Await approval before Milestone 4.**
