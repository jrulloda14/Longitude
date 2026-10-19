# Performance baselines and provisional targets

## Milestone 6 comparison and historical CPU investigation

Fresh approved-5B optimized baseline (exact binary hash and actual intervals in [raw evidence](evidence/milestone-6/baseline/native-performance.json)): **0.8393% live / 0.2395% planning total-machine CPU**, sampled aggregate private peaks **215.6875 / 218.671875 MiB** after 60-second warmup and nominal 120-second windows. No builds/regression suite ran during that baseline trial. This does not reproduce the historical 5A 9.0599% live result, and does not prove it fixed.

Final M6 trial and separate browser-process/V8 diagnostic profiling are recorded in [MILESTONE_6.md](MILESTONE_6.md), with the measured executable hashes, per-process samples and frame/capture proxies. Keep final values and conclusions separate from the older measurement below. Profile pulse-pausing is temporary diagnostic instrumentation, not a shipped animation change. No worker, target relaxation or broad performance rewrite is introduced. Physical Mac performance remains Blocked.

The historical diagnostic uses the retained final 5A artifact SHA-256 `3cb781cc4006127a44fc8bd8c6a16904cdb64904bc64707eeceabb25c86c705d`. The exact binary used for the original high-CPU trial was `b20851f9ea7de927df596de196a52f7aef9adf3f04517daf4b8cd73950baf99c`, which is not retained. Therefore this is a related-build comparison, not an exact reproduction. The diagnostic records browser subprocess CPU (excluding the Rust host), renderer task/script/layout metrics and a short V8 sample. Its temporary pulse pause examines one suspected animation/compositing contributor without removing shipped motion. The first inline-style injection attempt was correctly rejected by production CSP; the retained failed log is separate, and the retry uses the existing Web Animations API without weakening CSP.

Recorded [historical-build profile](evidence/milestone-6/historical-build-profile.json), same four-core host and WebView2 155.0.4283.62, 60-second warmup, three sequential 45-second samples:

| Diagnostic condition | Browser subprocess CPU, % total machine | Main renderer task / script, ms per second |
| --- | ---: | ---: |
| Live, unchanged motion | 4.3318 | 19.6249 / 4.6180 |
| Live, pulse temporarily paused | 3.4150 | 16.4892 / 4.9547 |
| Planning, original motion restored | 1.8324 | 7.0141 / 4.5316 |

In the live sample, the browser process accounts for 4.077 CPU seconds, GPU 2.048, and the active renderer 1.613 across 45.023 wall seconds. In a separate 15.098-second JavaScript profile, 10,047 of 10,246 samples are idle (98.06%); script execution is not shown to explain the whole process-tree cost. Temporarily pausing the pulse reduces observed browser CPU by 0.9168 percentage points, with less GPU/style work, supporting animation/compositing as one contributor. The unchanged planning sample still has browser-process overhead. These sequential, non-randomized samples do not establish causation, isolate all native/WebView event work or reproduce the precise historical 9.0599% result. No shipped animation was changed. The evidence supports further browser/GPU/native-event investigation; it does not justify a broad React/timezone rewrite or claim the issue fixed.

Final M6 optimized executable `46e6eb225a684aceacc0de165a80c6f5e6c8d98e5ba95487dbc8456a80537705`, [raw full-process trial](evidence/milestone-6/native-performance.json): **4.8013% live / 2.8925% planning**, both **Fail** against <=1% / <=0.25% CPU targets. Actual intervals 122.608 / 122.490 seconds, after 60-second warmup; no build/test suite ran concurrently. Private peaks are **213.9336 / 220.4844 MiB**, below 250 MiB. Both modes retain a stable process set; renderer tasks are 19.3939 / 6.9762 ms/s. Motion is enabled (0.42-second clock transition, running 1,600ms pulse), DPR 1, main visible, widget hidden. Event-to-frame p95 **2.4ms**, commit/frame proxy p95 **39.2ms**, frame p95/max **41.9/45.8ms**, no Long Tasks, **59/59** outside moves captured. This frame trial exceeds the earlier frame budget and is not relabeled a pass. The first fresh baseline was lower; the subsequent exact approved-5B repeat below assesses whether this is M6-specific. CPU/frame performance remains an explicit open finding, not a claimed fix or release certification.

The subsequent [exact approved-5B repeat](evidence/milestone-6/baseline-repeat/native-performance.json), same retained hash, same helper and enabled motion, measures **4.6059% live / 2.8825% planning CPU**, **209.8672 / 212.7148 MiB** private peaks and **19.4413 / 6.9524 ms/s** renderer tasks. Actual windows are 122.551 / 122.505 seconds after 60-second warmup. Frame p95/max **43.4/46.0ms**, event/frame p95 **2.5ms**, commit/frame p95 **42.1ms**, no Long Tasks, **59/59** captured outside moves. CPU and frame budgets also **Fail** for this approved build. Compared with that repeat, M6 changes CPU by +0.1954 / +0.0099 percentage points and memory by +4.0664 / +7.7695 MiB; renderer work and drag/frame proxies remain similar. Sequential single samples cannot certify significance or isolate the first baseline's lower readings. The repeated failure on approved 5B supports an inherited/variable browser/native/compositing problem; an M6-specific performance regression is not established. The failed targets remain open, with no attempt to manufacture a passing sample by disabling motion. All trials run without concurrent local builds/regression suites; brief documentation/API/artifact work and other shared-desktop noise remain possible. No ten-minute growth, controlled startup or physical Mac performance result is claimed.

## Milestone 5B - Mac hardware status

**Blocked: no physical test Mac is available in this Windows task.** Hosted Mac CI validates builds/filesystem tests; it supplies no physical-device CPU, memory, display/input or startup measurement. Windows and headless-browser results are not substitutes. The native appearance/shortcut changes establish no performance improvement.

| Mac measurement | Acceptance method / target | Result |
| --- | --- | --- |
| Live CPU | 60-second warmup, controlled repeated trials, <=1% total-machine CPU | Blocked - not measured |
| Planning CPU | Same method, <=0.25% | Blocked - not measured |
| Aggregate private memory | Native process tree, sampled peak <=250 MiB | Blocked - not measured |
| Ten-minute growth | Record sample series, process set and growth | Blocked - not measured |
| Visible-widget increment | Matched main-only and visible-widget workloads | Blocked - not measured |
| Cold / warm startup | Record launch definition, trials, app/hash/host | Blocked - not measured |
| Clock drag / frames | Actual input, outside capture, frame/Long Tasks; distinguish proxies from input-to-photon | Blocked - not measured |

Record device/architecture/RAM/macOS/WebKit/displays/scales, source/executable and raw trials using [MACOS_ACCEPTANCE.md](MACOS_ACCEPTANCE.md). Preserve appearance/responsiveness while investigating failures. Windows CPU budget failures below remain open; follow-up regression checks do not remeasure them. No performance worker or domain rewrite was introduced for 5B.

## Milestone 5A — actual Windows release application

Provenance: the raw JSON records the measured binary hash. Final read-only/native-preference guard and widget pin-on-connect/show fixes were built afterward without changing clock/rendering/idle paths. Final artifact hashes are separate; that build has not repeated this full resource trial. The final release smoke also captured [GPU diagnostics](evidence/milestone-5a/gpu-info.json): Intel HD Graphics 530 through ANGLE/Direct3D11, with GPU compositing and rasterization enabled. No software-renderer excuse is inferred for the observed high CPU.

Same recorded i5-6500/15.90 GiB/Windows 10 Pro 19045 hardware and WebView2 155.0.4283.62. [Raw native measurement](evidence/milestone-5a/native-performance.json) uses the unsigned optimized executable, visible four-location main window plus created hidden widget, 60-second warmup, 120-second nominal windows. Actual intervals: **128.4423 s live**, **123.4283 s planning**. Both maintained the same eight-process set. Native process-tree CPU (Node/sampler excluded): **9.0599% live / 1.7754% planning total machine**, so both provisional CPU targets **fail this trial**. Peak sampled private memory **213.6445 / 217.8398 MiB**; renderer task **23.5675 / 7.8152 ms/s**. The memory ceiling is met for this sample, but ten-minute growth and visible-widget incremental memory are not verified.

Native drag: event→frame p95 **2.5 ms**, commit/frame proxy p95 **25.4 ms**, frame p95/max **16.9/17.0 ms**, zero Long Tasks, **59/59 outside moves captured** across 120 moves. Frame proxies meet the existing workload budgets. Observed mount **1536.25 ms** is not a controlled cold-start benchmark. CPU and memory are process estimates/sampled peaks, not continuous maxima; process exit work may be missed. One trial on a shared desktop is not statistical certification. No compilers/test suites ran during the measured intervals; brief image comparison and document work remain possible shared-host interference. The failed sampler-spawn attempt produced no accepted result and was rerun with explicit system PowerShell and bounded launch retries.

The CPU findings remain open for the already planned Milestone 7 profiling/quality work; no extra worker, frontend redesign, target relaxation or later-milestone scope change was made. Physical input-to-photon, real mixed-DPI/monitor, Windows 11 and macOS measurements remain unavailable. [Windows report](MILESTONE_5A.md).

## Milestone 4 measurements — October 19, 2026

Same i5-6500/15.90 GiB/Windows 10/Edge 155 hardware, final production build with validated persistence enabled. [Frontend raw evidence](evidence/milestone-4/frontend-performance.json): live/planning total-machine CPU estimates **10.78% / 0.52%**, sampled private memory **352.02 / 247.60 MiB**, renderer task **16.45 / 7.64 ms/s**, pointer→frame p95 **0.60 ms**, commit/frame p95 **17.0 ms**, frame p95/max **16.8/17.0 ms**, no drag Long Tasks, 59/59 outside moves captured. 428 domain probes pass, no page errors or external requests. Live CPU is higher than M3's 7.98% short run; do not infer causation from one sample. Process churn, three-second warmup and ~23-second sampling windows prevent stable native resource certification. Existing CPU/memory budgets remain unmet/unverified; no target was relaxed.

Maximum scheduling workload: **5000 starts × 32 participants × eight intervals**, eight zones, 47-minute duration, 8-minute steps. [Synchronous evidence](evidence/milestone-4/scheduling-stress-before.json) shows latency 287.2/145.9/119.5 ms and 287/146/119 ms main-thread Long Tasks. This justified a local disposable worker for >8000 participant/candidate evaluations. [Worker evidence](evidence/milestone-4/scheduling-stress-worker.json): latency 487.9/319.2/306.9 ms; 10 ms heartbeat maximum drift 15.5/1.6/1.5 ms; zero main-thread Long Tasks; all result instants/scores match. Startup costs increase latency but preserve interactivity. Small queries retain the existing direct engine.

Main heap before/after three sync runs is 1.77→49.45 MiB (caches/GC affect samples); worker main heap 5.04→5.13 MiB excludes worker heap. Separate process sampling includes workers: private memory 257.79 MiB before, 263.11 MiB observed while alive, 246.63 MiB after. Only one of 60 samples overlaps worker lifetime: not a continuous peak or isolated worker allocation. No leak or native memory-budget pass is inferred. See [MILESTONE_4.md](MILESTONE_4.md) for complete methods, limitations, exact tests and reproduction commands.

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

## Milestone 3 scheduling profile

`node scripts/measure-scheduling.mjs` bundles the production domain, executes the same workload in separate Node and installed headless Edge processes, and verifies identical result instants/numeric scores. [Raw evidence](evidence/milestone-3/scheduling-performance.json). Actual hardware remains the i5-6500 four-core host, 17,067,753,472 bytes RAM and Windows 10 Pro 19045 listed above. Runtime metadata is included in the evidence. Runs are sequential, after builds/tests stopped.

Workload: two intervals per participant, eight zones including Kathmandu/Chatham/Adelaide/Lord Howe, London DST date range, 47-minute duration, 30-minute candidate step, fairness enabled. One first-query measurement and seven cached repeats; prior workloads can warm JIT/date caches, so 'first' is not a fully fresh-process measurement for every row. No statistical speed guarantee follows.

| Participants / days / candidate starts | Node first / warm p50 / max | Edge first / warm p50 / max |
| --- | ---: | ---: |
| 4 / 1 / 47 | 25.28 / 0.45 / 0.68 ms | 21.70 / 0.60 / 1.20 ms |
| 12 / 7 / 335 | 25.51 / 5.96 / 7.73 ms | 22.90 / 6.10 / 6.60 ms |
| 24 / 14 / 671 | 46.92 / 12.51 / 14.24 ms | 31.70 / 13.80 / 16.40 ms |
| 32 / 31 / 1487 | 81.18 / 45.53 / 53.28 ms | 73.00 / 36.40 / 45.90 ms |

Provisional same-host query budgets: <=50 ms first query for 24 participants/14 days, <=100 ms for the 32/31 workload. These measured cases pass. The 73 ms browser maximum case can cause a brief main-thread pause; it is not certified smooth at 60 Hz. Typical requests are smaller and custom searches execute on explicit actions rather than live ticks, so a worker was not justified for this milestone. Eight-interval/5000-candidate worst-case timing, cancellation and repeated-query memory stabilization remain unprofiled. Add a worker only after a concrete target workload exceeds an agreed responsiveness budget. Raw Node heap deltas include GC noise; RSS is process memory, not native app memory.

The profile cache is bounded to 64 entries and date-existence cache to 1024, in addition to the timezone engine's existing caps. Exact track/strip shading shares compiled daily ranges. Production JS is 433.48 kB / 134.40 kB gzip, CSS 23.66 / 5.94 kB; no dependency increase. Existing style files remain unchanged.

## Milestone 3 frontend drag/idle check

`npm run perf -- --site=milestone-3 --out=docs/evidence/milestone-3/frontend-performance.json` passes. [Raw final-build measurement](evidence/milestone-3/frontend-performance.json), same hardware/browser/process-snapshot method described above. Scheduling benchmark finished before this run; no builds/tests ran during measurement. This is one short run on a shared development host, not a controlled speed comparison with Milestone 2.

| Metric | Milestone 3 |
| --- | ---: |
| Live / planning elapsed sample | 22.71 / 22.50 s |
| Live CPU, total machine / one core, estimates | 7.98% / 31.92% |
| Planning CPU, total machine / one core, estimates | 0.69% / 2.78% |
| Live / planning peak sampled private memory | 352.69 / 247.08 MiB |
| Live / planning summed working sets | 701.14 / 486.04 MiB |
| Live / planning renderer heap end | 4.76 / 4.63 MiB |
| Live / planning renderer task ms per second | 14.62 / 6.38 |
| Event to committed-value next frame p50 / p95 / max | 16.8 / 16.9 / 17.0 ms |
| Frame interval p95 / max | 16.8 / 17.0 ms |
| Snapped commits / pointer moves | 36 / 120 |
| Captured outside moves | 59 / 59 |
| Drag long tasks >50 ms / page exceptions / external requests | 0 / 0 / 0 |
| Browser domain probes | 428 / 428 passing |

All mode samples have changing process sets, so CPU remains a lower-bound estimate. Working sets include shared pages, private memory is snapshot peak, and frame timing is a committed-DOM/frame proxy. Interaction budgets pass for this workload. Native idle CPU/private-memory and long-duration-growth budgets remain unmet/unverified, not waived; no Tauri/WebView2 resource result follows from headless Edge.
