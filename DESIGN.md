Longitude is a desktop instrument for comparing time zones and placing meetings across them. The circular dial is the product; every other surface is a readout of what the dial is set to. Build anything new so that it either *sets* the selected instant or *reads* it — never a third thing.

## Product principles

1. **One instant, many readings.** The app holds a single selected instant (or "live"). The dial, rows, timeline, overlap verdict, summary and widget are all projections of it. Never give a surface its own private time.
2. **Set time like a watch crown.** Dragging the minute hand rolls continuously — one revolution is one hour, passing 12 rolls the hour, passing midnight rolls the date. Never wrap at 59 → 0 without carrying. The hour hand moves 12 hours per revolution.
3. **Selected vs. now is always visible.** Live: ink hands, a "Live" dot. Detached: the minute hand and hub turn `accent`, dotted ghost hands show the real time, and a "Now · 9:50 AM" button appears. Double-click the dial or press Home to return.
4. **The date is part of the time.** Show day changes where they happen: the dial's date window turns `accent` off-today, rows carry a `+1 day` chip, the timeline marks each location's midnight.
5. **Explain verdicts.** A meeting time is never just green or red: it is a level (Good / Partial / Poor overlap) plus a sentence plus, on demand, one line per location saying which hours it falls in.
6. **Compute, never store, offsets.** Every offset, abbreviation and day boundary comes from the IANA tz database at the instant in question.
7. **Progressive disclosure.** First run shows a dial and four rows. The timeline, working-hours editor, groups, weekly-repeat checks and settings are one click away, not on screen.

## Content

- Voice: plain, calm, specific. Second person only in instructions ("Drag a hand"). No exclamation marks, no emoji.
- Sentence case everywhere, including buttons ("Export .ics", "Copy summary"). Product name: **Longitude**.
- Say *within working hours*, *outside working hours*, *sleeping hours*. Never *available*, *free* or *busy* — the app knows nothing about calendars. Overlap explanations end with "Based on the working hours you set for each location — not on anyone's calendar."
- Times: `9:00 PM` (12-hour) or `21:00` (24-hour); AM/PM in caps after a space, set as `micro` in muted ink when beside a `row-time` or `readout`. Never `9pm`, `9:00pm`, `21h`.
- Dates: short `Tue 20 Oct`; long (summaries) `Tuesday, October 20, 2026`.
- Summaries copy exactly as previewed:

```text
Weekly sync — Tuesday, October 20, 2026
Manila — 9:00 PM
New York — 9:00 AM
London — 2:00 PM
Sydney — 12:00 AM (next day)
Duration: 30 min
```

  One-line form: `Tue 20 Oct · Manila 9:00 PM · New York 9:00 AM · London 2:00 PM · Sydney 12:00 AM (+1)`.
- Differences: `+12h`, `−5h 30m` (true minus sign U+2212), `Same time`. Offsets: `UTC+8`, `UTC−3:30`, `UTC` for zero.
- Day shifts: `+1 day` chip in rows, `(next day)` in summaries, `(+1)` in one-line summaries, superscript `+1` in the timeline.
- DST copy is informative, not alarming: "London clocks go back 1h on Sun 25 Oct at 2:00 AM (now UTC+1 → UTC)." Ambiguous: "1:30 AM happens twice in New York that night (clocks go back). Using the first, EDT." Nonexistent: "That time doesn't exist in New York — clocks skip ahead 60 min. Moved to 3:30 AM."
- Empty and error states name the next action: "No locations in this group", "No match for 'zzz' — try a city (Lisbon), a country, an IANA name (America/Bogota), or an offset (+9:30)."

## Color

- Dark is the primary theme; light is a full peer. Both are defined in `tokens.json`; nothing is hard-coded in components except the Windows close-button red (`win-close`) and macOS traffic-light colours (system values).
- Surfaces: the window is `ground`. Regions sit directly on it, separated by 1px `line` hairlines — no cards. Only floating layers (dialogs, popovers, menus, tooltips, the compact widget) use `surface` with `shadow-popover`. Inputs, hovers and segmented tracks use `field`.
- Text: `ink` for primary, `ink-muted` for secondary (country, date, offsets), `ink-faint` for tertiary (dial numerals, hints). All three hold 4.5:1 on `ground`, `surface` and `dial-face` in both themes.
- `accent` (signal orange) means **the selected time** and the one primary action per region: the detached minute hand and hub, the timeline cursor and meeting block, the active timeline toggle, the primary button. Don't use it for decoration, links, or status. Text on an accent fill is `on-accent`.
- Day-state palette (shared by rows, timeline, widget and verdicts): `work` / `work-band` = within working hours; `edge` / `edge-band` = within an hour of them; `off-band` = awake, off hours; `sleep` / `sleep-band` = sleeping hours. The `-band` tokens are fills; the plain tokens are marks and text.
- Verdict levels reuse that palette: Good = `work`, Partial = `edge`, Poor = `sleep`. Each level also has its own glyph (full disc, half disc, empty ring) and word, so colour is never the only signal.
- Sky ring: `sky-day`, `sky-twilight`, `sky-night` — real solar elevation for the reference city (day > −0.83°, civil twilight to −6°).
- Errors use `danger`, always with text. DST notes use `edge-band` fill and an `edge` clock glyph — never `danger`.

## Type

- Family `sans` (Geist, falling back to Segoe UI Variable on Windows and the system face on macOS). `mono` is reserved for code in docs; the app itself doesn't use it.
- Every number that can change uses tabular figures: add the `tnum` class (`font-variant-numeric: tabular-nums`). Times must not jitter while dragging.
- Scale: `readout` 40/44 for the selected time; `row-time` 20/24 for each location's time; `title` 14/20 semibold for group names and dialog titles; `body` 13/18 default (city names at 500); `label` 12/16 medium for buttons and field labels; `caption` 11/14 for metadata; `micro` 10/12 for AM/PM and timeline hours. Nothing larger than `readout`; no hero type.
- Hierarchy comes from weight and ink level before size: city name `body` 500 `ink`; metadata `caption` `ink-muted`.

## Space, shape, elevation

- 4px base: `space-1` 4, `space-2` 8, `space-3` 12, `space-4` 16, `space-6` 24, `space-8` 32. Rows are 52px tall with `space-3` horizontal padding; the title bar is 40px; region headers are 48px.
- Radii: `radius-sm` 4 for chips and timeline cells, `radius-md` 6 for buttons, inputs and row hovers, `radius-lg` 10 for dialogs, popovers and the widget. The dial is a circle; nothing else is a pill except switches.
- Elevation: one level. `shadow-popover` on floating layers; `shadow-window` only for the prototype frame and the widget. No inner shadows, glows, gradients or glass (the widget's optional transparency blurs what's behind it because it really is translucent).

## Layout

- Main window 850 × 560 by default, minimum 380 × 400. Title bar (40) over two regions: the **clock column** (340 wide: dial 276px, readout, Now) and the **comparison column** (group selector, rows, optional timeline, overlap footer). Navigation is a 3-way segmented control in the title bar: Clock · Planner · Settings.
- Under 760px wide rows drop their day strip; under 720 the segmented control moves next to the app mark; under 700 the dial shrinks to 236; under 540 the regions stack (dial on top, list scrolls).
- Planner: dial (136) + verdict on top, full-width timeline, suggestions and DST note at the bottom. Share opens as a dialog from either view.
- Compact widget: 264 wide, 2–5 rows of 36px, its own window, always-on-top optional, opacity 60–100%.

## Motion

- Hands settle with `dur-hand` + `ease-hand` (a small overshoot) after a jump; during a drag they follow the pointer with no easing. Rotations take the short way round.
- Popovers, rows and the date window use `dur-base` + `ease-out`; hovers `dur-fast`. Nothing loops except the 1.6s "Live" dot pulse.
- Reduced motion (system or setting): hands jump, no entrance animations, the Live dot is still.

## States

- Hover: `field` fill (rows, ghost buttons, menu items). Pressed: brightness 95%.
- Keyboard focus: 2px solid `focus` ring, 2px offset (inset inside lists and menus). The dial shows its ring as a circle around the face. Focus is never removed without a replacement; text inputs that show a border on focus opt out of the ring.
- Selected: `accent-soft` fill + `accent` outline (onboarding choices, suggestion chips, meeting block); the reference row uses `field` plus an `accent` "Ref" marker.
- Disabled: 40–45% opacity, no pointer events, and a reason nearby when it isn't obvious ("Available in the desktop build.").
- Loading: `Spinner` in buttons; shimmer rows (`lg-skeleton`) in search while a city index loads.
- Error: `danger` border on the field plus a `role=alert` message under it.

## Iconography

- Lucide (`lucide-react`), 12–16px, default 2px stroke (1.25 for Windows caption buttons so they match the system glyphs). Icons only where they label an action; every icon-only button has an `aria-label` and a tooltip with its shortcut.
- Custom glyphs: the verdict glyphs (`LevelGlyph`), the DST clock glyph, the mini clock faces. Draw new ones on a 12px grid with 1.2–1.4px strokes.
- The app mark is a dial with one meridian in `accent` and a short hand in ink (see the Logos assets). Use it at 14px in the title bar and 16–256px for the app icon; never recolour the meridian.

## Keyboard

- Dial (role slider): ←/→/↑/↓ ±step, Shift ±1 min, PgUp/PgDn ±1 h, `[` / `]` ±1 day, Home or N = now. Wheel: ±step per notch, Shift = 1 min, Alt = 1 h.
- Global: Ctrl+K add location, Ctrl+1…9 switch group, Ctrl+, settings, Ctrl+Shift+C share, Ctrl+Shift+M compact widget, Home = now. macOS swaps Ctrl for ⌘.
- Rows: ↑/↓ move focus, Enter = set as reference, Alt+↑/↓ reorder, Delete = remove, Shift+F10 or the Menu key = context menu.
