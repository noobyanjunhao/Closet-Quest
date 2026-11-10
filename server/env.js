import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Node loads server secrets without exposing them through Vite's client environment.
for (const name of ['.env.local', '.env']) {
  const path = fileURLToPath(new URL(`../${name}`, import.meta.url));
  if (process.env.CLOSET_SKIP_ENV!=='1' && existsSync(path)) process.loadEnvFile(path);
}

