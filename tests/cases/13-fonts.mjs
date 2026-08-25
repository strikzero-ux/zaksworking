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
    中身 = await p2.evaluate(() => {
      const b = document.getElementById('playBtn');
      const be = b ? getComputedStyle(b, '::before') : null;
      return {
        ボタン: document.querySelectorAll('button').length,
        作るボタン: !!document.getElementById('makeBtn'),
        字体: getComputedStyle(document.body).fontFamily,
        /* 再生ボタンは字ではなく図形で描いているか */
        再生の状態: b ? b.dataset.state : null,
        再生の三角: be ? be.borderLeftWidth : null,
        再生の字の大きさ: b ? getComputedStyle(b).fontSize : null,
        記号の控え: /Symbol|Symbols|Arial Unicode/.test(getComputedStyle(document.body).fontFamily),
      };
    });
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

  /* 再生ボタンが「字」でなく「図形」で描かれているか
     ------------------------------------------------------------
     ブログに貼ったとき「再生ボタンに数字が出る」という報告があった。
     ボタンの中身は ▶(U+25B6) という**文字**で、本文の字体 Inter には
     この字が入っていない。ふつうはブラウザが字ごとに別の字体へ落ちて
     拾うが、拾える字体が1つも無いと「最後の手段の字形」＝
     **四角の中にその字の番号（25B6）が並んだもの**が描かれる。
     ブログは iframe の中で開くうえ Google Fonts が届かないことも
     あるので、素の環境より起きやすい。

     直し方は2段構え。
       ① 本文の字体の控えに、記号を持つ字体を足す（▶ を使う他のボタン用）
       ② いちばん目立つ再生ボタンは、字をやめて CSS の図形で描く
     ここでは②が生きていること（字は描かず、三角の枠がある）と、
     ①の控えが並んでいることを見る。 */
  checks.push({
    ok: !!中身 && 中身.再生の状態 === 'play'
        && 中身.再生の字の大きさ === '0px'
        && parseFloat(中身.再生の三角) > 0,
    label: '再生ボタンが字ではなく図形で描かれている（字体が無くても崩れない）',
    info: 中身 ? `状態 ${中身.再生の状態} / 字の大きさ ${中身.再生の字の大きさ} / 三角の幅 ${中身.再生の三角}`
               : '取れなかった',
  });
  checks.push({
    ok: !!中身 && 中身.記号の控え,
    label: '本文の字体に、記号を持つ控えが並んでいる（▶ を使う他のボタン用）',
    info: 中身 ? String(中身.字体).slice(0, 90) : '取れなかった',
  });
  return { checks };
}
