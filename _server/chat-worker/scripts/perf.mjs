// Response times from the production database (perf table: numbers only, no text): p50 / p95 per stage.
//   npm run perf            last 7 days
//   npm run perf -- 30      last 30 days
import { execFileSync } from 'node:child_process';

const days = Number(process.argv[2]) || 7;
const since = Date.now() - days * 86400000;
const sql = `SELECT kind, total, pre, ttft, ai, post FROM perf WHERE at > ${since}`;
const raw = execFileSync('npx', ['wrangler@4', 'd1', 'execute', 'teaphuket-chat', '--remote', '--json', '--command', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const rows = JSON.parse(raw)[0].results;
const pct = (a, p) => (a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : '–');
const LABEL = {
  ai: 'AI answer, in one piece', ai_stream: 'AI answer, streamed',
  tg: 'Telegram → webhook stored (pre: Telegram delay, 1 s resolution)', deliver: 'Team message stored → in the browser',
};
console.log(`Response times, last ${days} days (ms)\n`);
for (const kind of ['ai_stream', 'ai', 'tg', 'deliver']) {
  const r = rows.filter((x) => x.kind === kind);
  if (!r.length) continue;
  console.log(`${LABEL[kind]} – ${r.length} measurements`);
  for (const col of ['pre', 'ttft', 'ai', 'post', 'total']) {
    const v = r.map((x) => x[col]).filter((x) => x !== null && x !== undefined).sort((a, b) => a - b);
    if (v.length) console.log(`  ${col.padEnd(6)} p50 ${String(pct(v, 0.5)).padStart(6)}   p95 ${String(pct(v, 0.95)).padStart(6)}`);
  }
  console.log('');
}
if (!rows.length) console.log('No measurements yet.');
