# Milestone 6 dependency review (before addition)

October 20, 2026. No new runtime JavaScript/timezone dependency is needed. Keep the established engines and schema.

- `tauri-plugin-clipboard-manager = 2.5.0`: current stable Tauri 2 official plugins-workspace release, Apache-2.0 OR MIT, Rust 1.90; maintained alongside Tauri, supports Windows/macOS. Needed for native text clipboard writes. No clipboard reads, monitoring, images or JavaScript plugin capability will be granted. Do not select the available 3.0 alpha.
- `tauri-plugin-dialog = 2.8.3`: current stable official Tauri 2 release, Apache-2.0 OR MIT, Rust 1.90; native Windows/macOS file selection. Rust-only wrapper limits export to a user-selected calendar destination. No general filesystem/plugin-dialog frontend permission. Disable unnecessary Linux default GTK feature for the approved Windows/macOS targets.
- `ical.js = 2.2.1`: development-only independent calendar parser, MPL-2.0, maintained at kewisch/ical.js; registry metadata lists no dependencies. Needed to independently parse event times, descriptions, recurrence and Unicode instead of testing a serializer against itself. Never bundled into application code; retain its license in development review.

Sources checked: [official clipboard API](https://v2.tauri.app/plugin/clipboard/), [official dialog API](https://v2.tauri.app/plugin/dialog/), crates.io stable-version metadata and `cargo info`, npm registry package metadata, [ical.js upstream](https://github.com/kewisch/ical.js). Pin versions, inspect resolved lockfile/licenses and run npm/RustSec audits after installation. Existing five high development advisories and all-target Rust warnings are not presumed fixed by these additions. A release or version number alone is not a security certification.

Sharing uses two main-window-only app commands. Native code validates text/filename/content bounds, presents the Save dialog, then atomically writes only that selected `.ics` path. Frontend-supplied paths are never accepted; no filesystem, shell, network, external service, account or telemetry permission is added.
