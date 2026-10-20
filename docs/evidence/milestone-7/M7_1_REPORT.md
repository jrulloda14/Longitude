# M7.1: live CPU attribution

October 20, 2026. Approved scope: diagnostic attribution only. **No application code changed.** Executable: M6 final release `46e6eb22…` (app source identical to `d53821d`). Raw data: [gpu-attribution/](gpu-attribution/). Script: [`scripts/attribute-native-gpu.mjs`](../../../scripts/attribute-native-gpu.mjs), which shares its sampling code with M7.0 via [`scripts/lib/native-measure.mjs`](../../../scripts/lib/native-measure.mjs).

## Method

- **Launches:** 10 sequential launches, 0 errors and 0 forced exits.
- **Display on throughout.** A zero-distance input woke the screen, and a display-required power request held it on until the run ended.
- **Main window** in the foreground at DPR 1 and 59 Hz. Idle frame pacing was 16.7 ms in every launch, and the GPU configuration was identical in all 10 launches: ANGLE/D3D11 on Intel HD 530, DirectComposition, no hardware overlays.
- **Windows:** after a 60 s warmup, five consecutive 60 s windows per launch. Each toggle is a runtime-only change through the debugger and is restored afterwards:
  1. **live**, unchanged;
  2. **pulse paused**: the "Live" dot's opacity animation is paused;
  3. **pulse paused + static hands**: the 420 ms hand transition is also removed, so the per-second 0.1° minute-hand step applies instantly;
  4. **restored**: both toggles reverted;
  5. **planning**: one arrow-key step.

## Results (median [min–max], % of total machine, 4 cores)

| Window | Total CPU | GPU process | Renderer | Style recalcs/s | Layouts/s | Renderer task ms/s |
| --- | --- | --- | --- | --- | --- | --- |
| Live | **6.17** [5.19–9.71] | 3.05 | 3.15 | 12.8 | 9.3 | 17.0 |
| Pulse paused | 5.04 [4.69–5.27] | 3.31 | 1.71 | 9.4 | 8.2 | 14.4 |
| Pulse paused + static hands | **0.53** [0.38–0.62] | 0.15 | 0.36 | 1.0 | 1.0 | 6.7 |
| Restored | 9.28 [8.44–9.81] | 6.92 | 2.16 | 13.0 | 9.6 | 16.4 |
| Planning | **0.49** [0.38–0.57] | 0.14 | 0.34 | 1.0 | 1.0 | 6.0 |

## Findings

1. **The display state explains the conflicting earlier results.** All 20 M7.0 trials ran with the display asleep and measured about 0.8–1.7% live. With the display on, the unchanged executable measures about 6% live, matching the M6 report's 4.6–4.8%. The M6 high trials were very likely display-on. M7.0's "did not reproduce" conclusion is superseded.
2. **The per-second clock-hand transition is the dominant cost: about 4.5 of the 6 points.**
   - In live mode the dial and every row's mini clock re-render each second. Each hand then runs a 420 ms eased `transform` transition to move the minute hand 0.1° and the hour hand 0.008°.
   - SVG transform transitions run on the main thread and invalidate style and layout every frame, producing about 8–12 extra recalcs and layouts per second.
   - Applying the same per-second change without the transition leaves 1.0 recalc and layout per second (the tick itself) and takes total CPU to **0.53%**, under the 1% target.
   - At these sizes a 0.1° step is a sub-pixel change. Turning the per-second easing off is not expected to be visible; this needs confirming visually on screen.
3. **The pulse is a smaller contributor**, about 1.1 points in this order of windows.
   - Pausing and resuming it with the debugger produced a worse compositing state (about 9%). That is an artifact of the toggle, not shipped behavior; it is consistent with the M7.0 high/low GPU states.
   - This run never measured the pulse running with the static hands, so its exact cost on top of the 0.53% baseline still needs a direct measurement after fix 1.
4. **Planning is about 0.49%**, above its 0.25% target. Planning has no running animations, so the remaining cost is the once-per-second full React re-render plus one recalc and layout. The selected time doesn't change in planning mode, so this is avoidable work.
5. **The GPU configuration is not the cause.** It was identical across all launches. The Rust host and the hidden widget are idle, as in M7.0.

## Proposed fixes (need approval; no visible change)

1. **Ease hands only on visible jumps.** Keep the 420 ms eased transition for user and selection changes (reset to now, keyboard, wheel, typed time, timeline). Apply the per-second live tick without a transition. Applies to the main dial, the mini clocks in rows, and the widget.
2. **Stop the per-second render in planning mode.** When a time is selected, nothing on screen depends on seconds. Update "now"-dependent displays (ghost hands, "Now · time", relative labels) on minute boundaries instead. Live mode keeps its per-second tick.
3. **Re-measure the pulse after fix 1.** If it is still material, try compositor-friendly but visually identical options (for example layer promotion), measured on and off the display. No motion removal.

Each fix gets:
- unit and browser regression tests: transition presence for jumps, absent for ticks; no render churn in planning mode; correct "now" displays;
- unchanged visual goldens;
- a display-on before/after trial with this script and `measure-native-trials.mjs`.

## Limitations

- Windows within a launch are sequential, and the restore window shows that toggle order can change compositor state. Fix verification must use fresh launches, not toggles.
- One host only: i5-6500, Intel HD 530, 60 Hz, 1080p, Windows 10. No high-refresh display, no mixed DPI, no Windows 11, no Mac.
- Process CPU is a sampled estimate, and GPU-process CPU is not GPU hardware utilization.
