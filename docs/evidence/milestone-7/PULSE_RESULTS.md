# M7 "Live" pulse diagnosis

October 20, 2026. Build: fix 1 + 2 release `adb3da20`. Script: [`scripts/attribute-native-pulse.mjs`](../../../scripts/attribute-native-pulse.mjs). Raw data: [pulse-attribution/](pulse-attribution/).

## Method

- **15 fresh launches:** 3 rounds × 5 variants, with the order rotated each round.
- **One variant per launch,** applied at mount. Toggling the pulse within a launch can shift compositing state, so it was avoided.
- **Measurement:** 60 s warmup, then a 90 s live window. Display kept on. 0 errors.
- **Variants** are runtime-only and not shipped. The shipped pulse is an infinite 1.6 s ease-in-out opacity fade (1 → 0.35 → 1) on the 6 px "Live" dot.

**Run conditions:** machine load outside the app was about 17–24%, mostly the Claude desktop app hosting this session. User idle time reads about 1 s at each launch, probably from the keep-awake wake input or that session, not a person. Variants were interleaved, so comparisons between them are fair.

## Results (% of total machine, median [min–max])

| Variant | App CPU | GPU process | Renderer | Renderer task ms/s |
| --- | --- | --- | --- | --- |
| shipped | 3.52 [3.41–7.89] | 2.33 [2.28–6.18] | 1.18 | 7.6 |
| paused (static dot) | **0.49** [0.45–0.50] | 0.13 | 0.33 | 6.4 |
| stepped (`steps(8)`, about 10 updates/s) | 3.34 [3.20–3.58] | 2.22 | 1.16 | 7.2 |
| js10 (10 Hz timer, same curve) | 2.48 [2.17–2.55] | 1.53 | 0.89 | 13.3 |
| layer (`will-change: opacity`) | 3.54 [3.25–8.27] | 2.35 | 1.19 | 7.6 |

## Findings

1. **The running pulse is now the dominant live cost:** about 3 points of the 3.5%. With it static, live CPU is 0.49%, within the ≤1% target.
2. **Lowering the update rate within CSS or promoting a layer doesn't help.**
   - A running CSS animation keeps the compositor producing frames every vsync.
   - On this Intel HD 530 / WebView2 host, each composited frame per second costs about 0.14% of the machine.
   - Even a 10 Hz timer-driven fade costs 2.5%.
3. **The high GPU state (about 6–8%) appears only while the pulse animates.** It never appeared in paused launches.
4. **Meeting the live target requires the pulse not to animate continuously.** That is a visible design change and **needs approval**.

## Options for approval

| Option | Expected live CPU | Visual change |
| --- | --- | --- |
| A. Pulse briefly, then rest. The same pulse runs for a few seconds after returning to Live or focusing the window, then settles to a solid dot. | ~0.5% at rest | Identical animation when it matters; solid dot when idle |
| B. Blink with the seconds. The dot steps between its two opacities on the existing 1 s tick, with no fade. | ~0.5% | A discrete blink replaces the smooth breath |
| C. Solid dot always. | ~0.5% | No animation; "Live" label and green dot unchanged |
| D. Keep as is and revise the live target. | 3.5–8% | None; requires approving a revised budget |
