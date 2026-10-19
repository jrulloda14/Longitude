# Testing — Milestone 3

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
