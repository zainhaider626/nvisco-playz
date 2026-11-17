import puppeteer from 'puppeteer-core';
import fs from 'fs';
const svg = fs.readFileSync('public/favicon.svg', 'utf8');
const exe = '/usr/bin/google-chrome';
const b = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--no-sandbox','--disable-gpu'] });
const p = await b.newPage();
async function out(size, file, maskable) {
  await p.setViewport({ width: size, height: size });
  const inner = maskable ? svg.replace('rx="116"', 'rx="0"').replace('<circle', '<g transform="translate(76.8 76.8) scale(.7)"><circle').replace('</svg>', '</g></svg>') : svg;
  await p.setContent(`<body style="margin:0;background:transparent">${inner.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`);
  await p.screenshot({ path: file, omitBackground: true });
}
await out(192, 'public/icons/icon-192.png'); await out(512, 'public/icons/icon-512.png'); await out(512, 'public/icons/maskable-512.png', true);
await b.close();
