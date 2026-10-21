# Changelog

All notable changes are listed here. Versions follow [Semantic Versioning](https://semver.org).

## [0.1.0] - First public preview

### Features
- **Time zone comparison:** a live analog clock and rows for every location, with local time, date, offset, difference from your reference, and today/tomorrow/yesterday markers.
- **Planning:** drag the clock hands, scroll, use the keyboard or type a time; every location follows. DST gaps and repeated times are handled explicitly.
- **Working hours:** working, edge and sleeping hours per location (including overnight shifts and custom working days), shown on the rows and a 24-hour timeline.
- **Planner:** an overlap verdict and suggested meeting times within everyone's working hours, with a search across date ranges and participants.
- **Sharing:** four copy formats (full, one line, local times, UTC) and `.ics` calendar export, with optional weekly repetition.
- **Daylight-saving notices** for upcoming and selected-date offset changes.
- **Desktop integration:** a compact always-on-top widget, a tray or menu bar icon, a global shortcut and launch at sign-in.
- **Fully offline and private:** no account, telemetry or network access.

### Platforms
- **Windows 10/11 (x64):** per-user installer.
- **macOS 12+ (universal):** preview DMG. It isn't signed or notarized yet and hasn't been tested on physical Mac hardware.

### Known issues
- Installers aren't code-signed, so Windows SmartScreen and macOS Gatekeeper show a first-run warning ([how to install](docs/INSTALL.md)).
- In live mode, the animated "Live" indicator can use a few percent of CPU on older integrated graphics. Work to reduce it is in progress ([measurements](docs/evidence/milestone-7/PULSE_RESULTS.md)).

[0.1.0]: https://github.com/jrulloda14/Longitude/releases/tag/v0.1.0
