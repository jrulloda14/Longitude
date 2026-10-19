# Longitude architecture — current Milestone 3

The existing Claude Design frontend is preserved. Milestone 2 wires its existing components and targeted primitive internals without changing style/token/font files or replacing the reducer/store. The repository root is the application; the empty `longitude-ui` directory is not an alternate implementation.

## Current layers

- Presentation: existing React components and primitives with existing props, Tailwind 3/CSS token design, SVG clock and animations. Components receive data and callbacks.
- Application: existing `App.tsx` / `state/store.tsx`, one selected epoch instant or live mode, groups/reference/settings and meeting state. Existing incomplete persistence/scheduling behavior remains documented in the audit.
- Domain: `src/lib/`, including timezone facade, small strict validators and bounded caches, existing scheduler/search/share/parser/solar helpers. A permanent boundary test rejects imports outside the domain except the approved portable Temporal polyfill and rejects DOM/network globals.
- Platform: existing typed `Platform` interface and browser implementation in `platform.ts`. No Tauri dependency or native implementation was introduced. Native storage/window/clipboard adapters remain behind this boundary in later milestones.

`src/main.tsx` mounts the existing LongitudeApp directly with the browser platform. The minimal Vite entry bundles local Geist and existing styles. Persistence stays disabled until schema validation/hydration is implemented. Custom caption buttons still have browser no-op behavior; this is a frontend build, not a desktop release.

## Build separation

`npm run build` produces the standalone frontend in `dist/`. `npm run build:prototype` exercises the original export pipeline into `prototype-dist/` and leaves the original `prototype/` reference untouched. A nested CommonJS package marker scopes existing preview shims without renaming or rewriting them under the root ESM manifest. No new UI framework, React plugin, server backend or global Date polyfill is needed.

The Vite development/preview server and performance script's loopback asset server are development tools only. A future Tauri build will embed frontend assets; it will not require an HTTP service.

## Timezone boundary

`lib/time.ts` retains public function names and output shapes while adding normalization, explicit disambiguation, strict validation, preserved historical seconds and correct civil arithmetic. See [TIMEZONE_ENGINE.md](TIMEZONE_ENGINE.md). The domain never imports Windows, Tauri, clipboard, filesystem or window APIs. Runtime system-zone discovery is an injectable Intl reader with UTC fallback. A future macOS platform adapter does not replace timezone or scheduling calculations.

Date controls and dial day keys use civil-day arithmetic. Portable `time-selection.ts` centralizes local 1/5-minute snapping, while `time-axis.ts` supplies actual local-day bounds and civil-hour cells, including repeated hours and fractional transitions. Timeline positions always use elapsed instants within those bounds; civil labels are projections, not a fixed 24-hour coordinate system. Both helpers remain within the existing domain boundary.

Milestone 3 replaces sampled scheduling with exact state ranges compiled from participant-local recurring schedules inside engine-provided constant-offset segments. Overnight weekdays belong to shift-start dates; cumulative state durations evaluate complete meetings. Bounded profile/date caches, deterministic ranking, explicit filters and optional fairness remain pure TypeScript domain logic. No worker or new dependency is introduced. [SCHEDULING_ENGINE.md](SCHEDULING_ENGINE.md) defines semantics, validation, score order and limits. Exact ranges also drive timeline color stops/day strips without changing label geometry. Planner search is local session state; durable hydration remains Milestone 4.

The App's `at` is the authoritative selected instant (current tick in live mode, fixed selection in planning mode). Dial, readout, timezone rows, timeline, search preview and compact widget consume it. Controls dispatch selections through existing callbacks. Reference changes preserve the absolute instant. The compact browser widget inherits that instant and retains its original explicit reset/preview timeout; it is not a native second window. Closed search performs no timezone work; timeline/day-strip calculations are memoized across live ticks where inputs allow. Focus effects do not restart on every tick.

## Upcoming boundaries, not implemented features

Milestone 2 verifies controlled selection, capture/release/cancel, outside-dial dragging, keyboard/direct entry and visual comparisons in installed Edge. Its isolated browser fixture is excluded from production builds. Milestone 4 introduces validated versioned durable data and async hydration. Milestone 5 introduces a separate widget window and revisioned native state coordination. Native commands, per-window capabilities and monitor/lifecycle rules are not implemented.

Refer to [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) for the accepted sequencing and outstanding gates, [PERFORMANCE.md](PERFORMANCE.md) for provisional budgets, and [DEPENDENCIES.md](DEPENDENCIES.md) for dependency decisions.
