// Copies the game's web files into www/, the folder Capacitor packages into the app.
// The game has no build step; the repo root stays what GitHub Pages serves.
import { cpSync, rmSync, mkdirSync } from 'node:fs';

const FILES = ['index.html', 'style.css', 'js', 'vendor'];
rmSync('www', { recursive: true, force: true });
mkdirSync('www');
for (const f of FILES) cpSync(f, `www/${f}`, { recursive: true });
console.log(`Copied ${FILES.join(', ')} to www/`);
