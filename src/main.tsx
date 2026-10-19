import React from 'react';
import { createRoot } from 'react-dom/client';
import './fonts.css';
import './styles.css';
import { LongitudeApp } from './App';
import { webPlatform } from './platform';
import { isTauri } from '@tauri-apps/api/core';

// Shared frontend entry chooses the browser preview or native desktop adapter.
async function mount() {
  const platform = isTauri() ? await (await import('./desktop/platform.tauri')).createNativePlatform() : webPlatform;
  createRoot(document.getElementById('root')!).render(<LongitudeApp platform={platform} persist />);
}
void mount().catch(error => { document.getElementById('root')!.textContent = `Could not start Longitude: ${String(error)}`; });
