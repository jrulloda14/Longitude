# Scheduling engine

Milestone 3 uses configured hours to judge suitability. It never reads calendars or claims confirmed availability. All timezone offsets, transitions and civil resolution come from the established `lib/time.ts` facade. No new dependency, server, worker, network call or platform API is introduced.

## Configuration and semantics

`WorkingHours` retains legacy `start`, `end`, `days`. Optional `intervals` replaces the single pair; the editor mirrors the first interval into the legacy fields. Each interval uses local minutes: start 0–1439, end 0–1440. End before start means the following day; 1440 means midnight at the end of the start date. Equal endpoints are invalid for work. Up to eight intervals share one set of **shift-start weekdays**, Sunday=0. Empty days means no working hours. Overlapping/adjacent work intervals are unioned and never double-counted.

Friday 22:00–06:00 therefore includes Saturday 02:00 and excludes Friday 02:00 unless Thursday is also a working day. A completely skipped start date does not manufacture an overnight tail. Sleep is a daily local window; equal endpoints disable sleep. Sleep overrides overlapping work. The editor warns about conflicts instead of silently treating sleeping hours as working. Edge time is the civil hour before/after an anchored work interval, excluding work/sleep. Weekends are the complement of the participant's configured working days, not a universal Saturday/Sunday rule.

Working/sleep intervals are recurring **wall-minute predicates**. During a fold both occurrences of a configured interval count. A narrow 01:15–01:45 shift can produce two disjoint absolute ranges with a non-work gap between them. During a gap nonexistent minutes count zero; a shift entirely inside the gap has no work time. Durations and overlap are always elapsed absolute minutes. Historical offset seconds are retained.

## Exact interval compilation

1. Validate participants, hours and the absolute search envelope before expansion.
2. Ask the timezone engine for offset transitions and split the absolute window into constant-offset segments.
3. Enumerate Gregorian civil dates/weekdays with UTC date arithmetic only. This is calendar enumeration, not another timezone resolver. Check shift-start date existence through the established resolver, cached separately.
4. Place each civil work/edge/sleep interval onto each constant-offset segment using that segment's engine-provided offset; intersect it with the segment/window. This naturally includes both fold occurrences and removes nonexistent minutes. Include neighboring dates for overnight tails and edge hours.
5. Sweep start/end count events in absolute order. Precedence is sleep, work, edge, off. Merge adjacent equal states into disjoint half-open `[start,end)` ranges covering the whole window.
6. Build cumulative elapsed durations by state. Binary search at the meeting start and end gives exact per-state coverage; it does not sample start times or sample every 15 minutes. A meeting ending exactly at work end is inside work, but even one millisecond beyond it is not.

`stateDuring` reports the worst state touched by any positive duration. `evaluate` supplies each participant's exact working/sleeping minutes and normalized weighted burden. `commonWorkingRanges` sweeps work ranges for intersection across all participants, clipped to the query. Its legacy `step` argument is validated but no longer controls accuracy. Hourly timeline cells retain their existing geometry/labels and use exact color stops inside each cell; row strips use the same exact state ranges.

## Search and filters

`suggestTimes` considers starts on an elapsed grid anchored at `from`; the UI uses 30 minutes. Only starts whose **entire duration fits inside** `[from,to)` are considered. This is a bounded grid search, not an exhaustive optimizer over every possible millisecond. Exact scoring/coverage applies to every candidate. The existing default 90-minute separation greedily picks distinct alternatives in ranked order; the domain exposes `separationMin`, including zero.

- Participant subset: unique known IDs. Empty subset gives no fabricated result. The UI requires at least one recommendation participant. Group-wide timeline/suitability/share context remains whole-group and the dialog explicitly says so.
- Minimum fully working locations: those whose entire meeting duration is in working hours.
- Minimum shared minutes: total elapsed minutes during the meeting when **all selected recommendation participants simultaneously work**. Disjoint shared spans are summed; this is not the shortest individual working total.
- Preferred window: a hard whole-meeting constraint in an explicit IANA zone, including overnight windows. The UI uses the reference zone at Search time.
- Inclusive civil-date controls: from first actual instant of the first date through the end of the last date. Invalid, skipped, reversed and over-limit ranges are rejected. On a fall-back, 31 civil days can exceed the 31-elapsed-day cap and must be shortened.
- Custom requests retain the selected instant at Search for proximity ranking. Live ticks do not rerank them. Default one-day results rank near the selected minute. Group switch/unmount resets the local search session; these filters are not durable configuration in Milestone 3.

## Deterministic ranking and explanations

Candidates are ranked lexicographically, ascending:

1. Total sleeping person-minutes.
2. Total outside-work person-minutes (sleep + off + edge).
3. Total off-hours person-minutes.
4. Optional fairness: maximum prior + current normalized burden across participants; zero when disabled.
5. Absolute distance from the selected search instant.
6. Earlier absolute instant.

Current burden weights work=0, edge=1, off=3, sleep=8, weighted by exact elapsed coverage and divided by meeting duration. Prior burden must be an explicit finite nonnegative bounded record keyed by selected IDs. The UI starts all participants equally and tracks no history. Fairness only breaks ties after aggregate sleep/outside/off penalties; it never improves one person's share by accepting more aggregate sleep time. Participant IDs are canonically sorted before aggregation so input ordering cannot change floating-point ties. No randomness or current-time read occurs inside search.

Every result includes its numeric score, full-work participant count, simultaneous shared minutes and plain-language reasons. Existing suggestion buttons expose these through accessible names/tooltips; “Why these times” expands them visibly. Results remain in ranked order rather than chronological order. These scores are an explicit suitability policy, not a probability of attendance or a calendar booking guarantee.

## Validation, bounds and caching

- At most 32 unique participants, eight intervals each, seven unique weekdays, 31 elapsed search days and 5000 candidate starts.
- Integer meeting duration 1–1440 minutes; step 1–1440 minutes; count 1–50; separation 0–1440 minutes.
- Minimum participants 0–selected count; minimum shared minutes 0–duration. Unknown/duplicate subset IDs, invalid zones, NaN/infinity, fractional counts and negative prior burdens are rejected.
- Scheduling ranges must be positive and at least two elapsed days inside the timezone engine's UTC year 1–9999 envelope, allowing neighboring civil-date enumeration. Normal UI date controls further restrict dates to years 2–9998. The timezone engine itself retains its wider Milestone 1 contract.
- 64-entry LRU of compiled profiles, keyed by zone/configuration/exact query bounds; 1024-entry LRU of date existence results. Configuration changes invalidate through content keys. Public state-range results are copies; callers cannot mutate cached ranges. Both caches are process-local and bounded; no persistence or platform dependency exists.

With E state boundaries, C candidate starts and P participants, query coverage is approximately O(P × C × log E), plus calendar/transition compilation and candidate sorting. The engine compiles each participant profile once per search and reuses it across candidates. Large custom queries run on explicit Search, not every live tick. Profiling and worker decisions are recorded in [PERFORMANCE.md](PERFORMANCE.md).

## Verification and limits

Permanent tests cover both original defects, a one-millisecond end crossing and a one-minute sleep interval hidden between old samples. An independent slow wall-minute oracle checks full-day state partitions at every minute in ten zone/date scenarios, including modern DST, fractional offsets and Apia. A brute-force oracle separately compares all candidate scores/order for a 47-minute meeting. Exact historical-second and millisecond fixtures supplement the minute oracle; the oracle is not an independent tzdb implementation.

See [TESTING.md](TESTING.md), [MILESTONE_3.md](MILESTONE_3.md) and raw evidence. Timezone transitions retain the Milestone 1 six-hour separation assumption and installed ICU/tzdb limits. No per-date exceptions, per-interval weekday sets, public holiday database, calendar busy/free data or recurring-meeting fairness history is inferred. Native delivery and validated durable configuration remain later milestones.
