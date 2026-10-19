import React from 'react';
import { createRoot } from 'react-dom/client';
import './fonts.css';
import './styles.css';
import { LongitudeApp } from './App';
import { webPlatform } from './platform';

// Production frontend entry. Native integration will supply a Tauri adapter.
// Persistence remains disabled until schema validation/hydration in Milestone 4.
createRoot(document.getElementById('root')!).render(<LongitudeApp platform={webPlatform} />);
