// Renders the three required dashboard screenshots at 1440x900 with headless Chrome.
// Usage: node shoot.mjs   (after `MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot>`)
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const here = new URL('.', import.meta.url).pathname;
const outDir = join(here, 'out');
const page = join(outDir, 'dashboard', 'index.html');

// The page loads ../data.js, so dashboard/index.html must sit one level below data.js.
if (!existsSync(join(outDir, 'data.js'))) {
  throw new Error('run main.ts first: out/data.js is missing');
}

const shots = [
  { file: '1-board.png', query: '' },
  { file: '2-detail.png', query: '' },
  { file: '3-filtered.png', query: '' },
];

// Pick a real detail-view target and a real filtered state from the board.
const board = JSON.parse(
  execFileSync('node', ['-e', `process.stdout.write(require('fs').readFileSync('${join(outDir, 'board.json')}','utf8'))`], { encoding: 'utf8' }),
);
const rows = board.rows ?? board;
const top = rows.find((r) => r.rank === 1) ?? rows[0];
const filteredCat = top.category ?? rows[0].category;

shots[1].query = `?protocol=${encodeURIComponent(top.slug)}&panel=plan`;
shots[2].query = `?token=none&category=${encodeURIComponent(filteredCat)}`;

const profile = mkdtempSync(join(tmpdir(), 'tr-shoot-'));
try {
  for (const shot of shots) {
    const url = `file://${page}${shot.query}`;
    execFileSync(
      'google-chrome',
      [
        '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
        '--force-device-scale-factor=1',
        `--user-data-dir=${profile}`,
        '--window-size=1440,900',
        '--virtual-time-budget=4000',
        `--screenshot=${join(here, 'screenshots', shot.file)}`,
        url,
      ],
      { stdio: 'ignore' },
    );
    console.log(`shot ${shot.file} <- ${shot.query || '(board)'}`);
  }
} finally {
  rmSync(profile, { recursive: true, force: true });
}
