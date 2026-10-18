// Favicon generator: one SVG source → favicon.svg, favicon.ico (16/32/48), PNG sizes and the iOS icon.
// The mark: dark-green circle (#375A3C) with the cream Moychay teapot from the logo, transparent corners.
// Run from the repo root: node _build/favicon/make.js   (uses Playwright's Chromium from _qa/node_modules)
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const { chromium } = require(path.join(ROOT, '_qa/node_modules/playwright'));

const GREEN = '#375A3C', CREAM = '#F3ECE1';
// The official Moychay teapot, traced 1:1 from the logo by trace.js (logo-source.jpg → teapot.json)
const TEAPOT = require('./teapot.json');
// the teapot is centred in the 512 canvas at the given share of the width
const mark = (share) => {
  const k = (512 * share) / TEAPOT.w;
  const x = (256 - (TEAPOT.w * k) / 2).toFixed(1), y = (256 - (TEAPOT.h * k) / 2).toFixed(1);
  return `<path fill="${CREAM}" fill-rule="evenodd" transform="translate(${x} ${y}) scale(${k.toFixed(4)})" d="${TEAPOT.d}"/>`;
};

// browsers, Google, Android: round mark, transparent around the circle
const ROUND = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><circle cx="256" cy="256" r="256" fill="${GREEN}"/>${mark(0.8)}</svg>\n`;
// iOS fills transparency with black and rounds the corners itself, so the home-screen icon is a full square
const SQUARE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${GREEN}"/>${mark(0.7)}</svg>\n`;

const OUT = [
  ['img/favicon-32.png', ROUND, 32],
  ['img/favicon-96.png', ROUND, 96],
  ['img/icon-192.png', ROUND, 192],
  ['img/icon-512.png', ROUND, 512],
  ['apple-touch-icon.png', SQUARE, 180],
];

function ico(pngs) {                       // ICO container with PNG-compressed entries (supported everywhere since Vista)
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  let off = head.length;
  pngs.forEach(([size, buf], i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(size % 256, e); head.writeUInt8(size % 256, e + 1);
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(buf.length, e + 8); head.writeUInt32LE(off, e + 12);
    off += buf.length;
  });
  return Buffer.concat([head, ...pngs.map((p) => p[1])]);
}

(async () => {
  fs.writeFileSync(path.join(__dirname, 'favicon-source.svg'), ROUND);
  fs.writeFileSync(path.join(__dirname, 'apple-touch-source.svg'), SQUARE);
  fs.writeFileSync(path.join(ROOT, 'favicon.svg'), ROUND);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const render = (svg, size) => page.evaluate(async ([svg, size]) => {
    const img = new Image();
    img.src = 'data:image/svg+xml;base64,' + btoa(svg);
    await img.decode();
    const c = document.createElement('canvas');
    c.width = c.height = size;
    c.getContext('2d').drawImage(img, 0, 0, size, size);
    return c.toDataURL('image/png').split(',')[1];
  }, [svg, size]).then((b64) => Buffer.from(b64, 'base64'));
  for (const [file, svg, size] of OUT) fs.writeFileSync(path.join(ROOT, file), await render(svg, size));
  const icoParts = [];
  for (const s of [16, 32, 48]) icoParts.push([s, await render(ROUND, s)]);
  fs.writeFileSync(path.join(ROOT, 'favicon.ico'), ico(icoParts));
  await browser.close();
  console.log('favicon: written', ['favicon.svg', 'favicon.ico', ...OUT.map((o) => o[0])].join(', '));
})();
