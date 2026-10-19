# Meeting sharing and calendar export - Milestone 6

## Canonical meeting data

The existing share sheet consumes the same selected instant, duration, active group's ordered locations, custom participant labels and working/sleep schedules as the clock, timeline and recommendations. It does not reconstruct a UTC instant from formatted local text. Each participant receives local start/end times, explicit calendar dates (including different start/end dates), IANA zone, actual abbreviation, offset and runtime standard/daylight name. Work compatibility comes from the scheduling engine's exact whole-interval coverage, including overnight shift-start weekdays. Missing schedules are identified rather than invented. Configured hours are not confirmed calendar availability.

Full, one-line chat, participant-local and UTC copy modes use the same builders as their visible previews. Buttons report success, cancellation, download initiation and errors inline. No Slack, Teams, email or calendar service is contacted. Browser download initiation is not confirmation that a file reached disk.

## RFC 5545 serialization

`src/lib/share.ts` remains the existing facade. It writes UTF-8 text with CRLF, a final CRLF, VCALENDAR/VERSION/PRODID and one VEVENT with UID, DTSTAMP, CREATED, DTSTART, DTEND, SUMMARY and DESCRIPTION. DTSTART/DTEND/DTSTAMP/CREATED are UTC `YYYYMMDDTHHMMSSZ`; there are no floating local values. Calendar fields have whole-second precision: sub-second instant precision is truncated on serialization, with the same integer-minute elapsed duration preserved. Date formatting, offsets, civil resolution and calendar arithmetic use the established IANA engine.

Text escaping handles backslash, comma, semicolon, LF, CRLF and lone CR. Physical lines, including continuation whitespace, are at most 75 UTF-8 octets. Folding iterates Unicode code points and never splits a UTF-8 sequence. Unpaired surrogates, forbidden control characters, malformed zones/instants, titles over the established 500-character limit, invalid durations or oversized participant/recurrence sets are rejected. Display text is not HTML or executable calendar properties.

An export session owns a cryptographic UUID UID and creation timestamp in the existing app shell. Title/time/duration/group edits, repeated exports and closing/reopening the sheet preserve identity. **New event** explicitly replaces identity and resets the repeat basis. Restarting the application creates a new volatile export session; these identifiers are not durable preferences. DTSTAMP reflects export time, not the selected meeting date.

Filename suggestions use an ASCII slug with an 80-character stem, `.ics`, a fallback for all-Unicode/empty names, and Windows device-name protection. The original Unicode title remains intact in the event. The native destination must retain the `.ics` extension; the frontend cannot supply a path.

## Existing weekly option

The existing 12-occurrence weekly switch is retained. Fixed UTC is the explicit default. The optional reference-zone wall-time basis stays with the export session across sheet reopening; it is not added to the Milestone 4 schema. Its gap policy shifts forward, its fold policy chooses the earlier occurrence, and the original selected fold instant is retained unchanged. Elapsed duration stays fixed.

Fixed UTC emits bounded `RRULE:FREQ=WEEKLY;COUNT=12`. Reference-wall mode enumerates bounded occurrences with the existing `addLocalDays` engine and exports explicit **UTC RDATEs**, not floating values or a second timezone implementation. RDATE includes the initial DTSTART redundantly: RFC recurrence sets deduplicate it, and this also accommodates the independent parser's RDATE-only iterator behavior. Preview, occurrence warnings and export use the same occurrence builder. The underlying validated helper supports 2-52 occurrences; UI remains the existing 12, not an unbounded recurrence editor.

This is a documented adjustment to the earlier plan's TZID/VTIMEZONE proposal: the user's M6 requirement explicitly requires UTC DTSTART/DTEND, and a finite UTC recurrence list preserves resolved wall-time choices without shipping another tzdb or VTIMEZONE generator. A client's future timezone database changes do not recalculate these exported resolved dates. No recurring calendar event is created automatically.

## Contextual offset awareness

The existing inline DstNotice presentation delegates explanations to `lib/meeting-dst.ts`. It compares selected-date offsets with today's offsets, identifies changes during a meeting and relevant upcoming transitions within 14 elapsed days, and explains local-time changes across weekly occurrences. It does not assume a one-hour shift or infer daylight time from January. Runtime long names distinguish standard/daylight where the runtime supplies those names; generic offset changes can also be political rule changes. Whole skipped dates and half-hour transitions use the engine's explicit policies. Existing direct-entry gap/fold notices and the second-fold choice remain in TimeReadout.

## Cross-platform I/O and permissions

| Operation | Browser preview | Windows / macOS Tauri |
| --- | --- | --- |
| Copy text | Browser clipboard, bounded-lifetime textarea fallback and focus restoration | `longitude_copy_text`, official clipboard manager, write only |
| Export | Local Blob download; reports download started | `longitude_save_calendar`, native Save panel followed by selected-destination atomic write |
| Cancel | Browser download has no reliable cancellation result | Picker returns no destination: neutral cancelled result |
| Failure | Clipboard/download errors remain visible | IPC, validation, prepare/write/replace/sync errors are distinct from normal cancellation |

Both commands are main-window-only; widget calls are denied in capabilities and native code. No frontend clipboard read, generic plugin-dialog, filesystem, shell or network capability is granted. Clipboard data is bounded to 128 KiB, export to 256 KiB and 75-octet CRLF lines. A second simultaneous Save is rejected. Quit is deferred until the pending Save finishes or is cancelled.

Rust obtains the path only from the native picker. It writes/syncs a same-directory tempfile, atomically replaces that selected file, and syncs the directory on Unix. Prepare/write/replace failures preserve the old destination. A failure after replacement but during directory sync has an uncertain durability outcome and tells the user to verify before retrying. Sudden termination/power loss is not certified. The ordinary configuration repository, CAS/locks/recovery and schema are unchanged.

The upstream picker returns `Option<FilePath>` rather than a separate OS-dialog-error result: no returned path is treated as cancellation. An OS picker failure reported as None cannot be distinguished from user cancellation by this API. Post-selection filesystem failures do return explicit errors. Browser downloads likewise cannot certify disk completion.

Debug builds with the existing `LONGITUDE_TEST_ROOT` use that isolated root as the picker's initial folder, protecting user Documents during tests. This does not preselect or bypass Save/Cancel and is excluded from release builds. No arbitrary frontend path is accepted.

## Validation and limits

`ical.js` 2.2.1 is a development-only independent parser: tests verify UTC event bounds, elapsed durations, decoded Unicode/text, required properties, injection resistance and both recurrence modes. The actual Windows-exported [calendar](evidence/milestone-6/native-export.ics) is independently parsed and compared with the visible preview; [validation record](evidence/milestone-6/native-export-validation.json). Tests include spring-forward/fall-back, both fold instants, Lord Howe, Kathmandu, local midnight and Apia's skipped date.

Actual Windows clipboard/Save/Cancel and permission tests are distinct from adapter mocks, temporary-file Rust tests and Mac CI. The experimental Windows clipboard-lock fixture did not force OS denial on this host; it is not presented as a native error pass. Physical macOS clipboard/picker/TCC/accessibility behavior remains unverified. Outlook, Google Calendar and Apple Calendar manual imports were not performed; successful independent parsing is not client-import certification. No accounts, external APIs, OAuth or release publication are part of M6.

Sources: [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545.html), [official Tauri clipboard API](https://v2.tauri.app/plugin/clipboard/), [official dialog API](https://v2.tauri.app/plugin/dialog/), [independent parser](https://github.com/kewisch/ical.js). Exact results, source revisions and limitations are in [MILESTONE_6.md](MILESTONE_6.md).
