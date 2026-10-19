# Milestone 2 — Interactive Frontend Integration

Delivered for review October 19, 2026. Milestone 1 was provisionally approved and Milestone 2 authorized. **Work stops here. Milestone 3 has not begun and requires approval.**

## Changes

- Kept Claude Design's component structure, style/token/font files, colors, typography and hand/motion interactions. Existing readout text gains keyboard-operable AM/PM and date controls; no replacement frontend or infrastructure was introduced.
- Dial, readout, timezone rows, timeline, search preview and compact browser widget consume the App's authoritative `at`. Planning selections survive live ticks and reference changes. Now/Home/N/double-click restore live mode. The widget inherits planning selection and retains its original explicit preview timeout behavior.
- Date arrows and dial day keys preserve civil time through DST. Direct entry validates input, explains gaps and offers both fold occurrences. The timeline uses the actual containing day (23/25 and fractional-hour days), civil tick positions, real offset-change boundaries and distinct repeated-hour offsets. Row cursors use their actual local-day length.
- Local-minute snapping supports 1/5-minute precision, including fractional offsets and historical second offsets. Continuous pointer calculations are rounded to integer epoch milliseconds before strict validation. Pointer capture, movement outside the dial, multiple revolutions, hour-hand scale, cancel/lost-capture cleanup and existing easing behavior are preserved.
- Fixed focus effects restarting during live ticks, fast-input replacement races, group/search/row keyboard behavior and narrow date-popup overflow. Memoized axis/day-strip work and stopped closed-search work without changing scheduling algorithms.
- Added portable helpers, comprehensive real-browser regressions, fixed-time before/after evidence and same-harness performance measurements. The Milestone 1 timezone engine and its tests remain unchanged. No Windows/Tauri imports enter domain logic.

## Exact verification results

Final runs on the recorded Windows 10 / Node 24.15.0 host:

| Command | Exact result |
| --- | --- |
| `npm test` | Exit 0; **551 passed, 4 test files, 0 failed**, 2.73 s. All 530 Milestone 1 tests retained; 19 helper tests plus two automatically enumerated import-boundary cases. |
| `npm run test:browser` | Exit 0; **47 passed, 0 failed, 0 skipped, 0 flaky, zero retries**, 53.2 s; 38 interaction + 9 visual tests, installed Edge 155.0.4283.62, one worker. [Raw report](evidence/milestone-2/browser-results.json). |
| `npm run build` | Exit 0; strict TypeScript check passed; Vite 1579 modules, 3.17 s; runtime notices generated for nine packages. JS 417.09 kB / 129.17 kB gzip, CSS 23.40 / 5.87 kB. |
| `npm run build:prototype` | Exit 0; original esbuild/Tailwind pipeline passed; Tailwind 675 ms; rounded output bundle.js 281K / bundle.css 20K. Runtime notices generated. |
| `node scripts/compare-visual.mjs` | Exit 0; eight scenarios zero changed pixels, one intentional DST correction as detailed below. |
| `npm audit --omit=dev --json` | Exit 0; **0 vulnerabilities**. [Raw production report](evidence/milestone-2/npm-audit-production.json). |
| `npm audit --json` | Exit 1; **5 high, 0 moderate, 0 critical** development findings; documented outstanding condition, not a passing full audit. [Raw full report](evidence/milestone-2/npm-audit-all.json). |
| Performance script, saved Milestone 1 and final Milestone 2 builds | Both exit 0; each **428/428** domain checks, 59/59 captured outside moves, 36 committed snapped updates, 0 uncaught exceptions, 0 external requests, 0 drag long tasks over 50 ms. |

Build output includes non-fatal plugin timing and stale caniuse-lite database notices; browser tooling reports the environment's NO_COLOR/FORCE_COLOR conflict. These do not represent assertion failures. No snapshot-update flag was used in the final browser run.

Tests cover shared selection, live midnight/planning isolation, pointer lifecycle and multi-revolution drag, 1/5-minute drag/wheel/keyboard, direct 12/24-hour entry and AM/PM, date/DST/leap behavior, fold alternatives, fractional zones, timeline synchronization, widget handoff/timeout, focus/tab/menu/search/row access, reduced motion and 380/850 px date popup bounds. See [TESTING.md](TESTING.md) for reproducibility and scope limits.

## Visual regression evidence

[Before/after gallery](evidence/milestone-2/visual/index.html), [counts and bounds](evidence/milestone-2/visual/comparison.json), [baseline metadata](evidence/milestone-2/visual/before/metadata.json).

Before evidence was captured before implementation using actual Milestone 1 source and the same deterministic fixture. Same Edge, local Geist, fixed instants and geometry are used after integration. Dark clock, light clock, planning clock, planner, settings, 380px clock, compact widget and Kathmandu are **pixel-identical: 0 changed pixels**. London fall-back changes **681 pixels / 0.143067%**, within x538–768/y108–265, correcting civil-hour labels and participant day-strip cursor positions on a 25-hour day. Reviewed before/after images confirm those intended changes. The original image is preserved; the corrected separately reviewed golden is used only for this scenario. Screenshot assertions disable animation for determinism; interaction tests separately verify easing/reduced-motion classes.

Additional date-picker screenshots at [380 px](evidence/milestone-2/visual/after/date-picker-380.png) and [850 px](evidence/milestone-2/visual/after/date-picker-850.png) show the minimal new control and are checked for viewport containment. These have no prior open-control baseline.

## Performance

Actual hardware: Intel Core i5-6500 3.20 GHz, four cores/four logical processors; 17,067,753,472 bytes RAM (~15.90 GiB); MSI MS-7A70; Windows 10 Pro 19045; Intel HD 530 driver 31.0.101.2111; headless Edge 155.0.4283.62. Node 24.15.0 / ICU 78.2 / tzdb 2026a. Both builds measured sequentially with builds/tests stopped. Full method, raw samples, hardware and provisional budgets: [PERFORMANCE.md](PERFORMANCE.md).

| Metric | Saved Milestone 1 | Milestone 2 |
| --- | ---: | ---: |
| Live CPU, total-machine short-run estimate | 8.36% | 9.59% |
| Planning CPU, total-machine short-run estimate | 1.33% | 0.59% |
| Live / planning peak sampled private memory | 361.26 / 256.29 MiB | 370.77 / 258.10 MiB |
| Input to committed-value next frame p50 / p95 / max | 16.8 / 22.0 / 27.6 ms | 16.7 / 17.6 / 30.0 ms |
| Frame interval p95 / max | 16.8 / 16.9 ms | 16.9 / 17.3 ms |

These are one short headless-browser run per build, with changing process sets. Updated CPU accounting retains observed exited processes, so the comparison uses two new runs under that same method; historical Milestone 1 CPU numbers use different accounting. No statistically established improvement or native certification is claimed. Live CPU is higher in this run; private memory is slightly higher. Interaction budgets pass for this workload; CPU/memory targets remain unmet/unverified for native delivery.

## Dependencies

Added **development-only `@playwright/test 1.64.1`**, resolving three packages including `playwright` and `playwright-core` at the same version. Reviewed before install for necessity, Microsoft maintenance, Apache-2.0 license, Node compatibility and security; installed with scripts disabled and existing Edge, no browser download. No runtime dependency changes. See [DEPENDENCIES.md](DEPENDENCIES.md).

[BUILD_ADVISORIES.md](BUILD_ADVISORIES.md) documents `braces 3.0.3`, `micromatch 4.0.8`, `chokidar 3.6.0`, `fast-glob 3.3.3` and `tailwindcss 3.4.17`: each reported high, one root brace-pattern stack-exhaustion advisory. It explains attacker-controlled build/glob input conditions and compatible-patch, reviewed fork and separately approved major-migration options. No patched braces release is identified by the resolved audit. No forced Tailwind migration was performed.

## Modified and added files

Paths are relative to `H:/Projects/Longitude/`; no Git repository exists, so this inventory records the work performed rather than a Git diff.

| Files | Purpose |
| --- | --- |
| `src/App.tsx` | Authoritative selection wiring, controlled widget, civil day bounds, memoized overlap, current suggestion dependency and resize attachment. |
| `src/components/InteractiveClock.tsx` | Integer/local snapping, civil day keys, click selection, capture cleanup and offset accessibility text. |
| `src/components/TimeReadout.tsx` | Accessible AM/PM/date choice, civil date navigation, input selection/focus and gap/fold handling. |
| `src/components/TimezoneTimeline.tsx` | Actual-day absolute geometry, fractional/repeated-hour labels, memoization, captured selection and keyboard range. |
| `src/components/TimezoneRow.tsx` | Actual local-day strip geometry and memoization. |
| `src/components/CompactWidget.tsx` | Shared controlled time, preview timer and wheel/keyboard lifecycle. |
| `src/components/TimezoneList.tsx` | Prevent child menu key events from changing reference. |
| `src/components/TimezoneSearch.tsx` | Closed-search suppression and stable keyboard position during ticks. |
| `src/components/TimezoneGroupSelector.tsx` | Keyboard opening/navigation. |
| `src/primitives/index.tsx` | Stable popup/dialog/menu focus effects and modal focus restoration. |
| `src/lib/time-axis.ts`, `src/lib/time-selection.ts` (new) | Portable actual-day/civil-cell geometry and snapping helpers. |
| `src/lib/time-axis.test.ts` (new) | 19 targeted domain tests; existing dynamic boundary suite also checks new modules. |
| `docs-index.d.ts` | Controlled widget public prop declarations. |
| `package.json`, `package-lock.json`, `.gitignore`, `tsconfig.json` | Reviewed dev-only browser tool, commands, output ignores, strict browser-test types. |
| `playwright.config.ts` (new) | Edge browser tests, isolated loopback fixture, report and screenshot paths. |
| `tests/browser/fixture.html`, `fixture.tsx`, `vite.config.ts` (new) | Isolated deterministic actual-component test entry/build. |
| `tests/browser/interactions.spec.ts`, `visual.spec.ts`, `scenarios.mjs` (new) | 38 interaction cases and nine fixed screenshot scenarios. |
| `scripts/capture-visual.mjs`, `scripts/compare-visual.mjs` (new) | Before/after capture, pixel comparison and local gallery. |
| `scripts/measure-performance.mjs` | Saved-build mode and same-method CPU accounting. |
| `README.md`, `docs/ARCHITECTURE.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/IMPLEMENTATION_AUDIT.md`, `docs/TIMEZONE_ENGINE.md`, `docs/TESTING.md`, `docs/PERFORMANCE.md`, `docs/DEPENDENCIES.md`, `docs/MILESTONE_1.md` | Current documentation and historical-report navigation. |
| `docs/MILESTONE_2.md`, `docs/BUILD_ADVISORIES.md` (new) | Delivery report and per-package advisory analysis. |
| `docs/evidence/milestone-2/` (new) | Browser JSON, two audit reports, two performance JSONs, nine before PNGs/metadata, eleven after PNGs, corrected London golden, comparison JSON and gallery HTML. |

Runtime notices were regenerated with the unchanged nine-package runtime inventory. Generated `dist/`, `prototype-dist/`, `browser-test-dist/`, test outputs and saved performance builds are ignored artifacts. Existing `src/styles.css`, `src/tokens.fallback.css`, `src/fonts.css`, `tokens.json`, Tailwind config, store/reducer, platform interface, Milestone 1 time/validation/cache modules and `lib/schedule.ts` were not changed in Milestone 2.

Final SHA-256 comparisons against the preserved original audit snapshot confirm identical `src/styles.css`, `src/tokens.fallback.css`, `src/lib/schedule.ts`, `src/state/store.tsx` and `tailwind.config.cjs`. All relative links in the eleven updated README/report/architecture/testing/performance/dependency/advisory/plan/audit/timezone documents resolve locally (zero broken links).

## Remaining defects and limits

- The known overnight weekday attribution and sampled-duration scheduling defects remain open for Milestone 3. Existing overlap colors/suggestions inherit those limitations. Only selection dependencies and axis geometry were corrected here.
- Five high development advisories remain, as documented; production audit is zero. The Browserslist compatibility database emits a stale-data notice.
- No native Tauri shell, second widget window, tray, real caption actions, durable persistence or installer exists. Those remain later milestones. Platform boundaries remain portable for future macOS work; no macOS runtime verification is claimed.
- No known failing Milestone 2 regression remains in the exercised scenarios. This does not certify every historical civil-date edge, all screen readers, physical touch hardware, native IME, high-DPI/multi-monitor or 120 Hz behavior. Native CPU/memory budgets and long-duration growth tests remain outstanding.
- Transition discovery retains the Milestone 1 documented six-hour separation assumption and relies on installed runtime tzdb. No new timezone database or independent schedule engine was introduced.

**Await user review. Do not begin Milestone 3.**
