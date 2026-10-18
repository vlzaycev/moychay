// One-off: traces the teapot from the official logo (white on black, logo-source.jpg) into an SVG path.
// Marching squares on the grey levels (sub-pixel edges), loops simplified with Ramer–Douglas–Peucker.
// Output: teapot.json { w, h, d } in source pixels, used by make.js. Run: node _build/favicon/trace.js
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const { chromium } = require(path.join(ROOT, '_qa/node_modules/playwright'));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const src = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(__dirname, 'logo-source.jpg')).toString('base64');
  const { W, H, g } = await page.evaluate(async (src) => {
    const i = new Image(); i.src = src; await i.decode();
    const c = document.createElement('canvas'); c.width = i.width; c.height = i.height;
    const x = c.getContext('2d'); x.drawImage(i, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data, g = [];
    for (let k = 0; k < d.length; k += 4) g.push((d[k] + d[k + 1] + d[k + 2]) / 3);
    return { W: c.width, H: c.height, g };
  }, src);
  await browser.close();
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : g[y * W + x];
  // the teapot is everything bright above the "MOYCHAY" wordmark
  const limitY = Math.round(H * 0.42);
  let x0 = W, x1 = 0, y0 = H, y1 = 0;
  for (let y = 0; y < limitY; y++) for (let x = 0; x < W; x++) if (at(x, y) > 128) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const T = 128, v = (x, y) => (y >= limitY ? 0 : at(x, y));
  const P = new Map(), adj = new Map();
  const pt = (id, x, y) => { if (!P.has(id)) P.set(id, [x, y]); return id; };
  const lerp = (a, b) => (T - a) / (b - a);
  const link = (a, b) => { (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); };
  for (let y = y0 - 2; y <= y1 + 1; y++) for (let x = x0 - 2; x <= x1 + 1; x++) {
    const a = v(x, y), b = v(x + 1, y), c = v(x + 1, y + 1), d = v(x, y + 1);
    const k = (a > T ? 8 : 0) | (b > T ? 4 : 0) | (c > T ? 2 : 0) | (d > T ? 1 : 0);
    if (k === 0 || k === 15) continue;
    const top = () => pt(`h${x},${y}`, x + lerp(a, b), y), bot = () => pt(`h${x},${y + 1}`, x + lerp(d, c), y + 1);
    const lef = () => pt(`v${x},${y}`, x, y + lerp(a, d)), rig = () => pt(`v${x + 1},${y}`, x + 1, y + lerp(b, c));
    const center = (a + b + c + d) / 4 > T;
    switch (k) {
      case 1: case 14: link(lef(), bot()); break;
      case 2: case 13: link(bot(), rig()); break;
      case 3: case 12: link(lef(), rig()); break;
      case 4: case 11: link(top(), rig()); break;
      case 6: case 9: link(top(), bot()); break;
      case 7: case 8: link(lef(), top()); break;
      case 5: if (center) { link(lef(), top()); link(bot(), rig()); } else { link(lef(), bot()); link(top(), rig()); } break;
      case 10: if (center) { link(top(), rig()); link(lef(), bot()); } else { link(lef(), top()); link(bot(), rig()); } break;
    }
  }
  const seen = new Set(), loops = [];
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const loop = []; let prev = null, cur = start;
    while (cur && !seen.has(cur)) { seen.add(cur); loop.push(P.get(cur)); const n = adj.get(cur).find((q) => q !== prev && !seen.has(q)); prev = cur; cur = n; }
    if (loop.length > 12) loops.push(loop);
  }
  const rdp = (pts, eps) => {
    if (pts.length < 3) return pts;
    const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
    let max = 0, idx = 0; const L = Math.hypot(bx - ax, by - ay) || 1;
    for (let i = 1; i < pts.length - 1; i++) { const dd = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / L; if (dd > max) { max = dd; idx = i; } }
    return max > eps ? [...rdp(pts.slice(0, idx + 1), eps).slice(0, -1), ...rdp(pts.slice(idx), eps)] : [pts[0], pts[pts.length - 1]];
  };
  const f = (n) => +n.toFixed(1);
  // RDP needs open ends, so each loop is split at its farthest point
  const d = loops.map((l) => { const m = l.reduce((b, q, i) => (Math.hypot(q[0] - l[0][0], q[1] - l[0][1]) > Math.hypot(l[b][0] - l[0][0], l[b][1] - l[0][1]) ? i : b), 0);
    const s = [...rdp(l.slice(0, m + 1), 0.6).slice(0, -1), ...rdp([...l.slice(m), l[0]], 0.6).slice(0, -1)]; return 'M' + s.map(([x, y]) => `${f(x - x0)} ${f(y - y0)}`).join('L') + 'Z'; }).join('');
  fs.writeFileSync(path.join(__dirname, 'teapot.json'), JSON.stringify({ w: x1 - x0 + 1, h: y1 - y0 + 1, d }) + '\n');
  console.log('teapot traced:', loops.length, 'loops,', d.length, 'chars, box', x1 - x0 + 1, 'x', y1 - y0 + 1);
})();
