# Implementation handoff (Codex)

Everything here describes the prototype in `components/src/` and how to turn it into the Tauri 2 app. The prototype is real React + TypeScript + Tailwind; the timezone and scheduling logic is production-grade and unit-testable. What is *not* production-ready is listed explicitly under **Prototype-only and placeholder logic**.

## 1. Stack and layout

- Tauri 2 · React 18 · TypeScript (strict) · Tailwind 3.4 (`preflight: false`, all colours are CSS variables) · lucide-react · no state library, no animation library, no chart library.
- Fonts: bundle Geist locally (`@fontsource-variable/geist`) — the app must work offline. Fallbacks are in `--font-sans`.
- Source tree (`components/src/`):

| Path | Responsibility | May import |
|---|---|---|
| `lib/time.ts` | tz engine: offsets, wall time, DST transitions, wall→instant resolution, formatting | nothing |
| `lib/sun.ts` | solar elevation → day / twilight / night | `time` (types) |
| `lib/schedule.ts` | day states, overlap verdicts, common working ranges, suggestions | `time` |
| `lib/share.ts` | summary text, one-line summary, RFC 5545 ICS | `time` |
| `lib/search.ts` | city / IANA / abbreviation / offset search | `cities`, `time` |
| `lib/parse.ts` | typed time-of-day parser | nothing |
| `lib/cities.ts` | city catalogue (name, country, IANA zone, lat/lon) — **no offsets** | `time` |
| `platform.ts` | the ONLY module touching OS APIs (clipboard, files, window, storage, autostart) | nothing |
| `state/store.tsx` | reducer, context, selectors, `useNow` | `lib/*`, `platform` |
| `primitives/` | Button, IconButton, Tip, Segmented, Switch, Popover, MenuList, ContextMenu, Dialog, Kbd, Spinner | React only |
| `components/` | presentational components (props in, callbacks out) | `lib/*`, `primitives` — never `store` |
| `App.tsx` | the container: reads store, derives, wires callbacks | everything |
| `frame/` | browser-only window frame | delete in the Tauri app |

Rule: **components never call `useStore`**. Only `App.tsx` (and future `*Container` files) do. This keeps every component previewable and testable with plain props.

## 2. State ownership

`AppState` (in `state/store.tsx`) is the single source of truth:

| Field | Owner / writer | Notes |
|---|---|---|
| `selected: number \| null` | dial, readout, timeline, suggestions, keyboard | `null` = live (follows `now`). Effective time everywhere is `selected ?? now`. Never persisted. |
| `groups[]`, `activeGroupId` | group selector, search, list | each group: ordered `locations[]` + `referenceId` |
| `Location.work / sleep` | WorkingHoursEditor | minutes after local midnight; `end < start` = overnight |
| `view`, `mode` | title bar, shortcuts | `mode: 'compact'` → platform `setMode` |
| `settings` | SettingsPanel | `hour12`, `step` (1\|5), `theme`, `reducedMotion`, `showTimeline`, `defaultWork`, widget prefs |
| `meeting` | MeetingSummary, planner | `title`, `durationMin`, `weekly` |
| `onboarded`, `coach` | Onboarding, first dial interaction | |

Transient UI state (open menus, drag state, dialog layers, toasts, draft input text) stays local to components. `now` comes from `useNow()` (ticks on second boundaries) and is provided through context — in tests pass `fixedNow`.

Persistence: `platform.storage.save('longitude.v1', state)` on every change except `selected`/`mode`. In Tauri use `@tauri-apps/plugin-store`; add a `version` key and a migration step before shipping v1.

## 3. Component contracts

All props are in `components/index.d.ts`. Behavioural contracts that the types don't show:

### InteractiveClock
- Controlled: `value` (epoch ms) + `onChange(next, source)`; it never stores time. `source` ∈ `drag | wheel | key | input | reset`.
- Snapping happens inside: drag/wheel/arrows snap to `step` minutes on the absolute grid (equivalent to the local grid for every real offset, all multiples of 15 min). Shift = 1 min. Alt+wheel = 1 h. PgUp/PgDn = 1 h, `[`/`]` = ±1 day (not snapped).
- Hit-testing: pointer within 60/100 of the radius **and** within 24° of the hour hand (and closer to it than to the minute hand) grabs the hour hand; anything else grabs the minute hand. Drags accumulate the signed angular delta, so multiple revolutions work and crossing 12/midnight carries correctly.
- Rotations are kept "unwrapped" so CSS transitions take the short way; while dragging, transitions are off. `reducedMotion` disables them entirely.
- `onReset()` fires on double-click, Home, or N. `onDragChange(bool)` brackets drags.
- Visuals: date window (accent when the date ≠ today in `zone`), AM/PM window, sky ring (omit `coords` to hide), ghost hands when `live === false`, a drag delta label (`+2h 15m`) and a midnight-crossing flash (`→ Wed 21 Oct`).
- ARIA: `role=slider`, `aria-valuetext` = "9:00 PM, Tue 20 Oct" (+ ", now" when live).

### TimeReadout
- Input-as-display. Accepts `14:30`, `2:30p`, `930`, `9.30pm`, `noon`, `midnight`. Enter commits, Esc reverts, invalid → `role=alert` message and `aria-invalid`.
- Committing resolves the wall time in the reference zone via `resolveWall`; ambiguous times pick the first instance and offer the second; nonexistent times move past the gap and say so.

### TimezoneRow / TimezoneList
- Row shows: mini clock (ring = day state), city, optional label, Ref marker, country · abbreviation + offset · difference to reference, DST chip (next change within 21 days, sentence in tooltip), day strip (local 24 h), local time, `+1 day` chip, local date.
- List owns: context menu (Set as reference, Working hours…, Copy local time, Move up/down, Remove), HTML5 drag reorder with drop indicator, keyboard reorder (Alt+↑/↓), Delete, Enter. Emits `onReorder(id, toIndex)` etc.; never mutates.

### TimezoneTimeline
- X axis = the reference location's civil day `[startOfLocalDay, addLocalDays(+1))` — 23 or 25 h on DST days, so widths are computed from the real span.
- Each row renders that location's local hour cells at their absolute positions (half/quarter-hour zones are offset by half/three-quarter cells; labels stay whole). Local midnight cells show the weekday (or day number when cells are < 30px). Hour labels thin to every 3rd hour when cells are < 19px.
- Overlays: common working ranges (outlined `work`), now (dotted), meeting block (`accent-soft` + outline) and cursor. Pointer drag grabs the block by its middle and snaps to 15 min (Shift: 5). Arrow keys move 15 min.

### MeetingOverlapIndicator
- Pure view of `evaluate(participants, start, durationMin)`. Collapsed: glyph + level word + headline. Expanded: non-working people first, each with local time and state label, then the calendar disclaimer.

### MeetingSummary
- Live preview is exactly what gets copied. Full vs one-line, 12/24 h, title, duration, weekly toggle. Weekly → `recurringShifts()` lists places whose local time changes within 12 weeks. `onCopy` / `onExport` return `Promise<boolean>`; the component shows Copied / Saved / an error.

### CompactWidget
- 2–5 rows (first five of the active group). Wheel previews ±15 min per notch; snaps back after 8 s idle or on "Back to now". Pin toggles always-on-top; opacity 60–100% (window transparency in Tauri); expand returns to the full window.

### TimezoneSearch, TimezoneGroupSelector, SettingsPanel, Onboarding, EmptyState, DstNotice, TitleBar
- See their guideline cards. All keyboard-complete; all text in the sentence-case rules of the README.

## 4. Timezone engine (`lib/time.ts`) — guarantees

- Only `Intl.DateTimeFormat` with `timeZone` is used. No offset tables, no `Date#getTimezoneOffset` (that only knows the OS zone). Formatters are cached per zone.
- `offsetMinutes(zone, at)`, `wallTime(zone, at)`, `minuteOfDay`, `dayNumber`, `dayShift(zone, ref, at)`.
- `resolveWall(zone, y, m, d, h, min)` → `{kind: 'ok' | 'ambiguous' | 'nonexistent', instant, …}` by testing the offsets in force one day either side.
- `nextTransition(zone, from, horizonDays)` — daily sampling + binary search to the minute; cached.
- `startOfLocalDay`, `addLocalDays` are DST-safe (calendar arithmetic, not +24 h).
- Verified cases (keep as unit tests): Manila 9:00 PM Tue 20 Oct 2026 → New York 9:00 AM, London 2:00 PM, Sydney 12:00 AM Wed (next day); London transition 2026-10-25T01:00Z (UTC+1 → UTC); New York 2026-11-01T06:00Z; New York 1:30 AM on 1 Nov 2026 ambiguous (EDT, EST); New York 2:30 AM on 14 Mar 2027 nonexistent (60 min gap); Kathmandu UTC+5:45; Kolkata IST.
- Tz data comes from the WebView's ICU (Edge WebView2 on Windows, WKWebView on macOS) and updates with the OS/WebView. If you need a guaranteed version, add a Rust command using `chrono-tz` and compare at startup; mismatches go to a log, not to the UI.

## 5. Scheduling rules (`lib/schedule.ts`)

- `dayState`: `sleep` if inside sleep hours; else `work` on a working day inside work hours; else `edge` within 60 min either side of work on a working day; else `off`.
- `stateDuring` samples every 15 min across the meeting and keeps the worst.
- `evaluate`: **good** = everyone `work`; **poor** = anyone `sleep`, or fewer than half working; **partial** = otherwise. `cost` = Σ(work 0, edge 1, off 3, sleep 8) ranks suggestions.
- `suggestTimes`: 30-min steps across the reference day, lowest cost first, ties nearest the current selection, spread ≥ 90 min apart, top 3 shown in time order.
- Copy must never claim availability. If calendar integration is added later, it becomes a separate signal with its own label.

## 6. Platform (Tauri 2)

Implement `Platform` (in `platform.ts`) with Tauri APIs and pass it to `<LongitudeApp platform={tauriPlatform} persist />`:

| Need | Tauri 2 |
|---|---|
| Custom title bar | `decorations: false` on Windows; `titleBarStyle: "Overlay"` + `hiddenTitle` on macOS. Keep `data-tauri-drag-region` on the header and spacers. Windows 11 snap layouts: implement `WM_NCHITTEST` for the maximize button in Rust (tauri-plugin-decorum or a small custom handler). |
| Window min size | `minWidth: 380, minHeight: 400`; default 850 × 560; remember size/position (`tauri-plugin-window-state`). |
| Compact widget | A **second window** (`label: "widget"`, 264 × auto, `decorations: false`, `transparent: true`, `skipTaskbar: true`, `alwaysOnTop` from settings, `resizable: false`). Mount `<CompactWidget>` in it; share state through a Tauri event bus or the store plugin. Hide the main window while the widget shows. |
| Opacity | Window is transparent; the widget paints `color-mix(surface, opacity)` + backdrop blur. On Windows 11 consider Mica/Acrylic via `window-vibrancy`; fall back to solid. |
| Tray | `tauri::tray::TrayIconBuilder`: left-click toggles the widget; menu: groups (radio), Open Longitude, Settings, Quit. Respect `settings.trayIcon`. |
| Global shortcut | `@tauri-apps/plugin-global-shortcut`: Ctrl+Alt+T / ⌥⌘T toggles the widget. |
| Clipboard | `@tauri-apps/plugin-clipboard-manager` `writeText`. |
| ICS export | `@tauri-apps/plugin-dialog` `save({ defaultPath, filters: [{name: 'Calendar', extensions: ['ics']}] })` + `@tauri-apps/plugin-fs` `writeTextFile`. Optionally `opener` to open it in the default calendar. |
| Launch at sign-in | `@tauri-apps/plugin-autostart`; set `autostart.supported = true` to enable the row. |
| Theme "System" | `prefers-color-scheme` works in both WebViews; also listen to `getCurrentWindow().onThemeChanged`. |
| High-DPI | All drawing is SVG/CSS in logical px; nothing to do beyond testing at 100/125/150/200%. |

macOS adaptation: `settings.chrome` already switches the title bar to traffic lights on the left; set it from the OS instead of a setting. Use ⌘ in shortcut labels, add a native menu bar (App, Edit, View with Clock/Planner/Settings ⌘1–3, Window), and make Settings open with ⌘,.

## 7. Prototype-only and placeholder logic

| Item | Status | What to do |
|---|---|---|
| `frame/PrototypeWindow.tsx`, compact "backdrop" | browser only | delete; the OS draws the window |
| `webPlatform` | clipboard falls back to `execCommand`, ICS downloads via a blob link, window controls are no-ops, storage is `localStorage` | replace with the Tauri platform (§6) |
| Launch at sign-in | rendered disabled | wire autostart |
| Global shortcut label | display only | register it |
| City catalogue | ~90 hand-picked cities | ship a GeoNames `cities15000` extract (name, ascii, country, admin1, IANA, lat, lon, population) as a static asset; build the index in a worker; show the skeleton state (`TimezoneSearch loading`) while it loads |
| Bare IANA zones in search | coordinates estimated from offset (`coordsApprox`) → sky ring approximate | look up the zone's principal city from the catalogue |
| `systemZone()` | from `Intl` | also read it from Rust (`iana-time-zone` crate) and react to OS zone changes (`WM_TIMECHANGE` / `NSSystemTimeZoneDidChange`) |
| Weekly ICS | fixed UTC `DTSTART` + `RRULE` → local time shifts for every DST zone, including the organiser's | for recurring events write `DTSTART;TZID=<reference zone>` with a generated `VTIMEZONE`, so it follows the organiser's wall time; keep UTC for one-off events |
| Parser AM/PM inference | "9" always means 09:00 | optional: in 12-hour mode pick the AM/PM closest to the current selection |
| Persistence schema | unversioned | add `version` + migrations |
| Toasts | in-window | fine as is; optionally mirror important ones to OS notifications |

## 8. Edge cases to keep covered

- Reference location removed → next location becomes reference; no locations → dial reads `systemZone()` and the empty state shows.
- Duplicate cities are blocked in search ("Added"); two different cities in one zone are allowed.
- Half/quarter-hour zones (Mumbai, Kathmandu, Adelaide, Chatham, Eucla) in rows, timeline and suggestions.
- DST days: 23/25-hour reference days in the timeline; ambiguous/nonexistent typed times; transitions between "now" and the selected date (rows show the offset *at the selected instant*).
- International date line: Kiritimati (UTC+14) vs Honolulu (UTC−10) on different calendar days at the same instant (`+1 day`).
- Overnight working hours (`end < start`) and working days that differ per location (e.g. Sun–Thu).
- Long city names truncate with ellipsis; the full name is in `aria-label`.
- Dragging across many revolutions; wheel on trackpads (accumulates to 40px per notch).
- Clock change while the app is open: `useNow` re-reads `Date.now()` each second; re-check `systemZone()` on resume.

## 9. Accessibility

- Every control reachable by keyboard; visible focus ring (`focus`, ≥3:1 on all surfaces).
- Dial and timeline are `role=slider` with `aria-valuetext`; the readout input is the text alternative.
- Menus are `role=menu` with arrow-key navigation; dialogs trap focus and restore it.
- Verdicts are announced via a polite live region; status never relies on colour alone.
- All text pairs meet 4.5:1 in both themes (checked); reduced motion honoured from the OS and from Settings.

## 10. Performance budget

- Idle: one re-render per second (the `now` tick). Keep rows cheap; memoise per-location derivations if groups grow beyond ~12.
- Dragging: ≤ 1 state update per snapped step (the clock emits only when the snapped value changes). `Intl` formatters are cached; `nextTransition` is cached per zone per hour.
- Bundle today: ~114 KB JS minified (with React external), ~20 KB CSS.

## 11. Acceptance checks

1. Drag the minute hand from 11:50 PM clockwise past 12 → 12:15 AM next day; the date window turns accent; rows show the new day.
2. Hour-hand drag of a quarter turn = +3 h.
3. Arrow / Shift+Arrow / PgDn / `[` / wheel / double-click behave as in §3.
4. Typing `25:00` shows "Hours must be 0–23"; typing `1:30a` on 1 Nov 2026 with New York as reference shows the ambiguity note and offers EST.
5. Manila 9:00 PM Tue 20 Oct 2026 summary matches the README's summary example, and the ICS has `DTSTART:20261020T130000Z`.
6. Light and dark pass the contrast table; reduced motion removes all hand easing.
