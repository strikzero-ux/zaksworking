/* ブラウザを開いて、画面のエラーを拾えるようにするだけの薄い包み。
   ------------------------------------------------------------
   ・Chromium の場所は環境変数 ZC_CHROME で上書きできる。
     指定が無ければ Playwright が用意した既定のものを使う。
   ・音を鳴らす検査があるので、自動再生の制限を外して起動する。 */
/* Playwright の在り処。ふつうは `npm i -D playwright` で入るが、
   全体に入れてある環境もあるので、その場合は ZC_PLAYWRIGHT で
   playwright の index.js を直に指せるようにしておく。 */
let chromium;
try{
  ({ chromium } = await import('playwright'));
}catch(e){
  if(!process.env.ZC_PLAYWRIGHT){
    console.error('playwright が見つかりません。tests/README.md の手順で入れてください。');
    console.error('（全体に入っている場合は ZC_PLAYWRIGHT=/path/to/playwright/index.js を指定）');
    throw e;
  }
  const mod = await import(process.env.ZC_PLAYWRIGHT);
  chromium = mod.chromium || (mod.default && mod.default.chromium);
}

/* 検査の合否に関係しない雑音。ネットの有無や Tone.js の作法警告など。 */
const NOISE = [
  'Failed to load resource',
  'net::ERR_',
  'Events scheduled inside of scheduled callbacks',
  'The AudioContext was not allowed to start',
];
const isNoise = (t) => NOISE.some(n => t.includes(n));

export async function openApp(url, opt = {}){
  const browser = await chromium.launch({
    executablePath: process.env.ZC_CHROME || undefined,
    args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('[例外] ' + e.message));
  page.on('console', m => {
    if(m.type() !== 'error') return;
    if(isNoise(m.text())) return;
    errors.push('[console.error] ' + m.text());
  });
  /* 確認ダイアログは既定で「いいえ」。答えを変えたいときは opt で渡す。 */
  page.on('dialog', async d => {
    if(opt.acceptDialogs) await d.accept(opt.promptAnswer);
    else await d.dismiss();
  });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.makeSong === 'function', null, { timeout: 20000 });
  await page.waitForTimeout(opt.settleMs || 1200);
  return { browser, page, errors };
}
