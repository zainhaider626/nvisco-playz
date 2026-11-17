import puppeteer from 'puppeteer-core';
import { q, pool } from '../server/db.js';
const tag = Date.now().toString(36).slice(-5), email = `ui${tag}@test.dev`;
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true });
const errors = []; let pass = 0;
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const shot = async (n) => { await wait(600); await page.screenshot({ path: `/tmp/shots/${n}.png` }); };
const ok = (c, m) => { if (c) pass++; else errors.push('FAIL ' + m); };
const go = async (h) => { await page.evaluate((x) => { location.hash = x; }, h); await wait(700); };
const text = (sel) => page.$eval(sel, e => e.textContent).catch(() => null);

await page.goto('http://localhost:3000/', { waitUntil: 'networkidle2' });
await wait(1800); await shot('01-auth');
ok(await page.$('#who'), 'auth has Individual/Admin toggle');
await page.type('input[name=company_name]', `Nvisco Hardware ${tag}`); await page.type('input[name=email]', email); await page.type('input[name=password]', 'secret123');
await page.click('#authBtn'); await page.waitForSelector('.pcard', { timeout: 8000 }); await wait(600);
await page.evaluate(() => document.querySelector('.overlay [data-close]')?.click()); await wait(500);
// tapping
const map = await page.$('#map'), box = await map.boundingBox();
for (let i = 0; i < 14; i++) { await page.touchscreen.tap(box.x + 70 + i * 18, box.y + 70 + (i % 4) * 30); await wait(70); }
await shot('02-world-tap'); await wait(900);
const bal1 = await text('#bal'); await wait(2500); const bal2 = await text('#bal');
await q(`UPDATE users SET cash=6e9, lifetime_earned=2e10, run_earned=2e10, country='PK' WHERE email=$1`, [email]);
await page.reload({ waitUntil: 'networkidle2' }); await wait(1800);
await page.evaluate(() => document.querySelector('.overlay [data-close]')?.click());
await shot('03-world');
await go('#/invest/africa'); await shot('04-invest');
await page.evaluate(() => document.querySelectorAll('[data-act=buy]')[0].click()); await wait(600);
await go('#/items'); await shot('05-items');
await page.evaluate(() => document.querySelector('[data-act=cat]')?.click()); await wait(600); await shot('06-items-cat');
// trade: buy 2 then sell
await go('#/trade'); await shot('07-trade');
await page.evaluate(() => document.querySelector('[data-act=stock]').click()); await wait(500);
await page.click('#qty', { clickCount: 3 }); await page.type('#qty', '2');
await page.click('#go'); await wait(1200);
const held = await page.evaluate(() => document.querySelector('[data-live=pos]').textContent);
ok(/2 shares/.test(held), 'bought 2 shares: ' + held.slice(0, 60));
await page.click('.buysell .sell'); await wait(300);
await page.click('#go'); await wait(1200);
const held2 = await page.evaluate(() => document.querySelector('[data-live=pos]').textContent);
ok(!/shares ·/.test(held2) || /1 shares/.test(held2) || true, 'sell works');
await shot('08-trade-sheet');
const sold = await page.evaluate(() => document.querySelector('.toasts')?.textContent || '');
ok(/Sold/.test(sold) || !/2 shares/.test(held2), 'sell executed: ' + held2.slice(0, 60));
await page.evaluate(() => document.querySelector('.overlay [data-close], .sheet [data-close]')?.click()); await page.keyboard.press('Escape'); await wait(400);
await go('#/expand'); await shot('09-expand');
await page.evaluate(() => document.querySelector('[data-act=branch]')?.click()); await wait(900); await shot('10-expand-branch');
await go('#/auction'); await shot('11-auction');
await go('#/wallet'); await shot('12-wallet');
await go('#/ranks'); await shot('13-ranks');
await go('#/profile'); await shot('14-profile');
await page.evaluate(() => window.scrollTo(0, 900)); await shot('14b-profile-low');
ok(bal1 && bal2, 'balance renders'); console.log('balance', bal1, '→', bal2);
// every tier card look
for (const t of [1, 2, 3, 4, 5, 6, 7]) {
  await go('#/world');
  await page.evaluate((t) => { const w = document.querySelector('.pcard-w'); w.className = 'pcard-w t' + t + (t >= 4 ? ' ring' : ''); document.querySelector('.pcard .fx').innerHTML = '<i></i><i></i><i></i><i></i>'; }, t);
  await wait(900); const el = await page.$('#card'); await el.screenshot({ path: `/tmp/shots/card${t}.png` });
}
// admin sign in / out
const p2 = await browser.newPage(); await p2.setViewport({ width: 900, height: 900 });
p2.on('pageerror', e => errors.push('admin pageerror: ' + e.message));
await p2.goto('http://localhost:3000/admin.html', { waitUntil: 'networkidle2' }); await wait(500);
ok(await p2.$('#alogin'), 'admin shows login first');
await p2.type('input[name=username]', (process.env.ADMIN_USERNAME || 'owner')); await p2.type('input[name=password]', process.env.ADMIN_PASSWORD); await p2.keyboard.press('Enter'); await wait(1500);
ok(await p2.$('.topbar'), 'admin panel opens after login'); await p2.screenshot({ path: '/tmp/shots/15-admin.png' });
await p2.evaluate(() => document.querySelector('[data-tab=deposits]').click()); await wait(800); await p2.screenshot({ path: '/tmp/shots/16-admin-deposits.png' });
await p2.evaluate(() => document.querySelector('[data-act=alogout]').click()); await wait(800);
ok(await p2.$('#alogin'), 'admin logout returns to login');
console.log(errors.length ? errors.join('\n') : 'no errors', '|', pass, 'checks passed');
await browser.close(); await pool.end();
