# Mandatory pre-implementation audit - Milestone 5B follow-up

Audited October 19, 2026 before application code changes. Starting commit: b52dce4cb39d168ee4375b8ee020b07fb7d7338b. Working tree was clean. No AGENTS.md was found. Existing Windows report, desktop architecture, platform/state contracts, Mac checklist, Tauri configs/capabilities/build manifest, native commands, placement/lifecycle, authority/storage, plugin implementations and packaging workflow were inspected.

## Existing implementation to preserve

- Shared React frontend, design components/tokens/fonts, clocks, timezone/scheduling engines, reducer/schema/repository and canonical native authority are implemented. No second Mac frontend or timezone/persistence engine is needed.
- Mac override already provides identity, OS 12 deployment target, native overlay traffic lights/inset, transparent widget, Retina ICNS, separate ARM64/Intel .app/DMG configuration.
- Native app/menu-bar actions, template status icon, prefixed dispatch, Dock reopen, close/hide/Quit flush, pin/opacity, Spaces configuration, Mac default shortcut and LaunchAgent-capable opt-in autostart are implemented but unverified on the native Mac runtime.
- Fixed Tauri application directories, locked compare-and-swap, atomic tempfile replacement and shared schema/recovery are portable. Actual APFS and hardware power-loss behavior remain unverified.
- Windows-specific npm.cmd/NSIS settings are isolated; Mac activation/reopen/Spaces behavior is guarded. Transparency uses a documented Mac-private-API feature and excludes Mac App Store submission.

## Confirmed gaps / follow-up scope

1. Explicit theme preferences change CSS, but the host does not apply the saved appearance to native Mac chrome. Add narrow Mac-only native appearance synchronization using existing Tauri APIs.
2. Shortcut parsing currently allows bare typing keys and compares aliases as raw strings, which can attempt duplicate registration of the same owned chord. Add validation/semantic ownership comparison and protect standard Mac application/system chords before any registration side effect. Preserve occupied-shortcut rollback.
3. docs/NATIVE_ARCHITECTURE.md is missing; the existing architecture is in DESKTOP_ARCHITECTURE.md. Add the requested entry point while reusing that architecture.
4. The authoritative Mac checklist records generic Unavailable values rather than Pass/Fail/Blocked and evidence per area. Update statuses without manufacturing native results.
5. Mac CI was configured but had never run. GitHub API confirmed the active workflow and authorized push access; manual dispatch returned HTTP 204 for the existing baseline. Both macos-15 ARM64 and macos-15-intel jobs started on hosted runners. Capture actual results and fix demonstrated failures.
6. This local environment is Windows x64, Node 24.15.0, only x86_64-pc-windows-msvc Rust target; no Xcode, sw_vers or local/connected physical Mac was found. CI availability does not establish physical-device availability.
7. Mac performance, Retina/mixed display/Spaces/Stage Manager, physical input/IME and real login/logoff/distribution acceptance remain blocked without an actual test Mac. Windows CPU budget failures remain open.
8. No new dependency is necessary. Existing advisories must be re-audited and recorded. The repository still declares UNLICENSED; do not invent an application license from the task's open-source description.

## Verification plan

Run typecheck, all unit/browser regressions, production frontend, Rust tests/format, explicit capability guards and fresh Windows native tests. Execute Mac CI on actual source commits, recording each target's logs/test/artifact status separately from physical acceptance. Keep previous evidence immutable. No Milestone 6 work, forced push, release publication, signing secrets or system-security bypass is authorized.

## Subsequent demonstrated findings

- Baseline Mac run 39264501704 failed on both architectures at the static Tauri feature allowlist. CLI preparation was added in 658d6e9; validation and capabilities were not bypassed.
- Run 39265526785 then compiled both native targets and passed their Rust suites, but each Mac WebKit suite had 68 passed / 4 failed: direct-entry pointer selection and modal keyboard/focus behavior. The failures are retained in architecture-specific logs.
- The prior Windows occupied-shortcut case only attempted an alias of its own binding. It was replaced with a genuinely competing process, plus a passing alias-equivalence case and rejected-bare-typing case.
- WebKit selection needed ownership of the first pointer default, while preserving later caret edits. Modal Escape/Tab handling needed document-level handling for the active modal when Safari leaves body focused, plus an explicit opener reference. These are interaction corrections in the existing components; classes/styles/layout and engines remain unchanged.

- A final source review found a remaining HTML red close dot in the native Mac widget. It is now a neutral X in the same footprint; browser preview preserves the original dot. Main traffic lights remain native. Added a third browser regression; final application source is `8f81408`.

- Final source `8f81408`, run 39269770931: both hosted Mac targets succeeded (696 unit / 33 Rust / 75 WebKit each, debug/release app/DMG builds). Downloaded artifact digests match GitHub. Strict ad-hoc signature verification passes; Gatekeeper rejects both (exit 3); physical Mac acceptance and performance remain Blocked.
