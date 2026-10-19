# Performance baselines and provisional targets

Measured October 19, 2026 (Asia/Singapore). These are frontend development baselines, not verified Tauri/WebView2 resource figures. No native app exists yet. Builds exercise the existing four-location Clock view and timeline. Milestone 1 results below remain historical; the final section records the same-harness Milestone 1 versus Milestone 2 comparison.

## Hardware and environment

| Item | Actual measured host |
| --- | --- |
| CPU | Intel Core i5-6500 @ 3.20 GHz, 4 physical cores / 4 logical processors |
| RAM reported by Windows | 17,067,753,472 bytes, about 15.90 GiB (16 GB nominal) |
| System | MSI MS-7A70 |
| OS | Windows 10 Pro, 10.0.19045 |
| GPU / driver | Intel HD Graphics 530, 31.0.101.2111 |
| Browser | Headless Microsoft Edge 155.0.4283.62, V8 15.5.9.7 |
| Node | 24.15.0; ICU 78.2, tzdb 2026a |
| App geometry | 850 × 560 logical px; 898 × 608 viewport; device scale 1 |
| Reference / group | Asia/Singapore; Singapore, Manila, New York, London |

## Method and reproducibility

```powershell
npm run build
npm run perf -- --site=prototype --out=docs/evidence/performance-prototype.json
npm run perf -- --out=docs/evidence/performance-milestone-1.json
```

`scripts/measure-performance.mjs` creates a disposable Edge profile and loopback static asset server. It blocks external requests, warms the page for three seconds, measures live and planning modes sequentially, then drives 120 pointer moves over three minute-hand revolutions. Each mode has four nominal five-second waits and five process/memory snapshots; actual elapsed time includes sampling overhead (about 22.5–23 seconds). It captures process-tree CPU/private/working-set samples, renderer task duration/heap, committed slider mutations, animation-frame intervals, long tasks and outside-dial pointer capture. It then runs domain checks in Edge and saves a screenshot locally under ignored `performance-results/`.

CPU is elapsed CPU seconds divided by elapsed wall seconds, reported both relative to one core and divided by four logical processors for total-machine percentage. It aggregates the launched Edge process tree, excluding Node/PowerShell/server. Process sets changed during both measurements, so CPU totals can omit work by exited subprocesses: **treat process CPU as lower-bound estimates**, not precise steady-state resource certification. Sampled private bytes are summed per process; working sets include shared pages and must not be read as unique physical RAM. Peak means peak of five snapshots, not continuous maximum.

The animation-frame-only event metric can run before React's continuous-event update commits (the raw `changedFrames=0` counter demonstrates that). The responsiveness metric below instead uses a MutationObserver on the committed slider value, followed by requestAnimationFrame. This is a proxy for input-to-frame readiness, not input-to-photon latency. Quantized moves that do not change the snapped value are intentionally not counted as commits.

This is one short run per build, with a normal shared development machine and some early-run build/test activity; no statistical improvement claim is made. The legacy HTML requests Google Fonts, which the harness blocks, so it falls back to the system font. The new build verifies the existing `Geist` family is actually loaded locally. Frame geometry matches, but the font and original browser window frame differ. Repeat on a quiet host with a longer warmup/stable process set and native WebView2 before accepting resource budgets.

## Recorded results

Raw evidence: [original preview](evidence/performance-prototype.json), [Milestone 1 frontend](evidence/performance-milestone-1.json). All memory values below are MiB (1,048,576 bytes).

| Metric | Original preview | Milestone 1 frontend |
| --- | ---: | ---: |
| Live sample duration | 22.93 s | 22.96 s |
| Live CPU, total machine / one core (estimates) | 2.76% / 11.04% | 2.89% / 11.57% |
| Planning sample duration | 22.50 s | 22.48 s |
| Planning CPU, total machine / one core (estimates) | 0.68% / 2.71% | 0.57% / 2.29% |
| Live peak sampled private memory | 354.61 | 376.52 |
| Planning peak sampled private memory | 256.51 | 255.80 |
| Live / planning peak summed working sets | 699.81 / 492.38 | 712.49 / 491.29 |
| Live / planning renderer JS heap, end sample | 4.16 / 3.94 | 4.99 / 5.90 |
| Live / planning renderer task ms per second | 19.03 / 12.41 | 21.89 / 15.17 |
| Pointer-event to committed-value next frame, p50 / p95 | 16.7 / 16.9 ms | 16.7 / 16.9 ms |
| Committed-value next-frame maximum | 17.0 ms | 16.9 ms |
| Frame interval p95 / maximum | 16.8 / 16.9 ms | 16.9 / 17.0 ms |
| Committed snapped slider updates | 36 | 36 |
| Outside-dial moves retaining pointer capture | 59 / 59 | 59 / 59 |
| Observed long tasks over 50 ms during drag | 0 | 0 |
| Uncaught page exceptions | 0 | 0 |
| External requests attempted | 1 (blocked Google Fonts) | 0 |

The browser domain probe passes **428/428** checks on each run (418 runtime IANA zone roundtrips plus ten named edge checks). It loads the current domain module on both pages; it does not validate the older legacy bundled domain. Node's suite separately contains 530 passing tests. No native window positioning, tray, installer or multi-monitor result follows from these browser checks.

First observed mount was about 391 ms for the original and 361 ms for Milestone 1, but the polling/paint observation is too coarse for a reliable startup comparison (new build paint entries had not appeared at the first observation). Do not use these as native cold-start numbers.

Final production JS is about 411.34 kB raw / 127.29 kB gzip; CSS is 23.34 kB raw / 5.85 kB gzip. Five local font subsets total about 76.41 kB (only needed subsets load). The rebuilt external-React preview is about 276 KiB JS vs the original roughly 114 KiB; the Temporal correctness dependency adds a material bundle cost. These bundles have different React inclusion and are not interchangeable size comparisons.

## Provisional budgets

These are engineering targets to validate and adjust with repeatable native measurements, not promises or Milestone 1 pass claims.

| Measure and workload | Provisional target / acceptance method |
| --- | --- |
| Live idle CPU, main window, four locations | ≤1% total machine average after 60-second warmup over a 120-second stable process-tree interval |
| Planning idle CPU, unchanged selected instant | ≤0.25% total machine over the same interval; avoid repeating timezone/scheduling work on every live tick |
| Native app + WebView private memory, main window | ≤250 MiB after warmup; measure widget addition separately; no >10 MiB persistent growth over a 10-minute idle window after GC stabilization |
| Interactive clock input-to-committed-frame proxy | p95 ≤33.3 ms, p50 near one 60Hz frame; no >50 ms main-thread long task in the standard four-location drag workload |
| Drag frame intervals | p95 ≤20 ms at 60Hz; no lost updates/capture when leaving the dial, repeated revolutions, release or cancel |
| Production frontend JS | ≤150 KiB gzip while preserving correctness and existing UI |

The short-run browser CPU/private-memory baselines are above the eventual native targets. Their process churn/headless overhead means they do not establish a native pass or failure; the targets remain **unmet/unverified**. The measured frame proxy and bundle size are within the provisional budgets for this specific workload. Milestone 1 did not refactor the frontend; Milestone 2 now memoizes timeline/day-strip work and suppresses closed-search work while preserving context ticks for live/ghost-hand displays.

Milestone 2 adds dedicated regressions for pointer capture, outside-boundary movement, release/cancel, multiple revolutions, selected/live synchronization and preserved animation rules, and reruns this workload. Native resource, high-DPI, monitor, 120Hz display and physical input-to-photon measurements remain Milestones 5/7 or suitable hardware checks.

## Milestone 2 comparison

Same hardware/browser above, measured sequentially with builds/tests stopped. The Milestone 1 production output was saved before source changes under ignored `performance-results/milestone-1-dist/`. Both builds use the **updated same harness**: per-process maximum CPU observed across all snapshots minus its initial CPU, retaining last-seen exited processes. Work between samples can still be missed. This changes CPU accounting from the original Milestone 1 report; compare the two new runs to each other, not directly to the historical CPU figures above. Raw snapshots are retained. All four sample intervals have changing process sets, so CPU remains a lower-bound estimate and short-run browser overhead is material.

```powershell
npm run build
npm run perf -- --site=milestone-1 --out=docs/evidence/milestone-2/performance-before.json
npm run perf -- --out=docs/evidence/milestone-2/performance-after.json
```

The first command assumes the preserved Milestone 1 output is available; rebuilding current source cannot recreate that historical baseline. See raw [before](evidence/milestone-2/performance-before.json) and [after](evidence/milestone-2/performance-after.json), including actual hardware, browser version, all process samples and limitations. No statistical improvement claim follows from one run per build.

| Metric | Milestone 1 saved build | Milestone 2 |
| --- | ---: | ---: |
| Live / planning actual sample seconds | 22.65 / 22.39 | 22.61 / 22.54 |
| Live CPU total machine / one core, estimates | 8.36% / 33.46% | 9.59% / 38.36% |
| Planning CPU total machine / one core, estimates | 1.33% / 5.30% | 0.59% / 2.36% |
| Live / planning peak private MiB | 361.26 / 256.29 | 370.77 / 258.10 |
| Live / planning peak summed working sets MiB | 710.03 / 492.81 | 710.98 / 491.91 |
| Live / planning renderer heap end MiB | 5.01 / 7.57 | 5.01 / 4.69 |
| Live / planning renderer task ms per second | 22.85 / 14.31 | 14.12 / 6.94 |
| Event to committed-value next frame p50 / p95 / max | 16.8 / 22.0 / 27.6 ms | 16.7 / 17.6 / 30.0 ms |
| Frame interval p95 / max | 16.8 / 16.9 ms | 16.9 / 17.3 ms |
| Committed snapped updates / 120 moves | 36 | 36 |
| Outside-dial moves retaining capture | 59 / 59 | 59 / 59 |
| Drag long tasks >50 ms / uncaught exceptions | 0 / 0 | 0 / 0 |
| Browser domain checks / failures | 428 / 0 | 428 / 0 |
| External requests attempted | 0 | 0 |

The observed live CPU estimate is higher and planning CPU/renderer task time lower; neither is a controlled steady-state result. Private memory is slightly higher. The measured interaction proxy passes the provisional p95 33.3 ms and frame p95 20 ms budgets, with no observed long task. CPU/memory budgets remain **unmet/unverified for native delivery**; they are not waived. Startup polling is too coarse to certify startup performance. No native WebView, 10-minute growth, 120 Hz or physical latency result is claimed.

Final Milestone 2 production JS: **417.09 kB / 129.17 kB gzip**, CSS **23.40 / 5.87 kB** (Vite decimal kB), versus Milestone 1 JS 411.34 / 127.29 kB. Runtime dependencies are unchanged. Existing style files are unchanged; CSS output adds only utilities used by the accessible controls. The development browser fixture and Playwright are excluded from runtime output.
