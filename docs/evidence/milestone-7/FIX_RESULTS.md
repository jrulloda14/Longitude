# M7 performance fixes: measured results

October 20, 2026. Fixes in `e3df6fc`:
1. clock hands ease only on jumps, not the per-second live tick;
2. while planning, per-second ticks reach only exact-clock displays.

Raw data: [fix-trials/](fix-trials/) is the accepted run. [fix1-trials/](fix1-trials/) is an earlier run **rejected as contaminated**: active input and 25–54% machine load.

Method: `measure-native-trials.mjs --display=on`, CDP attached, 3 rounds, rotated order, 60 s warmup, 120 s windows.

| Executable | SHA-256 (prefix) |
| --- | --- |
| M6 (before) | `46e6eb22` |
| Fix 1 | `73d58443` |
| Fix 1 + 2 | `adb3da20` |

**Run conditions:** the last user input was 1–2 s before most trials, and machine load outside the app was 18–24%. Whole-machine CPU is therefore noisy. Renderer task time comes from the app's own renderer metrics, which outside load doesn't distort.

## Results (per trial, % of total machine)

| Build | Live CPU | Live GPU process | Live renderer | Live renderer task ms/s | Planning CPU | Planning renderer task ms/s |
| --- | --- | --- | --- | --- | --- | --- |
| M6 | 5.11 / 6.34 / 5.90 | 2.78 / 3.62 / 3.17 | 2.32 / 2.71 / 2.72 | 14.1 / 13.3 / 14.3 | 0.31 / 0.50 / 0.45 | 6.3 / 5.8 / 5.8 |
| Fix 1 | 3.41 / 8.63 / 8.19 | 2.24 / 6.61 / 6.34 | 1.15 / 2.02 / 1.86 | 7.4 / 7.8 / 7.7 | 0.44 / 0.47 / 0.50 | 5.9 / 5.8 / 5.6 |
| Fix 1 + 2 | 3.62 / 3.98 / 7.98 | 2.53 / 2.57 / 6.28 | 1.08 / 1.41 / 1.70 | 7.7 / 7.6 / 8.0 | 0.39 / 0.37 / 0.37 | 4.1 / 4.0 / 4.0 |

## Findings

1. **Fix 1 removed the transition work as intended.**
   - Live renderer task time halved (about 14 to about 7.7 ms/s), and renderer CPU fell from about 2.6% to 1.1–2.0%.
   - The ten per-tick `CSSTransition`s no longer appear among running animations.
2. **Live CPU did not reach target, because the GPU process now dominates.**
   - The GPU process sits at about 2.5% in one state and about 6.4% in another.
   - The remaining continuous animation is the "Live" pulse (infinite 1.6 s opacity fade), which keeps the compositor producing frames every vsync.
   - M7.1 measured the pulse only while the hands were still animated, so it underestimated the pulse once the hands stop.
   - The 6.4% state matches the high GPU state seen in M7.0 and the M7.1 "restored" window.
   - **Conclusion:** the pulse is now the primary live cost.
3. **Fix 2 reduced planning renderer work by about 30%** (5.8 to 4.0 ms/s) and steadied planning CPU at 0.37–0.39%. That remains above the 0.25% target.
4. **Functional checks passed for both fixes:**
   - 772 unit, 41 Rust and 105 browser tests, with visual goldens unchanged;
   - 29 native regressions;
   - new regressions that fail on the previous code.

## Next step (needs approval)

Diagnostic attribution of the pulse on the fixed build, using runtime toggles only. Compare live with the pulse:
- running,
- paused,
- stepped at a lower update rate,
- promoted to its own layer,

then propose a visually equivalent pulse for approval. No motion is removed without approval. Planning's remaining cost (GPU about 0.16%, renderer about 0.21%) is the 1 Hz exact-clock updates plus compositing.
