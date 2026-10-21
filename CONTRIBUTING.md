# Contributing to Longitude

Thanks for your interest! Bug reports, ideas and pull requests are all welcome.

## Reporting bugs and ideas

Use the [issue templates](https://github.com/jrulloda14/Longitude/issues/new/choose). For bugs, include your operating system and version, the Longitude version (the version number in the installer or DMG file name you downloaded) and the cities involved. Time zone bugs are much easier to fix with the exact date and time.

Security issues: please follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## Development setup

Requires Node.js 24, npm 11, stable Rust (1.90+) and the [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/).

```bash
npm ci
npm run desktop:dev        # desktop app with hot reload
npm run dev                # browser-only preview at http://127.0.0.1:5173
```

## Checks before a pull request

```bash
npm run typecheck
npm test                   # unit tests (Vitest)
npm run test:browser       # browser interaction and visual tests (Playwright, Microsoft Edge)
npm run desktop:test       # Rust tests
cargo fmt --manifest-path src-tauri/Cargo.toml --check
```

CI runs the same checks on Windows and macOS for every pull request.

## Project principles

- **Local-first.** No accounts, telemetry, servers or network calls. Please don't add dependencies that phone home.
- **One time engine.** All time zone math goes through `src/lib/time.ts` (IANA rules via `Intl`/Temporal). Don't add a second timezone or scheduling engine.
- **Keep the design.** The "Instrument" look in [docs/design/DESIGN.md](docs/design/DESIGN.md) is intentional. UI changes should reuse the existing tokens and components, and screenshot baselines shouldn't be replaced to hide a regression.
- **Least privilege.** Native capabilities are deliberately narrow (`src-tauri/capabilities/`). No general filesystem, shell or clipboard-read access.
- **Test what you change.** Fixes come with a regression test that fails without the fix.

Architecture notes live in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/DESKTOP_ARCHITECTURE.md](docs/DESKTOP_ARCHITECTURE.md) and [docs/TIMEZONE_ENGINE.md](docs/TIMEZONE_ENGINE.md).

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
