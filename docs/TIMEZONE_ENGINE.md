# Timezone engine — Milestone 1

Milestone 4 retains this engine and all foundation tests. Persistence validates/canonicalizes saved zones using its existing `normalizeZone` API; it does not introduce another timezone system. The scheduling worker imports the same domain modules. See [PERSISTENCE.md](PERSISTENCE.md) and [Milestone 4 verification](MILESTONE_4.md).

Milestone 3 scheduling consumes this unchanged facade for offsets, transition boundaries and civil-date existence. It compiles exact absolute state ranges from participant-local schedules; it does not introduce a second timezone resolver. See [SCHEDULING_ENGINE.md](SCHEDULING_ENGINE.md) for fold/gap/overnight policy and full-duration coverage.

Longitude stores selected time as integer epoch milliseconds. `null` in application state still means live time; this milestone does not alter that store or its interactions. Domain code has no Tauri, Windows, filesystem, storage, React, DOM or network imports. Its only external runtime import is `@js-temporal/polyfill`.

## Supported inputs and timezone data

Instants must be safe integers in the inclusive UTC envelope `0001-01-01T00:00:00.000Z` through `9999-12-31T23:59:59.999Z`. Conversion to a local date must also remain within Gregorian years 1–9999; a zone can move a boundary instant outside that range, in which case conversion rejects it. Out-of-range values, NaN, infinities, fractional milliseconds, strings and implicit coercion are rejected. Civil year/month/day/hour/minute values are individually checked and the actual calendar date is validated with overflow rejection, so February 30 is never described as a DST gap. Date arithmetic rejects results outside the envelope.

`normalizeZone(unknown)` validates with Intl, returns the runtime's canonical casing/link spelling and rejects numeric offset identifiers, whitespace and non-string values. `isValidZone(unknown)` is a nonthrowing type guard. Every named IANA identifier recognized by the installed runtime is accepted, including UTC, aliases and `Etc/GMT` names. Different named zones sharing an offset remain different identifiers. Legacy alias spellings can vary with ICU (e.g. Calcutta/Kolkata); this is runtime canonicalization, not a newly bundled fixed tzdb or a promise that runtime spelling matches the newest IANA release.

Runtime ICU/IANA data is authoritative. The polyfill does not bundle an independent tzdb; it also uses Intl. Offline operation requires no geolocation or timezone web requests. Updated laws/rules require an updated Node runtime or desktop WebView. No calendar availability is inferred. Native system-timezone change notifications are not implemented yet; `systemZone` safely normalizes the runtime result, defaults to UTC on failure, and allows an injected reader for portable tests.

## Existing public facade, strengthened behavior

| API | Contract |
| --- | --- |
| `wallTime(zone, at)` | Gregorian local year/month/day/hour/minute/second/weekday, with explicit Latin numerals and 00–23 hour cycle. Weekday 0 is Sunday. Cached Intl formatter; no local Date parsing. |
| `offsetSeconds`, `offsetMinutes` | Offset at that exact instant. Historical offset seconds are retained; minutes can therefore be fractional. Never use this value as zone identity or persist it as the source of truth. |
| `resolveWall(zone, y, m, d, h, min, policy?)` | Validated minute-precision local entry, returning `ok`, `ambiguous` with both ordered alternatives, or `nonexistent` with gap size. Default remains compatible with the existing TimeReadout. |
| `startOfLocalDay(zone, at)` | First actual instant of the containing civil day, including dates whose midnight was skipped/repeated. Uses Temporal startOfDay. |
| `addLocalDays(zone, at, days, policy?)` | Calendar-day arithmetic preserving wall time, seconds and milliseconds. Zero returns the same instant, including the later instance of a fold. It is not elapsed 24-hour arithmetic. |
| `dayNumber`, `dayShift` | Compare complete local Gregorian dates, including date-line differences of two dates. Explicit UTC setters avoid Date.UTC's years 0–99 remapping. |
| `nextTransition(zone, from, horizonDays=45)` | First detected offset change strictly after `from`, including one exactly at the elapsed-day horizon. Horizon must be an integer 0–3660. Zero and UTC return null. No rounding of the input instant or transition to a minute. |
| Existing format helpers | Existing modern 12/24-hour display contract, offset/difference/date labels preserved; time-format object requires a boolean. Historical offsets can display seconds. Relative-span helpers validate both instants. |

All time conversion and arithmetic belongs behind this facade. Scheduling must import it rather than add a second timezone resolver. Milestone 2 wires UI date arrows and dial day keys to civil-day arithmetic. `time-selection.ts` snaps to local-minute grids while retaining exact historical offset seconds; `time-axis.ts` constructs actual local-day bounds and hour/transition cells. A skipped midnight starts at the first actual instant of that date; its following midnight is independently resolved. Repeated hours retain distinct instants/offsets. The Milestone 1 conversion, validation and transition engine remains unchanged.

## Ambiguity policies

The optional final policy on `resolveWall` and `addLocalDays` is one of these exact strings:

| Policy | Repeated time (fold) | Skipped time (gap) |
| --- | --- | --- |
| `compatible` (default) | Choose earlier occurrence | Move forward by the gap |
| `earlier` | Earlier occurrence | Move backward by the gap |
| `later` | Later occurrence | Move forward by the gap |
| `reject` | Throw RangeError | Throw RangeError |

For `ambiguous`, `alternatives` always lists earlier then later even when the chosen `instant` is later. For `nonexistent`, the result retains its kind and actual gap size, including Lord Howe's 30 minutes and Apia/Manila's skipped civil date (1,440 minutes). Invalid dates are rejected before this process. There is no implicit native Date parsing of timezone-specific local text.

The implementation constructs a Temporal PlainDateTime with overflow rejection, resolves earlier and later, and compares their local projections. Different instants that both project back to the requested wall time form a fold; different projections form a gap. This preserves the existing result union while using the tested library's timezone-aware conversion. It does not patch Date or global Temporal.

## Transition discovery and bounded caches

The pinned polyfill's `getTimeZoneTransition` implementation was inspected. It skips searches before 1847 and caps searches three years beyond the later of the query or current time. Its two-week probes are also coarser than this application's warnings need. Therefore `nextTransition` deliberately does not use that API. It searches offsets through Intl in six-hour intervals inside a bounded horizon and bisects a changed interval to the first millisecond. A small extra day of look-ahead is cached to avoid rescanning fixed-offset locations on every live second; results are still filtered against the caller's exact requested bounds.

This assumes offset changes in the runtime IANA data are separated by at least six hours. A hypothetical offset change and reversal entirely between two probes cannot be discovered through this search. The application does not ship a complete transition table, and makes no claim to validate every historical political timezone rule independently of ICU. Tests cover the pre-1847 Manila date-line change to second precision and modern full/half-hour transitions. A future need for formal exhaustive transition enumeration would require a maintained bundled tzdb adapter, not silently claiming that sampled Intl output provides one.

Cache bounds: 512 normalized input names, 256 wall formatters, 512 abbreviation formatters and 256 per-zone transition search records. Cached transition objects are frozen. A cached transition is reused only before it occurs and is filtered against the new horizon; a cached null is reused only when the full query lies inside the previously searched interval. Backwards searches, longer horizons and same-hour half-hour UTC transitions are tested. Abbreviations cache formatters rather than strings in coarse time buckets, avoiding label leakage at transition boundaries.

## Dependency tradeoff and verification

The Temporal polyfill adds runtime/bundle cost; Intl retains the hot path for existing dial and row displays. [Dependency review](DEPENDENCIES.md) records maintenance/licensing/security and exact pins. [Testing](TESTING.md) records the Node and Edge checks. [Performance](PERFORMANCE.md) records actual hardware, baseline measurements, provisional budgets and headless-browser limitations.

The original five tests remain unchanged. Additional tests cover all runtime-enumerated zones against independent Temporal projections, known absolute fixture values, strict rejection, London/Sydney/Lord Howe DST, half/quarter-hour zones, historical seconds, civil midnight anomalies, leap/century dates, cache freshness, host-offset independence and import boundaries. This establishes behavior for the installed runtime; future timezone law changes cannot be predicted beyond that runtime's data.
