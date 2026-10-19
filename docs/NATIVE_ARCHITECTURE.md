# Native architecture - Milestones 5A and 5B

This is the native-platform contract entry point requested for 5B. The existing [desktop architecture](DESKTOP_ARCHITECTURE.md) remains the detailed shared-state description. [5B verification](MILESTONE_5B.md), [Mac acceptance](MACOS_ACCEPTANCE.md) and [build/signing instructions](BUILD_AND_RELEASE.md) separate implementation, CI compilation and physical-device acceptance. No Milestone 6 implementation is included.

## Platform boundaries

| Layer | Shared behavior | Platform differences |
| --- | --- | --- |
| React/TypeScript | One frontend, reducer, selected instant, timezone/scheduling engines and configuration schema/repository | Existing chrome reserves native Mac traffic lights; browser preview retains illustrative controls |
| Native state | Validated revisioned snapshots, optimistic queue, Rust authority and both-window broadcasts | No secondary Mac state or timezone engine |
| Storage | Fixed keys, file locks, same-directory tempfile/sync/atomic replacement, CAS and current/previous/recovery record | Tauri application directories; POSIX directory sync is conditional on Unix |
| Services | Official shortcut/autostart/single-instance plugins, placement, pinning, visibility and flush-before-Quit | Mac application/status menus, Dock activation/reopen, appearance and Spaces; Windows tray clicks and NSIS remain isolated |
| Packaging | Identity `app.longitude.desktop`, shared assets and notices | Mac OS 12 target, ARM64/Intel .app/DMG/ICNS; Windows npm.cmd/current-user NSIS |

OS facts come from Rust rather than the persisted design preview. Shared domain code never imports native services. Native clipboard/export dialogs remain Milestone 6. There is no server, account, synchronization or telemetry.

## Narrow commands and capabilities

| Commands | Caller | Protection |
| --- | --- | --- |
| `longitude_read_configuration`, `longitude_commit_configuration`, `longitude_initialize` | Main only | Fixed keys, schema/size limits, CAS; raw commits rejected after authority initialization |
| `longitude_snapshot`, `longitude_apply_state` | Main/widget | Bounded validated state and revision conflicts; future/unreadable data protected |
| `longitude_window`, `longitude_environment` | Main/widget | Fixed operation names and labels, bounded widget height; no arbitrary path or window creation |
| `longitude_quit_ready` | Main/widget | Current generation and successful client flush acknowledgements |

Capabilities add only those commands, event listen/unlisten and drag start. No remote origins, wildcard windows, general filesystem/shell/HTTP/notification or frontend shortcut/autostart permissions exist. Production CSP restricts scripts/assets to local resources and connections to IPC. Four permission guards complement real Windows denied-command tests; these are not a native Mac runtime certification.

## Native behavior

Windows retains custom caption controls, left-click tray toggle and hide-with-tray/otherwise-Quit. Mac uses real decorated overlay traffic lights, app-wide Edit/Window/Hide/Settings/Quit menus and primary status click to open its menu. Application-owned IDs use `mac:` to avoid duplicate tray dispatch. Group and selected-time changes use the shared authority. The regular Dock entry remains available without a status item; reopen/second launch restore main.

Preferences are validated before OS changes; failures restore prior settings. Mac `system` appearance resets automatic native appearance, while explicit dark/light preferences reach Tauri's app theme. Windows appearance behavior is unchanged. Future read-only configuration still blocks native preference changes. Shortcuts are compared as parsed chords: Ctrl/Control aliases do not re-register the same owned shortcut. Bare typing keys, Command-only Mac application chords and Control+Space input-source chords are rejected before registration. Other conflicts are reported by the OS/plugin; old ownership is retained until replacement registration succeeds. The Windows external-conflict test uses a separate process holding a real chord, replacing the insufficient old alias-only test.

The independent native widget reuses CompactWidget, selected instant and settings. Its native Mac close action is a neutral X in the existing control footprint, not an HTML imitation traffic light; the main window uses actual native traffic lights. Browser design preview retains its illustrative dot. Pinning is reapplied on connect/show; opacity retains the existing 60-100% surface compositing. Fullscreen geometry is excluded from normal placement cache/clamping. Real Retina, mixed/removed displays, transparency, focus, Spaces/fullscreen and Stage Manager behavior requires physical testing. Transparent Mac windows use documented Tauri private APIs and exclude the Mac App Store; no security bypass or broad entitlement is added.

## Persistence and Quit

Only durable groups/preferences reach disk; ticks, selected planning/session state and temporary search state do not. Main hydrates using the shared migration/recovery repository, then publishes canonical state. Queued updates rebase on revision conflicts. Paths resolve through `app.path().app_config_dir()`; frontend-supplied paths are rejected. Native filesystem tests cover locks, CAS, restart, prepared-file interruption, invalid paths and failures, not physical power loss.

Quit waits for both clients using generation-tagged flush acknowledgements. Failed/missing acknowledgements pause Quit and reveal main; successful completion saves placement, releases shortcuts and exits. Forced termination can lose uncommitted edits. A lost response after a committed non-idempotent edit may require canonical reload. Errors after atomic replacement but before metadata sync can leave an uncertain durability outcome requiring reconciliation. These limitations do not justify another platform schema.

## Build and verification boundary

Tauri 2's build-script allowlist inspects direct dependency features. A named Cargo feature alone does not prepare a fresh Mac checkout: invoke the official CLI (`tauri build --debug --no-bundle`) before direct Cargo tests. The first real Mac CI run exposed this failure; the corrected workflow performs that preparation. The allowlist and capabilities stay enabled.

CI records architecture, source, tests, signatures, hashes and Gatekeeper results. Ad-hoc packages are not trusted Developer ID/notarized releases. Hosted builds and Playwright WebKit cannot replace native WKWebView input, physical performance or [Mac acceptance](MACOS_ACCEPTANCE.md). Application metadata remains `UNLICENSED`; this phase does not select an application license.
