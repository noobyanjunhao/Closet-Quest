import React, { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { isPixelPassportPath } from './event/route.js';

// The public Pixel Passport event and the account app are separate lazy roots,
// chosen from the pathname before either is imported. An event visitor never
// loads the wardrobe app, so no /api/session call or cloud state is touched.
const onEvent = isPixelPassportPath(window.location.pathname);
const Root = onEvent ? lazy(() => import('./event/PixelPassport.jsx')) : lazy(() => import('./AccessGate.jsx'));
const fallback = onEvent ? <p style={{ font: '600 16px system-ui, sans-serif', color: '#263e33', textAlign: 'center', padding: '40vh 24px 0', margin: 0 }}>Loading Pixel Passport…</p> : null;

createRoot(document.getElementById('root')).render(<Suspense fallback={fallback}><Root/></Suspense>);
