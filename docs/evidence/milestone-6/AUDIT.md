# Milestone 6 mandatory audit

Baseline: 935e67f92f55d9091b4bbea65015f723c319bd1d, clean main synchronized with origin/main on October 20, 2026. No AGENTS.md found. Read implementation plan (M6/M7 gates), M5A/M5B reports, native/platform contracts, persistence schema/repository documentation, testing notes and current share/clock/planner components before implementation.

Existing implementation: lib/share.ts builds summaries/UTC ICS, MeetingSummary is the existing share dialog with title, duration, full/one-line format and fixed-UTC weekly option. DstNotice has transition/weekly explanations; TimeReadout already exposes explicit gap/fold resolution. Platform.copyText/saveFile currently use browser implementations even in native Tauri. Reuse these boundaries and components; no second frontend/timezone/scheduling/schema engine.

Gaps: summaries omit explicit participant dates, IANA IDs/offsets/end times and full-duration work compatibility; ICS uses Math.random and regenerates UID per export, accepts unchecked input, misses lone CR escaping and has no independent parser coverage. Save returns only boolean (cancellation indistinguishable from failure). Weekly behavior is only fixed UTC and presentation owns occurrence arithmetic. DST note says 'now' for selected-date transitions. Native export/clipboard and permission/error coverage are absent. Existing clock drag/planning/widget and persistence semantics must remain intact.

Baseline known limitations: physical Mac acceptance/performance, trusted signing/notarization and installer/manual calendar imports remain unverified. Windows 5A CPU trial 9.0599% live / 1.7754% planning exceeds provisional limits; this is historical, not a measurement of new M6 code. Repository metadata remains UNLICENSED. Five high npm development findings and RustSec maintenance/unsoundness warnings remain disclosed.

Verification: fresh baseline unit/browser/Rust/typecheck evidence under baseline/; preserve the baseline optimized executable and actual before captures. Profile Windows process tree/renderers under controlled conditions before low-risk changes, then repeat. Validate ICS independently, actual Windows clipboard and native Save acceptance/cancel/error, both Mac CI targets, shared regressions and visual evidence. Physical Mac tests remain Blocked without a device. No M7 or release publication.

## Demonstrated follow-up findings

- Independent parser coverage exposed an RDATE-only iterator interoperability difference; include DTSTART redundantly in the UTC recurrence list and retain independent occurrence comparisons.
- Preserve the export session's reference-wall basis across share-sheet reopening; diagnose entirely skipped requested dates with the established civil/zone engine.
- ARM run 39303616091 compiled and passed unit/Rust checks but had 91 WebKit passed / 2 keyboard failures. Safari skipped default buttons in native Tab order. A small correction to the existing modal trap owns the order of enabled, visible tab stops and skips inactive radios; four focused Windows-WebKit compatibility cases now pass without weakening assertions.
- Windows clipboard lock fixture did not deny a direct native write on this host. Do not claim that experiment verified OS denial. Unit/adapter/UI error cases are separate. Native Save/Cancel keyboard actions pass with a debug-only isolated initial folder after helper capture/cache failures; no dialog bypass.
- First native regression run had 22 passed / 1 debug restart attachment timeout under concurrent tool compilation. Serialized rerun passes all 29; the failed attempt remains retained and its cause is unproven.
- Fresh approved-5B release trial has 0.8393% live / 0.2395% planning CPU; historical 9.0599% was not reproduced. Further diagnostic profiling and a final M6 trial are separate; no animation/target change is justified by a lower single sample.

- Final d53821d: Windows 772 unit / 102 browser / 41 Rust / 29 native regression / 13 native sharing / 5 optimized smoke pass. ARM and Intel hosted CI each pass 772 unit / 41 Rust / 93 WebKit and package development app/DMG; physical Mac remains Blocked.
- Final M6 CPU/frame targets fail (4.8013% live / 2.8925% planning). Exact approved-5B repeat also fails (4.6059% / 2.8825%), with similar renderer and frame costs. Preserve all trials; do not call the historical issue fixed or infer statistical significance. Related 5A diagnostic implicates browser/GPU/motion contributions, not a proven root cause; no shipped animation or budget changed.
