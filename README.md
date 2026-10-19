# Longitude

Longitude is a local-first timezone comparison and meeting-planning desktop utility in development. Milestone 3 adds exact scheduling and explainable recommendations to the original Claude Design React/TypeScript UI and validated timezone foundation. It does not yet contain a Tauri application or Windows installer.

The intended Instrument design, existing components, styling and animations will be preserved. Current source uses React 18.3.1 in its bundled browser preview, Tailwind 3 token styles, a shared selected instant and Intl-based timezone calculations.

## Current status

Milestone 3 is ready for review. Work stops here before Milestone 4. Existing component architecture, typography, styling and animations are preserved. Scheduling now handles full durations, overnight start weekdays, split shifts, DST and fractional offsets with bounded configurable searches.

- [Implementation audit](docs/IMPLEMENTATION_AUDIT.md): actual structure, functional inventory, defects, architecture, dependency proposals and audit check results.
- [Implementation plan](docs/IMPLEMENTATION_PLAN.md): milestones, intended files, tests and completion gates.
- [Milestone 1 report](docs/MILESTONE_1.md): changes, files, exact checks and remaining issues.
- [Milestone 2 report](docs/MILESTONE_2.md): integration, exact results, modified files, visual evidence and performance.
- [Milestone 3 report](docs/MILESTONE_3.md) and [scheduling algorithm](docs/SCHEDULING_ENGINE.md): exact coverage, filters, scoring, tests, measurements and limits.
- [Milestone 3 before/after gallery](docs/evidence/milestone-3/visual/index.html) and [development advisories](docs/BUILD_ADVISORIES.md).
- [Timezone engine](docs/TIMEZONE_ENGINE.md), [architecture](docs/ARCHITECTURE.md), [testing](docs/TESTING.md), [performance](docs/PERFORMANCE.md), [dependency review](docs/DEPENDENCIES.md) and [macOS readiness](docs/MACOS_READINESS.md).
- [Design specification](DESIGN.md) and [design directions](DIRECTIONS.md).
- [Original implementation handoff](HANDOFF.md) and [source setup notes](SETUP.md). These describe proposed native work and contain stale export paths; use the audit for verified current status.

## Development and builds

Requires Node 24 and npm 11:

```powershell
npm ci --ignore-scripts
npm run dev
npm test
npm run test:browser
npm run build
npm run preview
```

The dev/preview servers bind to loopback. `dist/` contains the production frontend and third-party notices, including locally bundled Geist. `npm run typecheck` checks strict types; `npm run build:prototype` checks the preserved design export pipeline into `prototype-dist/`. No backend service is required for the future desktop runtime. Persistence remains disabled until validated hydration in Milestone 4.

## Original prototype reference

The prebuilt preview is `prototype/index.html`; it loads local JS/CSS and bundled React/ReactDOM, but currently requests Geist from Google Fonts. Editable source lives in root `src/`. `longitude-ui/` is empty, and `longitude-ui.zip` duplicates the exported root files.

The root manifest/lockfile now build the existing source. Do not scaffold a replacement frontend from the original setup example; those setup notes describe the earlier design export.

## Verification baseline

Milestone 3 retains the passing timezone/interaction foundation and adds exact scheduling/reference comparisons and real browser controls tests. Exact counts, visual comparisons and measured hardware are in the milestone/performance reports. Browser tests use installed Edge without a download. No native Windows behavior, installer or full accessibility certification is claimed. Both original scheduling defects are fixed; search-grid, calendar-data and native limitations are documented.

Production dependencies have zero known npm audit advisories; five high development-only findings remain in Tailwind 3's unpatched brace-pattern chain. See the dependency review for exposure and the compatible fix applied to two other findings. The project has no selected open-source license; runtime third-party notices ship with the build.
