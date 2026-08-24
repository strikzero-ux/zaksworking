/* ⑬ 字体（Google Fonts）の待ちで画面が止まらないか
   ------------------------------------------------------------
   見た目のための字体を読みに行くだけで、**曲を作る画面がまったく
   出せなくなる**という壊れ方がある。CSS の @import は読み終わるまで
   画面を1ピクセルも描かせないので、fonts.googleapis.com へ届かない環境
   （社内ネット・機内・回線が細い所）では真っ黒な画面のまま待たされる。

   実測（字体の宛先が応答しない状態で計測）:
       @import      … 40秒たっても描き終わらない
       この形の link … 0.4秒で全部出る（字体は届いたところで入れ替わる）

   ここでは実際に宛先を「応答しない」状態にして、それでも画面が出るかを見る。 */
import { APP_FILE } from '../lib/serve.mjs';

export const name = '⑬ 字体が届かなくても画面が出るか';

export async function run({ page, url, root }){
  const checks = [];
  const fs = await import('node:fs');
  const src = fs.readFileSync(APP_FILE, 'utf8');

  /* 1. 画面を止める形（CSS の @import）で読んでいないこと */
  checks.push({
    ok: !/@import\s+url\(\s*['"]?https:\/\/fonts\.googleapis/.test(src),
    label: '字体を @import で読んでいない（読み終わるまで画面が出ない形）',
  });

  /* 2. link が「描画を止めない」形になっていること */
  const link = (src.match(/<link[^>]+rel="stylesheet"[^>]+fonts\.googleapis\.com[^>]*>/) || [''])[0];
  checks.push({
    ok: /media\s*=\s*["']print["']/.test(link) && /onload\s*=/.test(link),
    label: 'link が media="print" → onload で all に変える形になっている',
    info: link.slice(0, 130),
  });

  /* 3. 宛先が応答しない状態でも、画面が出て操作できること */
  const p2 = await page.context().newPage();
  const 止める = () => new Promise(() => {});           // 応答しない＝いちばん厳しい条件
  await p2.route('**://fonts.googleapis.com/**', 止める);
  await p2.route('**://fonts.gstatic.com/**', 止める);
  let 描画 = -1, 中身 = null;
  try{
    const t0 = Date.now();
    await p2.goto(url.replace('/app.html', '/app-fonts.html'),
                  { waitUntil: 'domcontentloaded', timeout: 20000 });
    描画 = Date.now() - t0;
    中身 = await p2.evaluate(() => ({
      ボタン: document.querySelectorAll('button').length,
      作るボタン: !!document.getElementById('makeBtn'),
      字体: getComputedStyle(document.body).fontFamily,
    }));
  }catch(e){
    中身 = { 落ちた: e.message.slice(0, 80) };
  }finally{
    await p2.close();
  }
  checks.push({
    ok: 描画 >= 0 && 描画 < 5000 && 中身 && 中身.作るボタン && 中身.ボタン > 100,
    label: '字体の宛先が応答しなくても、5秒以内に画面が出て操作できる',
    info: `${描画}ms / ${JSON.stringify(中身)}`,
  });
  return { checks };
}
