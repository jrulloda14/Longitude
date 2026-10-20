# M7.0: measurement foundation results

October 20, 2026. Approved scope: measurement harness, native suite reruns and controlled baselines. **No application code was changed.** Source under test: app source identical to `d53821d`; repository HEAD `51076d8`.

## Fresh baseline (this host)

| Check | Result |
| --- | --- |
| Typecheck, Rust format | Passed |
| Unit | 772/772 |
| Rust | 41/41 |
| Windows browser | 102/102 (2.1 min) |
| Release smoke, M6 executable `46e6eb22…` | 5/5 ([evidence](native-rerun/release-smoke.json)) |
| Native regression, rebuilt debug executable `4920114e…` | **29/29** ([evidence](native-rerun/native-results.json)). Rebuilt because the harness flags file times; app and Rust source are identical to `d53821d` |
| Native sharing (13) | **Not rerun.** `verify-native-sharing.mjs` writes into `docs/evidence/milestone-6` (it would overwrite M6 evidence) and its Save dialog was driven interactively. Needs a script fix and an attended run. |

Defect found: `tests/browser/scheduling.spec.ts:75` (and the visual/interaction specs) write screenshots into tracked evidence folders by default, so ordinary test runs modify committed M5B evidence. The overwritten file was restored from git. Proposed fix: default test output to an ignored folder.

## Harness changes

New [`scripts/measure-native-trials.mjs`](../../../scripts/measure-native-trials.mjs). The M6 `measure-native.mjs` is kept unchanged for reproducibility. The new harness adds:
- interleaved repeated trials, with the order rotated each round, across several executables;
- observer conditions:
  - `attached`: debugger client plus Performance domain, as in M6;
  - `detached`: debug port open, no client during measurement;
  - `noport`: no remote debugging at all;
- per-process **roles** (host, browser, GPU, renderer, utility) taken from command lines;
- host state for each trial: idle time, display timeout and likely-off flag, foreground process, refresh rate, power plan, WebView2 version, other WebView2 host apps;
- machine-wide busy time and the top other processes;
- frame-pacing probes outside the measured windows.

## Controlled trial results

[Raw data](native-trials/). 4 rounds × 5 configurations = **20 trials, 0 errors**. Each trial had a 60 s warmup and 120 s windows sampled every 30 s. Hardware: i5-6500 (4 cores), Intel HD 530 at 59 Hz, 1080p, High performance power plan, WebView2 155.0.4283.62.
- `b5` is the approved 5B executable (`d5d729fe…`).
- `m6` is the final M6 executable (`46e6eb22…`).

| Config | Live CPU median [min–max] | Planning CPU median [min–max] | Live private MiB | Drag frame p95 | Commit proxy p95 |
| --- | --- | --- | --- | --- | --- |
| m6 attached | 1.44 [0.81–1.50] | 0.256 [0.210–0.268] | 215 | 18.1 ms | 27.0 ms |
| m6 detached | 0.85 [0.82–1.57] | 0.256 [0.207–0.284] | 215 | 18.1 ms | 27.2 ms |
| m6 no port | 1.50 [1.43–1.53] | n/a | 209 | n/a | n/a |
| b5 attached | 1.48 [0.77–1.72] | 0.219 [0.185–0.284] | 211 | 18.1 ms | 27.5 ms |
| b5 detached | 1.56 [1.40–1.64] | 0.237 [0.206–0.240] | 208 | 18.1 ms | 27.9 ms |

Against the provisional budgets:
- **Live ≤1%:** fails in 13/20 trials.
- **Planning ≤0.25%:** borderline; medians 0.22–0.26.
- **Memory ≤250 MiB:** passes.
- **Drag frame p95 ≤20 ms:** passes.
- **Commit proxy ≤33.3 ms:** passes.
- Idle frame pacing was about 17.5 ms (60 Hz) in every trial.

## Findings

1. **The M6 report's high CPU and 30 Hz frames did not reproduce in 20 trials.** Earlier high trials measured 4.6–4.8% live, 2.9% planning and about 42 ms frames. Here the maximum was 1.72% live and 0.284% planning, and frames were always about 17.5 ms. A machine-state factor in the earlier trials is likely but unidentified.
2. **No M6 regression.** The M6 and approved 5B executables are indistinguishable.
3. **No observer effect.** Attaching the debugger doesn't measurably change CPU; the no-port trials fall in the same range.
4. **Live CPU is bimodal and the GPU process decides it.** Each launch settles into a low state (GPU about 0.25%, live total about 0.8%) or a high state (GPU about 1.0–1.15%, live about 1.4–1.7%) and stays there.
   - The state is independent of executable and observer.
   - In the high state the renderer does less (13.5 vs 16.0 ms/s task time).
   - This suggests different compositing paths, not more application work.
   - Planning-mode GPU stays at about 0.05–0.09% in both states.
5. **The Rust host costs about 0%** in every trial; the earlier "6 MiB process" cost is absent.
6. **The hidden widget renderer is idle.**

## Limitations

- **Display state:** the display was likely off (idle beyond the 15 min timeout) in all 20 trials, and the user was away. A display-on round is still needed.
- **Shared desktop:** two other WebView2-based apps ran throughout. Machine busy time was about 9–10%, mostly the 30 s PowerShell sampler.
- **No-port trials** cannot verify mount or enter planning mode, and end by force-terminating the process.
- **Proxies:** process CPU is a sampled estimate, and frame/commit timings are proxies, not input-to-photon latency.
- **Single machine, single OS:** results come from one Windows 10 host. There are no Windows 11 or Mac measurements.

## Recommended next step (M7.1, needs approval)

Find what decides the GPU state, using diagnostic builds and launch flags only, with nothing shipped. Run trials varying:
- display on vs off;
- the window covered vs in front;
- the pulse paused;
- tick-driven hand transitions skipped;
- WebView2 GPU/DirectComposition flags.

A display-on round of the current harness comes first.
