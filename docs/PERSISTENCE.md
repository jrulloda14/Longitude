# Persistence architecture and schema — Milestone 4

Milestone 5A follow-up: the Windows Tauri host now implements this fixed-command storage contract with app-config paths, locks, synced temporary files and atomic replacement. A Rust state authority owns durable writes after hydration. The schema/repository below remains shared; see [desktop architecture](DESKTOP_ARCHITECTURE.md) and [Windows verification](MILESTONE_5A.md). Actual macOS behavior and physical power-loss guarantees remain unverified.

The existing reducer remains the source of application state. `src/persistence/schema.ts` selects and validates durable fields; `ConfigurationRepository` handles migration, revisions, recovery and serialized writes. The platform supplies only asynchronous reads and compare-and-swap commits. Neither the timezone nor scheduling engine imports storage, browser or native APIs.

## Durable configuration

The `longitude.configuration` key holds one JSON record:

```ts
{ format: 1, current: string, previous: string | null, recovery: string | null }
```

`current` and `previous` are serialized schema envelopes:

```ts
{ version: 1, revision: number, data: {
  groups, activeGroupId, settings, meeting, onboarded, coach
} }
```

Groups retain names, stable IDs, ordered locations and reference IDs. Locations retain city/country, normalized IANA timezone, coordinates/approximation flag, custom label (`note`), favorite, working days, up to eight split/overnight work intervals and sleep hours. Missing legacy favorites default to true, preserving existing compact-widget rows. Favorites affect the existing compact widget; they do not remove participants from scheduling. Different cities sharing a timezone remain distinct locations.

Settings include theme, 12/24-hour format, 1/5-minute precision, caption preview, motion preference, timeline visibility, default work hours, widget opacity/pinning and tray preference. Native-only preferences are saved values; they do not implement native window/tray behavior. Meeting title, default duration and weekly preference persist. Selected/live instants, current ticks, current view/mode, dialogs, recommendation results, search ranges/subsets/filters and fairness search options remain session state. Reload opens the live clock.

## Validation and migration

Every read validates unknown input and reconstructs known fields. Missing fields receive deep defaults; unknown fields are ignored. Timezones use the established Milestone 1 normalizer, so aliases may canonicalize according to installed ICU. Invalid timezone rows are omitted, valid siblings retained. Duplicate/invalid IDs are deterministically repaired and dangling references/active-group IDs receive valid fallbacks. Empty damaged collections recover to an empty usable group. Workdays permit an empty list; overnight intervals retain start-weekday semantics from Milestone 3.

Limits: 32 groups, 32 locations per group, eight intervals per participant, seven unique weekdays, 2 MiB UTF-8 per schema envelope, 8 Mi characters per outer record. Text, numbers, enums, coordinates, working/sleep endpoints and meeting duration are bounded. Writes validate again. Warnings are capped at 100. Revisions are finite nonnegative safe integers; exhaustion refuses further saves.

An unversioned legacy `longitude.v1` snapshot migrates to version 1 in memory and commits to the new key only after hydration. The legacy key remains unchanged. Version 0, malformed versions/JSON and failed migration recover through a valid previous envelope or defaults. Valid current configuration survives damaged backup/recovery metadata. Unknown future numeric schema/storage formats block saving entirely, preserving bytes for a newer application.

## Hydration and write ordering

An initial loading gate prevents controls from editing fallback settings while asynchronous storage is loading. React StrictMode shares an in-flight load and restores the notification subscription. Durable state is queued in a layout effect after hydration; live ticks and temporary planning changes do not enqueue writes. A failed read keeps the gate open with Retry and explicit Continue without saving. The latter disables all saves for that session; it never replaces unread saved data.

Microtasks coalesce consecutive updates without a long debounce window. Only one commit runs at once; updates arriving during it replace the pending snapshot with the latest complete configuration. A failed commit retains pending state for Retry. Page visibility/pagehide also request a flush. Browser tests cover immediate reload after a settings update, rapid updates, delayed reads, StrictMode and actual browser-process restart. These checks do not guarantee completion of an arbitrarily delayed native write during sudden termination.

## Atomic storage and recovery

The web adapter uses a fixed Web Lock around a raw-byte comparison and single-key `localStorage.setItem`. Configuration, previous valid snapshot and recovery bytes commit together. A failed/interrupted adapter commit leaves the old atomic record; successful commits install the complete new record. A competing tab with stale expected bytes stops saving with a reload notice instead of overwriting another tab. There is no automatic cross-tab merge. Web Locks are required for writes; an unsupported runtime fails visibly instead of silently weakening this protection.

Damaged input is retained verbatim in `recovery`. Later corruption retains the entire damaged record, including prior recovery data, rather than silently deleting the older copy. Recovery growth beyond the bound or browser quota failure pauses saving and leaves original storage intact. A normal commit rotates the valid head to `previous`; only one ordinary previous revision is retained. Recovery notices can be dismissed; errors support retry. No automatic export/recovery-file viewer is added.

Atomic API behavior and injected interrupted writes are tested. `localStorage` persistence ultimately depends on browser profile storage; filesystem power-loss/fsync guarantees are not claimed. Data is local, unencrypted and origin/profile-specific. Clearing site data removes it. A development origin and packaged origin do not share storage automatically. No accounts, cloud sync, telemetry or remote storage are introduced.

## Tauri 2 and macOS boundary

`tauri-storage.ts` exposes an injected invoke adapter for two fixed commands: `longitude_read_configuration` and `longitude_commit_configuration`. Both accept only the known logical keys; the legacy key is read-only. Commit accepts expected/current bytes and returns whether the atomic conditional replacement succeeded. Tests exercise argument/response behavior and key restrictions with a fake invoke implementation.

Milestone 5A supplies the Rust host and window-scoped permission manifests. Fixed keys map to app-config files; conditional commits use file locks, flushed temporary files and atomic replacement. The main window alone hydrates/migrates files; after initialization, the authority owns durable commits. No general JavaScript filesystem capability is granted. Native Windows restart/interruption results and remaining acceptance checks are reported separately. macOS filesystem/WebView behavior and hardware power-loss durability remain unverified. The schema/repository and timezone/scheduling engines need no OS-specific rewrite.

See [Milestone 4 results](MILESTONE_4.md) and [testing](TESTING.md).
