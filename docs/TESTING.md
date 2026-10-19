# Testing — Milestone 2

Use Node 24 and npm 11. Restore the pinned install with `npm ci --ignore-scripts`, then run:

```powershell
npm test
npm run typecheck
npm run test:browser
npm run build
npm run build:prototype
npm audit --omit=dev
npm audit
```

Browser tests require installed Microsoft Edge at the normal Windows location; Playwright uses `channel: 'msedge'`. No browser download is required. They build an isolated fixture into ignored `browser-test-dist/` and start a loopback server on port 4175. The fixture, deterministic clock and test bridge are never part of the production entry. Tests run with one worker, zero retries, fixed Asia/Singapore browser timezone and controlled instants. Do not use snapshot-update flags for routine verification.

## Exact final results

October 19, 2026: `npm test` **551 passed, 4 files, 0 failures**, 2.73 s. This preserves all 530 Milestone 1 tests and adds 19 axis/selection tests and two boundary cases. `npm run test:browser` **47 passed, 0 failed, 0 skipped, zero retries**, 53.2 s: 38 interaction and 9 screenshot tests. [Raw browser report](evidence/milestone-2/browser-results.json). Production build (including strict typecheck) and original prototype pipeline both pass. Full command outcomes and remaining checks are recorded in [MILESTONE_2.md](MILESTONE_2.md).

The unchanged original `time.test.ts` contains five tests. `time.foundation.test.ts` retains all Milestone 1 absolute fixtures, folds/gaps/policies, fractional offsets, transition-cache freshness, unusual civil days, leap/century dates, historical seconds and strict validation tests. All Node-runtime IANA zones plus UTC are compared at four dates with Temporal projections. These consistency checks supplement independent known fixtures; they do not independently verify ICU's tzdb. `domain-boundaries.test.ts` checks portable imports and excludes DOM/network globals, now including both new helpers.

`time-axis.test.ts` covers 23/25/23.5/24.5-hour days, skipped midnight, repeated/fractional cells, exact civil tick positions, historical-second snapping and invalid selection/span inputs.

## Browser interaction coverage

Actual components verify shared instant/reference changes; planning stability across ticks; live midnight; pointer capture outside the dial; multiple/reverse revolutions; hour hand; release/cancel/lost capture; click/double-click; wheel/modifiers; 1/5-minute precision; keyboard day/hour/reset; direct 12/24-hour entry, invalid input, Escape and AM/PM; date navigation, leap day, gap adjustment and fold alternatives; timeline pointer/keyboard/DST bounds; Kathmandu/Adelaide/Chatham/Lord Howe; controlled widget selection/timeout; focus during ticks/modal close; dialog Tab containment; search/group/row keyboard navigation; explicit/system reduced motion; date popup bounds at 380 and 850 px.

These are browser accessibility regressions, not a full screen-reader or native accessibility certification. Native tests cannot run yet: there is no Rust/Tauri application. Browser caption actions remain placeholders.

## Visual evidence

Before screenshots were captured from Milestone 1 source before integration. Nine matching scenarios use the same installed Edge, fixed instants, local loaded fonts and matching dimensions. Eight assert against their original baseline with `maxDiffPixels: 0`; the London fall-back case asserts against a separately reviewed corrected golden. Original London evidence is retained.

Inspect [comparison gallery](evidence/milestone-2/visual/index.html) and [pixel counts](evidence/milestone-2/visual/comparison.json). Eight scenarios have zero changed pixels; London has 681 changed pixels (0.143067%) under the separate RGBA comparison, confined to corrected time geometry/labels. `node scripts/compare-visual.mjs` regenerates that comparison. RGBA comparison counts channel deltas >16; Playwright's perceptual threshold 0.1 assertions are separate. Baseline capture uses `npm run visual:capture -- before`; **do not overwrite delivered before evidence** during routine testing. Capture future intentional variants into a new evidence directory.

## Remaining checks

Milestone 0's overnight weekday attribution and incomplete duration coverage failures remain Milestone 3 defects. No scheduling algorithm change or claim of passing scheduling acceptance tests is made here. Native resource, caption/window, high-DPI, multi-monitor and physical input-to-photon tests remain pending. See [PERFORMANCE.md](PERFORMANCE.md) for measured hardware and browser limits. Full npm audit intentionally exits nonzero for five documented development-only high findings; production audit is separate. [BUILD_ADVISORIES.md](BUILD_ADVISORIES.md) records their conditions/remediation.
