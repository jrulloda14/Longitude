# Source setup

These are the prototype's real sources (React 18 + TypeScript + Tailwind 3.4). Package manifests are not stored in the design system, so recreate them:

```bash
npm create tauri-app@latest longitude -- --template react-ts
cd longitude
npm i lucide-react@0.441.0 @fontsource-variable/geist
npm i -D tailwindcss@3.4.17 vitest esbuild
npm i @tauri-apps/plugin-clipboard-manager @tauri-apps/plugin-dialog @tauri-apps/plugin-fs \
      @tauri-apps/plugin-store @tauri-apps/plugin-global-shortcut @tauri-apps/plugin-autostart \
      @tauri-apps/plugin-window-state
```

Copy `lib/`, `state/`, `primitives/`, `components/`, `App.tsx`, `platform.ts`, `styles.css`, `tokens.fallback.css`, `index.tsx` into `src/`. Drop `frame/` and `shims/` (shims exist only so the design-system bundle can use the page's global React). Move `tailwind.config.cjs` to the project root.

- `tsconfig`: `"strict": true, "jsx": "react-jsx"` (the sources import React explicitly, so either JSX mode works).
- `gen_fallback.py` regenerates `tokens.fallback.css` from the design system's `tokens.json`; in the app you may instead import the page-generated `tokens.css`.
- `build.mjs` builds the design-system bundle (`components/bundle.js` + `bundle.css`); the Tauri app uses Vite instead.
- Entry (`src/main.tsx`):

```tsx
import '@fontsource-variable/geist';
import './styles.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { LongitudeApp } from './App';
import { tauriPlatform } from './platform.tauri'; // implement per handoff §6

createRoot(document.getElementById('root')!).render(<LongitudeApp platform={tauriPlatform} persist />);
```
