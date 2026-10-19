# Testing — Milestone 5B

## Milestone 6 verification

M6 is approved; stop before Milestone 7. [MILESTONE_6.md](MILESTONE_6.md) is the current authority for exact final runs and platform status; 5A/5B totals below remain historical. New coverage includes independently parsed UTC ICS, escaping/UTF-8 folding, Unicode/control inputs, stable export sessions, both bounded recurrence bases and persistence across sheet reopening, spring/fall/half-hour/skipped-date cases, four matching copy previews, errors/cancellation/download results, selected-instant synchronization and main-only native permissions. Existing timezone/scheduling/persistence suites remain intact.

Use `npm run typecheck`, `npm test`, `npm run test:browser`, `npm run build`, `cargo fmt --manifest-path src-tauri/Cargo.toml --check` and `npm run desktop:test` after Tauri CLI preparation. Default browser evidence now belongs to milestone-6. Nine main screenshots are strict assertions; the reviewed planner DST-copy expectation is separate from its retained before-image. `scripts/verify-native-sharing.mjs` checks the actual Windows OS clipboard and awaits native Cancel/Save actions in an isolated debug directory; it is an interactive harness, not an unattended mock. `scripts/test-native.mjs` retains shared desktop regressions. Never run two native harnesses or process-tree performance trials concurrently.

Mac CI tests the shared serializers/engines/adapters and real temporary-file Rust paths on both targets, plus WebKit interactions and .app/DMG construction. Native pasteboard/Save panel/TCC denial, physical Mac inputs and manual calendar imports remain unverified. Picker cancellation tests do not certify every OS-dialog failure mode. The failed Windows external-lock fixture is retained and is not a native denial pass. See [ICS specification](ICS_EXPORT.md) and [Mac acceptance](MACOS_ACCEPTANCE.md).

## Current native-verification follow-up

The [mandatory audit](evidence/milestone-5b-followup/AUDIT.md) preceded application changes. Fresh results are isolated under `docs/evidence/milestone-5b-followup/`; previous totals below are historical. **696 unit tests, 84 browser tests, 33 Rust tests and 29 actual Windows native checks pass. Nine strict screenshot assertions and nine independent pixel comparisons retain zero changed pixels. Three new browser cases cover WebKit first-click/caret editing, modal keys with body focused, and the neutral native Mac widget close control.** Four capability tests guard exact command/window allowlists, main-only hydration, no remote/generic OS access and production CSP. Rust adds shortcut aliases, bare typing/invalid keys, reserved Mac chords and native appearance policy. The Windows conflict test now uses an independent native process holding a real chord; its earlier alias-only check was insufficient evidence of an external conflict.

The first actual hosted Mac run failed at Tauri's build-script allowlist before Rust tests: a named feature forwarding `tauri/macos-private-api` did not satisfy its static direct-dependency check. CI now invokes the official CLI to prepare/build the debug target before direct Cargo tests. Final run 39269770931 passes on both ARM64 and Intel: each has 696 unit, 33 Rust and 75 WebKit tests, plus typecheck, frontend/debug/release builds, formatting and .app/DMG inspection. Native Mac smoke tests remain Blocked. Full architecture evidence belongs to [MILESTONE_5B.md](MILESTONE_5B.md).

For a fresh Mac checkout, run `npm ci`, then `npm exec tauri build -- --debug --no-bundle --target aarch64-apple-darwin`, then `cargo test --manifest-path src-tauri/Cargo.toml --locked --target aarch64-apple-darwin --features macos-transparency`. Substitute the Intel target as appropriate. `npm run desktop:test` works after the CLI prepares the host manifest. Mac CI includes this prerequisite. Native WKWebView input, login/permission denial, Retina/Spaces/IME and ten-minute resource measurements still require [physical acceptance](MACOS_ACCEPTANCE.md); each unexecuted item is Blocked, not Pass.

Current results are separated in [MILESTONE_5B.md](MILESTONE_5B.md). New defaults tests preserve saved Mac shortcuts; Rust policy tests cover Dock/tray close and recovery reachability, and Tauri's own parser validates both merged target configurations. Menu construction type-checks on Windows, but actual AppKit execution still requires Mac. Browser header tests reserve native-traffic-light space and preserve the existing HTML preview; they do not simulate native controls.

Browser output defaults to `docs/evidence/milestone-5b/`. Set `LONGITUDE_EVIDENCE_ROOT` to a relative output directory for browser/native checks without overwriting historical evidence. Mac CI uses `LONGITUDE_BROWSER=webkit`: shared interactions/persistence/restart run in Playwright WebKit while the nine Edge screenshot baselines are explicitly excluded. This is separate from system WKWebView/native acceptance. See [MACOS_ACCEPTANCE.md](MACOS_ACCEPTANCE.md) for hardware, physical input, lifecycle, permissions, Retina/Spaces, performance and distribution requirements. CI configuration is not an executed test result.

Current Windows integration results are in [MILESTONE_5A.md](MILESTONE_5A.md): shared/bridge unit tests, 79 retained browser regressions, Rust authority/storage/placement tests and actual executable/WebView2 tests. `npm run desktop:test` exercises temporary native files; `node scripts/test-native.mjs` requires a freshly built debug executable and an unused loopback port 9224. It runs isolated native/WebView profiles. `node scripts/measure-native.mjs` measures the release executable with a 60-second warmup and 120-second live/planning windows; run it after builds/tests stop. Native helper capture/input limitations and physical tray/monitor checks are disclosed separately.

The Milestone 4 counts and methods below are retained as historical results, not the current total. Shared timezone, scheduling, persistence and browser interaction checks remain required on Windows and future macOS integration. No macOS runtime claim follows from Windows or CI tests.

Current result: **676 unit tests in eight files passed; 79 browser tests passed, zero skipped/flaky/unexpected**. The Milestone 3 counts below remain historical. [Raw unit results](evidence/milestone-4/unit-results.json), [browser results](evidence/milestone-4/browser-results.json) and [complete report](MILESTONE_4.md).

Persistence adds schema roundtrips/migrations, invalid versions/JSON/zones, duplicate IDs, partial settings/metadata repair, read/commit failures, interrupted commits, retained recovery, revision limits, conditional-write conflicts, ordered in-flight updates and adapter boundaries. Browser tests cover preferences, full schedules/groups, favorites, delayed hydration/StrictMode, rapid and immediate-reload updates, fail/retry/session-only flows, stale tabs, legacy bytes and a real isolated Edge profile restart. A maximum-workload browser test compares worker results against the synchronous reference. Original timezone, drag capture/accessibility and exact scheduling checks remain passing.

Run `npm test`, `npm run test:browser`, `npm run build`, `npm run build:prototype`. Regenerate stress measurements with `node scripts/stress-scheduling.mjs` then `node scripts/stress-scheduling-worker.mjs`; production frontend measurements use `node scripts/measure-performance.mjs --site=milestone-4 --out=docs/evidence/milestone-4/frontend-performance.json`. Run measurements without concurrent builds/tests. These scripts measure browser implementations, not native filesystem crash guarantees.

Milestone 4 visual baseline reuses the nine committed approved Milestone 3 after-images rather than claiming a fresh before capture. All nine strict screenshot assertions pass with zero permitted differing pixels; the separate RGBA comparison also reports zero changes. [Gallery](evidence/milestone-4/visual/index.html), [provenance](evidence/milestone-4/visual/provenance.json). Never replace goldens merely to make a failure pass.

Requires Node 24/npm 11 and installed Microsoft Edge. `npm ci --ignore-scripts` restores the pinned dependencies. No browser download is needed. Use:

```powershell
npm test
npm run typecheck
npm run test:browser
npm run build
npm run build:prototype
node scripts/check-scheduling-regressions.mjs
node scripts/measure-scheduling.mjs
npm run perf -- --site=milestone-3 --out=docs/evidence/milestone-3/frontend-performance.json
npm audit --omit=dev
npm audit
```

Exact final outcomes are in [MILESTONE_3.md](MILESTONE_3.md), with raw [unit](evidence/milestone-3/unit-results.json) and [browser](evidence/milestone-3/browser-results.json) reports. Historical [Milestone 1](MILESTONE_1.md) and [Milestone 2](MILESTONE_2.md) results remain intact.

Final Milestone 3: **623/623 unit tests, five files, 2.14 s**; **59/59 Edge tests, 64.309707 s, zero skips/flaky/retries**. Typecheck, production/export builds and baseline defect comparisons pass. Full audit retains five documented high dev findings; production audit is zero.

## Unit and reference coverage

All 551 Milestone 2 tests remain: five original time tests, 516 timezone foundation tests, 19 axis/selection tests and 11 portable-domain cases. They cover strict Gregorian/instant/zone validation, known absolute fixtures, all runtime zones, explicit folds/gaps, unusual civil days, historical seconds, transition-cache freshness and import boundaries. Intl/Temporal consistency is not independent verification of ICU's tzdb.

`schedule.test.ts` adds permanent overnight attribution and duration regressions, one-millisecond end crossings, exact non-grid endpoints, short sleep intervals, split/unioned shifts, Sun–Thu weekends, empty days, sleep conflicts, full/fractional DST days, narrow repeated intervals, nonexistent-only work and skipped dates. An independent slow wall-minute oracle compares every minute across ten full zone/date scenarios and multiple meeting durations; a separate brute-force candidate oracle compares complete numeric scores/order for a 47-minute meeting. Explicit second/millisecond fixtures supplement its minute resolution. Tests cover participant subsets, full-duration preferred/minimum filters, shared minutes, fairness with explicit prior burdens, deterministic ties/reordered participants, cache mutation/config invalidation, invalid types/dates/zones and bounded inputs/searches.

`node scripts/check-scheduling-regressions.mjs` bundles the committed Milestone 2 scheduler and current scheduler against the same unchanged timezone engine, reproducing both defects before and asserting expected results after. [Raw before/after assertions](evidence/milestone-3/audit-regressions.json). It requires the preserved local baseline commit.

## Real browser checks

The isolated Vite fixture mounts actual components with deterministic time/state. It is built into ignored `browser-test-dist/`, served only on loopback port 4175 and excluded from production. Tests use one Edge worker, no retries, fixed Asia/Singapore browser timezone and exact selected instants. JSON evidence now writes under `docs/evidence/milestone-3/`; earlier reports are not overwritten.

All 38 Milestone 2 interaction cases remain: shared instant, planning stability/live midnight, pointer capture outside the dial, multiple/reverse revolutions, hour hand, cancel/lost capture, click/double-click, 1/5-minute/wheel/key paths, direct entry/AM-PM/date/fold/gap, fractional zones, widget timeout, focus through ticks, dialogs/search/group/row keyboard actions, reduced motion and narrow popups.

Twelve scheduling cases verify integrated overnight attribution, complete-duration verdicts, editing/retaining split shifts, disabled working days, invalid endpoints, sleep warnings, eight-interval scrolling, custom duration plus subset/date/preferred/minimum/fairness controls, empty/no-feasible results, invalid default protection, Lord Howe repeated-hour coverage, 380/850px dialog bounds/focus and exact sub-hour track/strip shading. Nine screenshot cases complete the browser suite.

## Visual evidence and baseline policy

Milestone 3 before images were captured from the approved Milestone 2 source after the baseline commit and before scheduler changes. Inspect [before/after gallery](evidence/milestone-3/visual/index.html) and [comparison JSON](evidence/milestone-3/visual/comparison.json). Same fixed times, viewports, installed Edge, locally loaded Geist and disabled screenshot animation.

Four scenarios remain pixel-identical: settings, narrow clock, compact widget and London fall-back. Four clock variants change only exact half-hour band colors (860–878 pixels, under 0.185%). The planner changes required search/reason controls, exact shading and recommendation values/rank (9368 pixels, 1.9681%). Geometry, typography, colors and animations are preserved. Additional screenshots show the new search/date controls.

The five intentional corrections were visually reviewed before copying separate goldens into `visual/expected/`; all original `before/` evidence remains. Tests assert zero perceptual differing pixels against the appropriate before or reviewed golden, threshold 0.1. The separate RGBA comparison counts any channel delta >16. Use `node scripts/compare-visual.mjs milestone-3` to regenerate counts/gallery. Do not overwrite delivered before images or update snapshots automatically during routine verification.

## Limits

There are no remaining known overnight/duration failures. Search is an exact-coverage evaluation over a bounded candidate grid, not an exhaustive continuous optimizer. No calendars, public holiday database, historical meeting burden or durable search preferences are inferred. Native window, physical input/IME, full screen-reader, high-DPI/multi-monitor and macOS checks remain later work. Browser/Node performance does not certify native CPU/memory budgets. See [SCHEDULING_ENGINE.md](SCHEDULING_ENGINE.md) and [PERFORMANCE.md](PERFORMANCE.md).

Production audit remains separate from the full audit. Five high development-only inherited findings still intentionally produce full-audit exit 1; no dependency was added or changed in Milestone 3. [BUILD_ADVISORIES.md](BUILD_ADVISORIES.md) records package versions, exploit conditions and remediation options.
