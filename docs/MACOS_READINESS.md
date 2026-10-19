# macOS readiness — Milestone 1

The timezone/scheduling domain has no Windows or Tauri dependency. It runs in Node and Edge today, and uses portable Intl/Temporal APIs. The import-boundary test prevents platform adapters from entering the domain. A macOS release should reuse these calculations and supply a native platform adapter, not rewrite the engine.

Current system-zone discovery reads runtime Intl with an injectable reader and UTC fallback. Future OS notifications, window management, clipboard, persistence and export dialogs belong to Platform/native integration. macOS shortcuts, application menu, lifecycle, signing, packaging and WebKit runtime verification remain unimplemented.

The existing macOS title-bar preview is design artwork, not a native integration. No macOS runtime, performance, installer or timezone test result is claimed. Once a macOS target exists, run the same domain fixtures and browser interaction regressions against its actual WebView/ICU version, and verify aliases, historical offsets and DST data there.
