# Milestone 4 — Persistence and Saved Configuration

Date: October 19, 2026 (Asia/Singapore). Approved Milestone 3 source baseline: `8dda477cc7ca46aca6b58abc5b0f672e1906eaa6`. Milestone 4 is ready for review. **Stop here; Milestone 5 has not begun.**

## Changes

Browser persistence is enabled behind the existing platform boundary. A versioned schema validates groups, ordered timezone locations, custom labels, favorites, references, participant workdays, split/overnight intervals, sleep preferences, settings and meeting defaults. Legacy snapshots migrate without modifying their original key. Deep defaults and partial repair preserve usable fields, while unreadable data retains recovery bytes. Unknown future formats pause saving.

An asynchronous hydration gate prevents fallback defaults from overwriting saved settings. Read failures offer Retry or explicit session-only use. Serialized compare-and-swap commits coalesce rapid updates and retain the latest snapshot during in-flight writes/failures. Competing tabs stop on stale writes instead of silently replacing each other. Current/previous/recovery data commit as one atomic browser record. Live time, manual selection and temporary meeting searches remain outside durable preferences.

The existing location menu gains a favorite action, used by the existing compact widget. Recovery/loading/error messages and a large-search progress message are the other minimal UI additions. Claude Design components, layout, typography, style tokens, animations, dial and direct-entry interactions remain intact. Canonicalized same-zone city matching avoids duplicate detection errors after reload. A sparse subset input validation gap found during review is fixed without changing scheduling semantics.

Maximum-workload measurements justified a disposable local worker for searches above 8000 participant/candidate evaluations. It imports the established scheduling/timezone engine; there is no second timezone system. Results match the synchronous reference. Workers terminate on result/error/cancel; stale results are ignored. Smaller searches remain direct. No dependency, backend, cloud synchronization, account or telemetry was added.

## Architecture and scope

[PERSISTENCE.md](PERSISTENCE.md) documents schema/envelope fields, migration/default rules, bounds, backup/recovery behavior, hydration, ordering, conflicts, security and platform contracts. [SCHEDULING_ENGINE.md](SCHEDULING_ENGINE.md) retains the scheduling algorithm and scoring policy.

The browser adapter is implemented and tested. The injected **Tauri 2 adapter is a command contract with fake-host tests**, not a native storage implementation. No Tauri host, Rust project, permissions or filesystem capability has been introduced. A future host must implement fixed app-config paths, process locking, flush and atomic conditional replacement. Native durability and macOS behavior remain unverified. Saving native window preferences does not implement native pinning/tray/window geometry. These distinctions preserve the existing platform boundary without beginning Milestone 5.

## Exact verification results

| Check | Result |
| --- | --- |
| `npm run test -- --reporter=default --reporter=json --outputFile=docs/evidence/milestone-4/unit-results.json` | Exit 0; **676 passed**, 0 failed/pending, eight files, reported duration **4.10 s**. [Raw](evidence/milestone-4/unit-results.json). |
| `npm run test:browser` | Exit 0; **79 passed**, 0 skipped/unexpected/flaky, **106943.36 ms**. Installed headless Edge 155.0.4283.62, one worker, no retries. [Raw](evidence/milestone-4/browser-results.json). |
| `npm run build` | Exit 0; strict typecheck and Vite build pass, 1585 modules, Vite **1.91 s**. JS **447.48 kB / 139.11 kB gzip**, CSS **23.77 / 5.97 kB**, separate worker **171.90 kB**. |
| `npm run build:prototype` | Exit 0; original export pipeline passes; CSS compilation **759 ms**; app bundle 312K / CSS 20K plus separate worker. Existing stale Browserslist database notice remains. Original `prototype/` assets are unchanged. |
| Nine screenshot scenarios | All strict Playwright assertions pass, zero allowed differing pixels. Separate RGBA comparison reports **0 changed pixels in all nine**. [Gallery](evidence/milestone-4/visual/index.html), [counts](evidence/milestone-4/visual/comparison.json), [provenance](evidence/milestone-4/visual/provenance.json). |
| Browser domain/performance probe | **428 checks**, 0 failures, 418 runtime zones, 0 page exceptions/external requests. [Raw](evidence/milestone-4/frontend-performance.json). |
| Dependency audits | Production exit 0: **0** vulnerabilities. Full exit 1: **5 high**, 0 moderate/critical/low; existing development-only chain. [Full](evidence/milestone-4/npm-audit-all.json), [production](evidence/milestone-4/npm-audit-production.json). |

Unit breakdown: timezone foundation 516; scheduling 73; persistence/schema/repository/state/native-contract 41; time axis 19; original time tests 5; worker client 7; domain boundaries 11; web storage 4. The approved Milestones 1–3 checks remain passing, including overnight weekday attribution, full-duration coverage, independent reference comparisons and outside-dial capture/keyboard/direct-entry tests.

New tests cover malformed JSON, unsupported/invalid schema versions, duplicate IDs, invalid zones, migration failure, partially corrupted settings/record metadata, damaged head with valid previous snapshot, nested retained recovery, schema size bounds, read and atomic commit failure, interrupted writes, 100 rapid updates, in-flight latest-write ordering, stale-tab conflicts and native key restrictions. Browser checks cover saved groups/preferences/schedules/favorites, delayed hydration/StrictMode, read-error retry and explicit session-only operation, failure/retry latest state, immediate reload, fresh-page reload, legacy preservation and an actual Edge process close/relaunch using an isolated persistent profile. Worker tests cover cancellation/errors/resources and the real maximum workload.

During development an immediate-reload test caught loss from a 250 ms debounce. Microtask coalescing plus durable-state layout effects fixed it. A test fixture initially mounted two persistent applications; setup now mounts once. Vite worker detection required a direct `new Worker(new URL(...))` expression; actual-worker browser verification covers the corrected build. These were resolved before the final passing runs. Interrupted-write tests exercise adapter atomicity, not a physical power-loss experiment.

## Scheduling stress measurements

Measured on Intel Core i5-6500 @ 3.20 GHz, four cores/threads, **17,067,753,472 bytes RAM (15.90 GiB)**, MSI MS-7A70, Windows 10 Pro 19045, Intel HD Graphics 530 driver 31.0.101.2111, Node 24.15.0 and installed Edge 155.0.4283.62. All measurements are local headless browser measurements, not Tauri/WebView2 native certification.

The workload has exactly **5000 candidate starts, 32 participants, eight intervals per participant**, eight zones including fractional offsets and DST boundaries, 47-minute meetings and 8-minute candidate steps over about 27.8 days. Participants have distinct work configurations. See the executable scripts and raw [synchronous](evidence/milestone-4/scheduling-stress-before.json) / [worker](evidence/milestone-4/scheduling-stress-worker.json) evidence.

| Measurement, runs 1 / 2 / 3 | Synchronous main thread | Disposable worker |
| --- | --- | --- |
| End-to-end query latency | 287.2 / 145.9 / 119.5 ms | 487.9 / 319.2 / 306.9 ms |
| Main-thread timer blocking/drift | 287.6 / 145.9 / 119.6 ms (zero-delay probe) | 15.5 / 1.6 / 1.5 ms maximum drift (10 ms heartbeat) |
| Main-thread Long Tasks | 287 / 146 / 119 ms | None observed |
| Main JS heap | 1.77 MiB before first; 19.67 / 34.63 / 49.45 MiB after runs | 5.04 MiB before first; 5.08 / 5.10 / 5.13 MiB after runs |

The timer probes differ and are not identical latency metrics; Long Tasks demonstrate the blocking directly. Warm synchronous runs reuse engine caches; each worker run starts a new engine. Startup/compilation/message costs increase worker latency while keeping the main thread available. Worker numeric scores and result instants equal the synchronous reference in all three runs.

Worker heap is excluded from main-heap samples. A separate process-memory sampling run includes it: browser private bytes **257.79 MiB before**, **263.11 MiB observed with worker alive**, **246.63 MiB after**. Only **one of 60 samples** intersected the brief worker lifetime; this is a sampled value, **not a continuous peak or isolated worker allocation**. Raw process working sets and samples are retained. GC/engine caches influence heap growth; three runs do not establish a leak. Memory sampling was separate from timing to avoid PowerShell sampling contention. No worker pool, server or new infrastructure was introduced.

## Frontend performance

Final production build, original four-location live/planning view, 850×560, locally bundled Geist, three-second warmup, roughly 23-second windows. [Raw hardware/process/drag evidence](evidence/milestone-4/frontend-performance.json).

| Measure | Milestone 4 |
| --- | --- |
| Live CPU, total machine / one core estimate | **10.78% / 43.10%** |
| Planning CPU, total machine / one core estimate | **0.52% / 2.06%** |
| Sampled private memory, live / planning | **352.02 / 247.60 MiB** |
| Renderer task time, live / planning | **16.45 / 7.64 ms per second** |
| Pointer event → next frame p95 | **0.60 ms** |
| Event → observed commit/frame p95 | **17.0 ms**, 36 observed commits |
| Frame interval p95 / maximum | **16.8 / 17.0 ms** |
| Drag capture | **59 of 59 outside moves captured**, 120 moves; no Long Tasks |

CPU/private-memory targets remain **unmet/unverified**. Milestone 3's comparable short run measured live CPU 7.98%, planning 0.69%; this run has higher live CPU and lower planning CPU. These single short runs include browser subprocess startup/churn (14→9→7 processes), are not stable-process trials and cannot establish causation or a native regression/pass. CPU uses observed process peaks and can miss exited work; private memory is a sampled aggregate; working sets include shared pages. A longer warmup, repeated quiet-host trials and actual native profiling remain required. No performance budget was relaxed. Drag proxies remain within provisional targets; they are not input-to-photon measurements.

## Visual preservation

Before images are the nine committed, approved Milestone 3 after-images from baseline `8dda477`, reused with recorded provenance. They are not described as newly captured M4-before images. Final M4 screenshots use the same fixed times, Edge version, viewports, local font and disabled screenshot animation. Dark/light/planning clocks, planner/settings, narrow/compact views, London fold and Kathmandu all report zero changed pixels. The separate RGBA report uses channel delta >16; strict Playwright comparisons also pass. Error-only storage notices and favorite menu additions are functionally tested; the nine-image comparison is not a claim that every possible UI state was captured.

## Modified-file inventory and dependencies

The complete [machine-readable inventory](evidence/milestone-4/modified-files.json) includes all evidence files. Main changes:

- `src/persistence/`: schema, repository, storage interface, web/Tauri-command adapters and tests.
- `src/state/store.tsx`, `src/platform.ts`, `src/main.tsx`: hydration, durable selection and platform integration.
- `src/App.tsx`, `src/components/TimezoneList.tsx`, `src/components/TimezoneSearch.tsx`: notices, saved favorites, canonical city matching and worker search integration.
- `src/scheduling/`: worker/client/hook and tests; `src/lib/schedule.ts` / test: sparse subset validation regression.
- `tests/browser/`: persistence/restart/worker suites, isolated fault fixture and M4 screenshot routing; `playwright.config.ts`.
- `build.mjs`, performance/stress/capture/compare scripts: dual pipeline worker bundling and M4 measurement/evidence support.
- README, docs index and architecture/persistence/scheduling/testing/performance/dependency/security/readiness/plan/audit documentation; this report and `docs/evidence/milestone-4/`.

No manifest/lockfile/dependency changes. The same five high development-only findings affect braces, micromatch, chokidar, fast-glob and Tailwind; see [BUILD_ADVISORIES.md](BUILD_ADVISORIES.md) for severity, exploit conditions and remediation options. Production audit remains zero. Existing runtime licenses/notices are unchanged. Only trusted build globs reach the affected chain; that exposure assessment does not fix the advisory.

## Remaining limitations

- Native Tauri host/atomic disk implementation, permissions, actual window preferences and macOS runtime validation remain pending. No native power-loss test is claimed.
- Browser data is unencrypted, origin/profile-specific and removable with site data. Web Locks are required for safe writes. Future packaged-origin migration/export is not implemented.
- Competing tabs require reload; no automatic merge. Recovery is bounded and retained internally; no recovery-file viewer/export UI. Quota/recovery-size exhaustion pauses saving with original bytes intact.
- Immediate browser reload is covered, but abrupt termination can still lose an asynchronous write not yet committed. Failed reads never trigger automatic replacement.
- Idle CPU/memory native targets remain unverified; the short live CPU measurement is higher than M3. Worker memory evidence is sampled, and worker startup increases query latency.
- Existing scheduling grid/tzdb assumptions and lack of actual calendar busy/free data, holidays and fairness history remain. Recommendations are suitability suggestions, never confirmed availability.
- No installer, native accessibility/high-DPI/multi-monitor or macOS certification. No Milestone 5 implementation was started.
