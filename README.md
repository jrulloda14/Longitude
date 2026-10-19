# Longitude

Longitude is a local-first timezone comparison and meeting-planning desktop utility in development. Milestone 5A adds a Tauri 2 Windows application around the existing Claude Design frontend, with native persistence, independent main/widget windows and shared planning state. Windows artifacts are development builds; see the report for verification and packaging limitations.

The intended Instrument design, existing components, styling and animations will be preserved. Current source uses React 18.3.1 in its bundled browser preview, Tailwind 3 token styles, a shared selected instant and Intl-based timezone calculations.

## Current status

Milestone 6 adds local meeting summaries, four copy formats, native clipboard/Save dialogs, independently validated UTC ICS and contextual offset explanations in the existing interface. See the [M6 report](docs/MILESTONE_6.md) and [sharing specification](docs/ICS_EXPORT.md) for exact Windows/shared and Apple Silicon/Intel CI results. Windows CPU/frame targets remain open after failing on both M6 and repeated approved 5B. Physical Mac acceptance/performance and trusted distribution remain unverified. Stop before Milestone 7.

See the [Milestone 5A Windows report](docs/MILESTONE_5A.md), [desktop architecture](docs/DESKTOP_ARCHITECTURE.md), [build instructions](docs/BUILD_AND_RELEASE.md) and [dependency review](docs/DESKTOP_DEPENDENCIES.md). Browser persistence remains origin/profile-specific; native persistence uses Tauri application directories and the same schema. Browser site data does not automatically migrate into native files.

Current M6 application checkpoint: [`d53821d`](https://github.com/jrulloda14/Longitude/commit/d53821df0a8098465523a70b4b71cf50d15af3fe). The [M6 report](docs/MILESTONE_6.md) contains exact results, failures and artifact provenance. The [5B report](docs/MILESTONE_5B.md) remains historical. See the [native architecture](docs/NATIVE_ARCHITECTURE.md) for shared platform boundaries. The eight unchanged main views retain zero changed pixels; the planner's contextual DST wording and the share sheet have documented M6 changes.

Download the [printable three-page Mac acceptance checklist](output/pdf/Longitude-Milestone-5B-Mac-Acceptance-Checklist.pdf), or use the authoritative [editable Markdown checklist](docs/MACOS_ACCEPTANCE.md). Every physical Mac acceptance outcome remains unexecuted and Blocked. The [macOS development workflow](.github/workflows/macos-development.yml) supports manual dispatch and pull requests; [the final-source run](https://github.com/jrulloda14/Longitude/actions/runs/39305433436) retains test logs and development artifacts for 14 days. Pushing `main` alone does not run it. No GitHub release was published.

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
npm run desktop:dev
npm run desktop:test
npm run desktop:build
```

The dev/preview servers bind to loopback. `dist/` contains the production frontend and third-party notices, including locally bundled Geist. `npm run typecheck` checks strict types; `npm run build:prototype` checks the preserved design export pipeline into `prototype-dist/`. No backend service is required for the future desktop runtime. Browser persistence now uses validated asynchronous hydration and serialized conditional writes.

## Original prototype reference

The prebuilt preview is `prototype/index.html`; it loads local JS/CSS and bundled React/ReactDOM, but currently requests Geist from Google Fonts. Editable source lives in root `src/`. `longitude-ui/` is empty, and `longitude-ui.zip` duplicates the exported root files.

The root manifest/lockfile now build the existing source. Do not scaffold a replacement frontend from the original setup example; those setup notes describe the earlier design export.

## Verification baseline

Milestone 5A retains shared timezone/scheduling/persistence regressions and adds native Windows executable, filesystem, state/window and shortcut checks. Exact counts, visual comparisons, measured hardware and remaining acceptance items are in the Windows report. Native keyboard/window/API behavior and generated unsigned packaging are verified separately from physical tray/monitor, installer and full accessibility certification. Both original scheduling defects remain fixed. Release idle CPU exceeds the provisional targets and remains an open performance issue.

Production dependencies have zero known npm audit advisories; five high development-only findings remain in Tailwind 3's unpatched brace-pattern chain. See the dependency review for exposure and the compatible fix applied to two other findings. The project has no selected open-source license; runtime third-party notices ship with the build.
