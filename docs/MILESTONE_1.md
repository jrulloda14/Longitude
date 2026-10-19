# Milestone 1 — Timezone foundation

Completed for review October 19, 2026. This is the historical Milestone 1 report. The user subsequently provisionally approved it and authorized Milestone 2; see [MILESTONE_2.md](MILESTONE_2.md) for current results and the stop before Milestone 3.

## Changes

- Established a pinned Node 24/npm 11 project around the existing React 18/Tailwind 3 frontend: Vite dev/production entry, strict typecheck and Vitest scripts, and the original esbuild/Tailwind export build in a separate output directory.
- Preserved every existing component, App/store, primitive, token, stylesheet, clock pointer-capture handler and animation. A new local-font bridge supplies the intended `Geist` family; it does not change the design tokens.
- Strengthened the existing timezone facade with strict integer/date/instant/zone/policy validation, runtime IANA normalization, safe system-zone detection and explicit DST disambiguation. Temporal handles civil-time resolution and calendar arithmetic; Intl remains the cached display path.
- Preserved historical offset seconds, fixed year 0–99 UTC construction pitfalls, preserved seconds/milliseconds in calendar-day arithmetic, and implemented correct containing-day starts for midnight anomalies.
- Replaced the stale hourly transition cache with bounded, query-valid records and millisecond transition precision. Bounded offset search avoids discovered polyfill transition-search limits; its six-hour probe assumption is explicitly documented. Null look-ahead caching prevents rescanning no-transition zones every live second.
- Added comprehensive timezone and portable-domain boundary tests, dependency/security/license review with shipped runtime notices, and repeatable hardware-recorded CPU/memory/clock measurements.

## Files

Only the existing `src/lib/time.ts` application source was changed. Other existing files updated are tsconfig (to include the build/test configs under the existing strict rules), README and the audit/plan documentation. Existing design/interaction sources and prebuilt reference assets were not edited.

| Area | Files added or modified |
| --- | --- |
| Project/tooling | `package.json`, `package-lock.json`, `.gitignore`, `index.html`, `tsconfig.json` (modified), `vite.config.ts`, `vitest.config.ts`, `postcss.config.cjs` |
| Entry/font/preview isolation | `src/main.tsx`, `src/fonts.css`, `src/shims/package.json` |
| Domain | `src/lib/time.ts` (modified), `src/lib/time-validation.ts`, `src/lib/time-cache.ts` |
| Tests | `src/lib/time.foundation.test.ts`, `src/lib/domain-boundaries.test.ts`; original `time.test.ts` unchanged |
| Developer scripts | `scripts/measure-performance.mjs`, `scripts/write-notices.mjs` |
| Documentation | `README.md`, `docs/IMPLEMENTATION_AUDIT.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/TIMEZONE_ENGINE.md`, `docs/ARCHITECTURE.md`, `docs/TESTING.md`, `docs/MACOS_READINESS.md`, `docs/DEPENDENCIES.md`, `docs/PERFORMANCE.md`, this report, `docs/THIRD_PARTY_NOTICES.txt` |
| Evidence | `docs/evidence/npm-audit-all.json`, `docs/evidence/npm-audit-production.json`, `docs/evidence/performance-prototype.json`, `docs/evidence/performance-milestone-1.json` |

Generated/ignored: node_modules, dist, prototype-dist and performance-results screenshots. Disposable Edge profiles remain under the OS temp directory for inspection. No Git commit was created because this directory is not a Git repository.

## Dependency changes

Runtime: preserved React/DOM **18.3.1** and lucide-react **0.441.0**; added **@js-temporal/polyfill 0.5.1** (ISC; jsbi 4.3.2 transitive, Apache-2.0) and **@fontsource-variable/geist 5.3.0** (OFL-1.1).

Development: **Vite 8.3.4**, **Vitest 5.0.5**, **TypeScript 5.9.3**, **Tailwind 3.4.17**, **PostCSS 8.5.31**, **autoprefixer 10.6.1**, **esbuild 0.28.2**, Node 24/React 18 type packages. A reviewed **postcss-selector-parser 7.1.6** override fixes two inherited moderate advisory findings while preserving generated CSS byte-for-byte. All direct versions and transitive integrity hashes are locked.

Review and unresolved build-only advisory rationale: [DEPENDENCIES.md](DEPENDENCIES.md). No Tauri/native, UI/state framework, backend/database server, browser automation package or telemetry dependency was added.

## Exact verification results

| Command / check | Result |
| --- | --- |
| `npm ci --ignore-scripts --no-fund` | **Passed** from the lockfile; 127 installed packages, lifecycle scripts disabled |
| `npm test` | **3 files passed, 530 tests passed, 0 failed** on Node 24.15.0 (including all five original tests); final normal-host run 1.70 s |
| `TZ=America/Los_Angeles` with `npm test` (PowerShell env assignment) | **3 files passed, 530 tests passed, 0 failed**, 1.79 s |
| `npm run typecheck` | **Passed**, zero diagnostics; existing strict rules also cover Vite/Vitest configs |
| `npm run build` | **Passed**: production frontend, local font subsets and third-party notices; final Vite build 1.57 s |
| `npm run build:prototype` | **Passed**: roughly 276 KiB JS / 20 KiB CSS; nonfatal outdated Browserslist dataset warning |
| `npm run licenses` | **Passed**, full license/notice text for all nine resolved runtime packages; build scripts copy it into dist/prototype-dist |
| `npm audit --omit=dev --json` | **0 known vulnerabilities** |
| `npm audit --json` | **5 high, 0 moderate, 0 critical**, nonzero exit as expected; all five affected packages in unpatched development-only braces chain |
| Edge domain probe | **428/428 checks passed**, zero failures, on Edge 155.0.4283.62; both baseline/production measurement runs |
| Pointer measurement | **36 committed snapped updates, 59/59 outside-dial moves captured**, three revolutions, zero uncaught page exceptions and zero observed drag long tasks |
| Production network/font check | **0 external requests attempted**, `Geist` loaded locally with external requests blocked |
| Preservation check | Existing component/App/store/primitive/style/token hashes match the isolated Milestone 0 source copy; selector override leaves prototype CSS SHA-256 unchanged |

Hardware and performance values are in [PERFORMANCE.md](PERFORMANCE.md): i5-6500 / 16 GB nominal / Windows 10 Pro; p95 committed-update-to-next-frame proxy 16.9 ms in both builds. M1 short-run process CPU estimates are 2.89% live and 0.57% planning (total machine); sampled private peaks 376.52/255.80 MiB. These are noisy headless Edge process-tree baselines with subprocess churn, not native resource certification. Provisional native budgets remain unmet/unverified.

## Remaining issues and limits

1. Milestone 2 controls still need calendar-safe date navigation, dial click/AM-PM/date-input completion, exact DST timeline labels/cells, controlled widget time and dedicated interaction/focus regressions. Clock drag/capture source was deliberately preserved, with future regression requirements documented.
2. Overnight weekday attribution and sampled full-duration scheduling defects remain open for Milestone 3. Advanced ranking/preferences/fairness are not implemented here.
3. Persistence validation/migrations, Tauri windows/tray/shortcut, native clipboard/dialog, installer and native performance remain later milestones. No native behavior is claimed verified by Node or Edge tests.
4. Runtime ICU controls available IANA data and alias spelling. All accepted inputs and conversion results stay within supported Gregorian years 1–9999. Historical UI snapping/row strips were not redesigned; domain precision does not certify those surfaces.
5. Transition detection assumes changes are separated by at least six hours and depends on runtime data. The polyfill adds bundle cost and has a relatively old latest release; both tradeoffs are documented and covered by tests.
6. Five high build-only advisory findings remain in the unpatched Tailwind 3 globbing chain; production dependency audit is clean. No forced design-system migration or claim that these findings are fixed.
7. CPU/private memory budgets need controlled longer-run/native measurements and later optimization. macOS, Win11, DPI/multi-monitor, screen-reader and importer checks remain unverified. There is no selected project open-source license or signing identity.

The Milestone 1 timezone/test/build gates pass. Broader production-readiness requirements are intentionally still open. Await user review before any Milestone 2 implementation.
