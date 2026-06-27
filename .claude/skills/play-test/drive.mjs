// Play-test driver for Dino Bob. See SKILL.md.
//   node drive.mjs         -> drive the LOCAL working tree (file://)
//   node drive.mjs --live  -> drive the deployed site
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);

function loadPuppeteer() {
  for (const c of [os.homedir() + '/.dino-playtest-tools/node_modules/puppeteer-core',
                   '/tmp/imgtools/node_modules/puppeteer-core', 'puppeteer-core']) {
    try { return require(c); } catch (e) {}
  }
  console.error('puppeteer-core not found. One-time:\n  npm i --prefix ~/.dino-playtest-tools --cache /tmp/npmcache puppeteer-core');
  process.exit(2);
}
const puppeteer = loadPuppeteer();

const LIVE = process.argv.includes('--live');
const skillDir = path.dirname(new URL(import.meta.url).pathname);
const REPO = path.resolve(skillDir, '../../..');            // <repo>/.claude/skills/play-test -> <repo>
const TARGET = LIVE ? 'https://dino-bob-penny.netlify.app/' : 'file://' + REPO + '/index.html';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOTS = '/tmp/dino-shots';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(...a);
let passes = 0, fails = 0;
const check = (name, ok, extra) => { (ok ? passes++ : fails++); log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}${extra ? ' — ' + extra : ''}`); };

function prof(id, name) {
  return { id, name, avatar: 'dinobob', coins: 100, highScore: 0, roundsPlayed: 0,
    adventureStage: 0, adventureStars: [], customChallenge: null, stats: {}, badges: [],
    unlocked: { characters: ['dinobob'], arrows: ['wooden'], hats: [], outfits: ['classic'], shiny: [] },
    equipped: { character: 'dinobob', arrow: 'wooden', hat: null, outfit: 'classic', shiny: false } };
}
// current = Leo so the family default p1 (Penny) differs -> the restore is observable
const save = JSON.stringify({ profiles: [prof('p_penny', 'Penny'), prof('p_leo', 'Leo')], currentId: 'p_leo' });

fs.rmSync(SHOTS, { recursive: true, force: true });
fs.mkdirSync(SHOTS, { recursive: true });
const errors = [];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--mute-audio', '--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.evaluateOnNewDocument((s) => localStorage.setItem('dinobob_save_v1', s), save);

const screen = () => page.evaluate(() => {
  const ids = ['title','profiles','home','game','results','arcade','closet','adventure','challenge','family'];
  for (const s of ids) { const el = document.getElementById('screen-' + s); if (el && !el.classList.contains('hidden')) return s; } return '?';
});
const click = (id) => page.evaluate((id) => { const el = document.getElementById(id); if (el) { el.click(); return true; } return false; }, id);
const currentId = () => page.evaluate(() => { try { return JSON.parse(localStorage.getItem('dinobob_save_v1')).currentId; } catch (e) { return '?'; } });
const shot = (n) => page.screenshot({ path: `${SHOTS}/${n}.png` });

async function playRound(maxShots) {
  await sleep(3600); // countdown
  const box = await (await page.$('#game-canvas')).boundingBox();
  const toClient = (wx, wy) => ({ x: box.x + wx / 1600 * box.width, y: box.y + wy / 900 * box.height });
  for (let i = 0; i < maxShots; i++) {
    const p = toClient(60 + (i * 37) % 150, 745 + (i * 53) % 44);
    await page.mouse.move(p.x, p.y); await page.mouse.down(); await sleep(30); await page.mouse.up(); await sleep(85);
    if (await screen() !== 'game') break;
  }
  for (let i = 0; i < 14; i++) { if (await screen() !== 'game') break; await sleep(700); }
}

try {
  log('== target:', TARGET);
  await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(() => { const o = document.getElementById('intro-overlay'); if (o) o.remove(); });
  await sleep(1500);
  await shot('01-title');
  check('reaches title screen', await screen() === 'title', await screen());

  await click('btn-title-play'); await sleep(1200);
  if (await screen() === 'profiles') { await click('btn-play'); await sleep(800); }
  await shot('02-home');
  const homeBtns = await page.evaluate(() => ['btn-play','btn-adventure','btn-challenge','btn-family','btn-arcade','btn-closet'].filter(id => document.getElementById(id)).length);
  check('home shows all 6 mode buttons', homeBtns === 6, homeBtns + '/6');

  await click('btn-adventure'); await sleep(900); await shot('03-adventure');
  const nodes = await page.evaluate(() => document.querySelectorAll('#adventure-map .stage-node').length);
  const wantStages = await page.evaluate(() => (typeof STAGES !== 'undefined' ? STAGES.count : 3));
  check('adventure map renders all stages', nodes === wantStages, nodes + '/' + wantStages + ' nodes'); await click('btn-adventure-back'); await sleep(400);

  // star ratings end to end: award 2 stars on stage 0 via the real save API,
  // reopen the map, and confirm the node + total counter show them.
  await page.evaluate(() => { SAVE.completeAdventureStage(0, 2); });
  await click('btn-adventure'); await sleep(500);
  const starState = await page.evaluate(() => {
    const node = document.querySelector('#adventure-map .stage-node .stage-rating');
    const dim = node ? node.querySelectorAll('.dim').length : -1;
    return { rating: SAVE.adventureStarRating(0), filled: node ? 3 - dim : -1, total: SAVE.adventureStarTotal(), label: document.getElementById('adventure-stars').textContent };
  });
  check('star ratings store + render (2★ on stage 1)', starState.rating === 2 && starState.filled === 2 && starState.total >= 2, JSON.stringify(starState));
  await click('btn-adventure-back'); await sleep(300);

  await click('btn-challenge'); await sleep(900); await shot('04-challenge');
  const ctrls = await page.evaluate(() => ['challenge-time','challenge-arrows','challenge-speed','challenge-chaos','challenge-bg','challenge-rule'].filter(id => document.getElementById(id)).length);
  check('challenge maker has 6 controls', ctrls === 6, ctrls + '/6'); await click('btn-challenge-back'); await sleep(400);

  await click('btn-family'); await sleep(800); await shot('05-family');
  const fam = await page.evaluate(() => ({ p1: (document.getElementById('family-player-1')||{}).value, dis: !!(document.getElementById('btn-family-start')||{}).disabled }));
  check('family start enabled with 2 profiles', fam.dis === false); await click('btn-family-back'); await sleep(400);

  await click('btn-settings'); await sleep(500); await shot('05b-settings');
  const setEls = await page.evaluate(() => ['set-music','set-sfx','set-easy','set-reset'].filter(id => document.getElementById(id)).length);
  check('settings screen has all controls', setEls === 4, setEls + '/4');
  await click('set-easy'); await sleep(150);
  const easyOn = await page.evaluate(() => SAVE.settings().easy === true && document.getElementById('set-easy').classList.contains('on'));
  check('easier mode toggles + persists', easyOn);
  await click('set-easy'); await sleep(120);   // back off so it doesn't affect later rounds
  await click('btn-settings-back'); await sleep(400);

  log('== Target Practice');
  await click('btn-play'); await sleep(300);
  await sleep(3600);
  await shot('06-game-ingame');
  const bg = await page.evaluate(() => typeof SPRITES !== 'undefined' && !!(SPRITES.get('bg_meadow') || SPRITES.get('bg_mountain'))).catch(() => false);
  check('WebP background sprite loaded', bg);
  await playRound(26);
  await shot('07-results');
  const onResults = await screen() === 'results';
  check('round ends on Results screen', onResults, await screen());
  if (onResults) {
    const r = await page.evaluate(() => ({ acc: (document.getElementById('results-accuracy')||{}).textContent, be: (document.getElementById('results-bullseyes')||{}).textContent, sc: (document.getElementById('results-score')||{}).textContent }));
    check('Results shows Accuracy + Bullseyes rows', /%$/.test(r.acc) && /^\d+$/.test(r.be), `acc=${r.acc} bullseyes=${r.be} score=${r.sc}`);
    await click('btn-results-home'); await sleep(700);
  }

  log('== Family 2-player profile-restore');
  log('  original profile:', await currentId());
  await click('btn-family'); await sleep(700);
  await click('btn-family-start'); await sleep(300);
  check('family match switches to player 1', await currentId() === 'p_penny', 'current=' + await currentId());
  await playRound(22);
  await shot('08-family-handoff');
  check('reaches handoff after player 1', await screen() === 'family');
  await click('btn-family-back'); await sleep(900); await shot('09-after-back-home');
  check('original profile restored on mid-match Back', await currentId() === 'p_leo', 'current=' + await currentId());
} catch (e) {
  log('!! DRIVER ERROR:', e.message); await shot('99-error'); fails++;
}

check('no JS console/page errors', errors.length === 0, errors.length + ' errors');
errors.slice(0, 15).forEach(e => log('     ' + e));
log(`\n=== ${fails === 0 ? 'ALL PASS ✅' : fails + ' FAILED ❌'} (${passes} passed, ${fails} failed) — screenshots in ${SHOTS}`);
await browser.close();
process.exit(fails === 0 ? 0 : 1);
