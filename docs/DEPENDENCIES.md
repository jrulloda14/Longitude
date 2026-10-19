# Dependency review

## Milestone 3 resolved status

No runtime or development dependency was added, removed or upgraded. `package.json` and `package-lock.json` match approved baseline commit `f8edbc1`. Scheduling reuses the established timezone engine, bounded LRU helper and existing test/browser tools. Fresh audits on October 19, 2026 remain **zero production vulnerabilities** and **five high development-only findings**, with no moderate/critical findings. Raw [full](evidence/milestone-3/npm-audit-all.json) and [production](evidence/milestone-3/npm-audit-production.json) reports are retained. Existing nine-package runtime notices are regenerated unchanged. No server, authentication, telemetry, worker or native dependency was introduced.

## Milestone 2 addition (review before installation)

Playwright Test **1.64.1** is proposed as a development-only dependency: Apache-2.0, Microsoft-maintained repository, Node >=20 (compatible with Node 24). It supplies real pointer capture, keyboard, controllable clock and PNG comparison tests, which Node-only unit tests cannot verify. Use installed Microsoft Edge; do not download a browser or add any application runtime dependency. Reviewed npm metadata and the [official screenshot](https://playwright.dev/docs/test-snapshots), [clock](https://playwright.dev/docs/clock) and [Edge channel](https://playwright.dev/docs/browsers#google-chrome--microsoft-edge) documentation. Recheck the resolved npm audit after installation. Existing React, Tailwind, font and timezone versions remain pinned.

Review date: October 19, 2026. The necessity, registry metadata, maintenance and license review preceded the root install. Exact direct versions and transitive resolutions are pinned in package.json/package-lock.json. The resolved advisory/license review below completes the installation review. An audit does not rule out undisclosed vulnerabilities.

| Dependency | Necessity, maintenance, license and decision |
| --- | --- |
| React/DOM 18.3.1 | Already supplied runtime; preserve compatibility and component behavior. MIT; older major intentionally retained rather than introducing a UI migration. Check installed advisory results. |
| lucide-react 0.441.0 | Existing icon system and handoff version. ISC; retain visual assets/API. Older release; check advisories rather than upgrading the icon set speculatively. |
| @js-temporal/polyfill 0.5.1 | New runtime dependency for explicit DST disambiguation and valid Gregorian calendar arithmetic. ISC, js-temporal maintainers. npm latest release dates to March 2025, a maintenance consideration; pinned and covered by regression tests. One runtime dependency, jsbi (Apache-2.0). Retain Intl for hot-path formatting; its transition API's source limitations led to the bounded transition search documented in TIMEZONE_ENGINE. Do not patch globals or add a second native timezone engine. |
| @fontsource-variable/geist 5.3.0 | Existing intended font, bundled for offline use. OFL-1.1; retain redistributed license notice. Fontsource maintained repository. No runtime Google Fonts request in the new frontend entry. |
| Vite 8.3.4 | Minimal frontend dev/build server and asset bundler. MIT; current maintained release verified in npm (October 2026), Node 24 supported. Not a production backend. No React plugin required for the existing explicit React imports. |
| Vitest 5.0.5 | Existing test style, current maintained Node 24/Vite 8-compatible test runner. MIT. DOM/browser integrations deferred until needed. |
| TypeScript 5.9.3, React 18 and Node 24 types | Strict type checking; retain compiler version proven during audit instead of coupling to a major migration. Apache-2.0 (TS), MIT (types). |
| Tailwind 3.4.17 | Existing design build contract. MIT; intentionally preserve v3 design behavior. No Tailwind 4 migration. |
| PostCSS 8.5.31, autoprefixer 10.6.1 | CSS pipeline for existing tokens/styles in Vite. MIT, maintained PostCSS projects. Explicit current patch pins avoid relying on accidental transitive versions. |
| esbuild 0.28.2 | Existing design export build.mjs; MIT, maintained upstream. Keep preview shims scoped CommonJS under the ESM package. |

Milestone 1 added no browser automation package. Milestone 2 adds only `@playwright/test 1.64.1` and its two resolved dependencies, `playwright` and `playwright-core`, also 1.64.1 and Apache-2.0. They are development-only, Microsoft-maintained, and add no audit findings: the resolved full audit remains five high findings and the production audit remains zero. Installed Edge is used without a browser download. No new UI/state/animation framework, database, network service, Tauri plugin, native timezone crate, telemetry or schema library is added. Small runtime validators suffice for the timezone boundary. The performance script uses Node/CDP and a separately installed Edge executable. See [BUILD_ADVISORIES.md](BUILD_ADVISORIES.md) for each remaining affected package, exploit conditions and remediation choices.

Primary references checked: [polyfill maintainers](https://github.com/js-temporal/temporal-polyfill), [Temporal ZonedDateTime documentation](https://tc39.es/proposal-temporal/docs/zoneddatetime.html), [Vite guide](https://vite.dev/guide/), [Vitest guide](https://vitest.dev/guide/), and npm package metadata (version, license, repository, engines, last modification and dependency list). Registry versions and installed sources take precedence over stale web search snippets.

The project itself has no selected open-source license; package metadata is explicitly UNLICENSED pending the owner's decision.

## Resolved security findings and decisions

Initial full `npm audit`: seven affected packages (two moderate, five high). Both moderate findings traced to `postcss-selector-parser` before 7.1.6. A reviewed override pins **7.1.6** (MIT) across the Tailwind/PostCSS build tree. The existing prototype CSS after the override has the identical SHA-256 `A61ABEE8B3DB2519CE6FFAE3F0138D4B17C683063E5D7CF183C7C40A4BB4DD75`, so the build fix did not change generated styles. Both frontend and original preview builds pass.

Final production-only audit: **zero known vulnerabilities**. Final full audit: **five high, zero moderate, zero critical**. The five affected packages are braces, chokidar, micromatch, fast-glob and tailwindcss, all development-only. They reflect one unpatched root advisory in braces 3.0.3: stack exhaustion on deeply nested attacker-controlled brace patterns. The [reviewed advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) reports no patched version. The npm suggested Tailwind 4 upgrade would replace the existing styling pipeline and is outside this design-preserving milestone.

These packages run on repository-controlled content patterns/source during development/build; they are absent from the shipped frontend JS and receive no user timezone, meeting, city or IPC inputs. Keep content globs/config trusted and the dev server bound to loopback. This limits exposure but is not a claim that the advisory is fixed or that untrusted source/config builds are safe. Retaining Tailwind 3 with this documented build-only risk is an intentional tradeoff; do not use `npm audit fix --force` to silently migrate the design system. Recheck for a compatible patch in later milestones/releases. [The selector-parser advisory](https://github.com/advisories/GHSA-rj75-hqrm-r3gf) and raw reports in `docs/evidence/` document the fixed and remaining findings.

Dependencies were installed with lifecycle scripts disabled. Node 24 supports the selected Vite/Vitest versions; native optional bundler binaries resolve normally on this host. The lockfile records all package integrity hashes. No project lifecycle or postinstall hook was added.

## License inventory and distribution

The resolved runtime has nine packages: Geist, Temporal polyfill, js-tokens, jsbi, loose-envify, lucide-react, react, react-dom and scheduler. Their licenses are OFL-1.1, ISC, MIT and Apache-2.0. `npm run licenses` regenerates [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt) from the installed lockfile packages' license/notice files; the production/preview build scripts also copy that file into dist/prototype-dist. Fontsource's OFL notice is included. The local font-face bridge maps the packaged family back to the existing `Geist` token without modifying the design tokens.

Build/test tools are not redistributed as application code. Their permissive licenses and transitive metadata are retained in the pinned install. Native dependencies, installer redistribution and signing will require their own review when those features are added.
