/* ⑭ Blogger に貼り付けた形で動くか
   ------------------------------------------------------------
   貼り付け用の一式（dist/blogger/zcnova-blogger.html）は、
   本体を iframe の中で動かす。ここで確かめたいのは3つ。

     1. ブログ側のCSSに引きずられないこと。
        ブログのテンプレートには button{...!important} や .card{...} の
        ような強い指定がふつうにあり、素で埋め込むと見た目が壊れる。
     2. ブログ側を壊さないこと（横スクロールを出さない・高さが合う）。
     3. 中で本当に動くこと（曲ができる・保存できる・音が鳴る）。

   ★ 先に `node build/make-dist.mjs` で組み立てておくこと。
      組み立てていないときは、この検査は「未組み立て」として通す。 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

export const name = '⑭ Blogger に貼った形';

export async function run({ page, root }){
  const 貼り付け = path.join(root, 'dist', 'blogger', 'zcnova-blogger.html');
  if(!fs.existsSync(貼り付け)){
    return { checks: [{ ok: true, label: '未組み立てのため飛ばした',
      info: '確かめるには先に `node build/make-dist.mjs` を実行してください' }] };
  }

  /* ブログのページを真似た入れ物。わざと強いCSSを置いてある。 */
  const vendor = path.join(root, 'tests', 'vendor');
  const block = fs.readFileSync(貼り付け, 'utf8');
  const server = http.createServer((q, r) => {
    const u = (q.url || '/').split('?')[0];
    if(u === '/'){
      const port = server.address().port;
      r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return r.end(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>テスト用ブログ</title>
<style>
  *{box-sizing:content-box;}
  body{font-family:serif;background:#fff;color:#111;max-width:760px;margin:0 auto;padding:20px;}
  button{background:#eee!important;border:1px solid #999;color:#111;font-size:16px;padding:8px;}
  .card{border:3px dashed red;}
  h1{color:green;}
</style></head><body>
<h1>ブログの見出し</h1><p>記事の本文。</p>
${block.replace(/https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/tone\/[\d.]+\/Tone\.js/g,
                `http://127.0.0.1:${port}/vendor/Tone.js`)}
<p>記事のつづき。</p></body></html>`);
    }
    const f = path.join(vendor, path.basename(u));
    if(u.startsWith('/vendor/') && fs.existsSync(f)){
      r.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      return r.end(fs.readFileSync(f));
    }
    r.writeHead(404); r.end();
  });
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));

  const p2 = await page.context().newPage();
  const 落ちた = [];
  p2.on('pageerror', e => 落ちた.push(e.message));
  await p2.route('**://fonts.google*/**', r => r.abort());
  let 中 = null, 外 = null;
  try{
    await p2.goto('http://127.0.0.1:' + server.address().port + '/', { waitUntil: 'load', timeout: 30000 });
    await p2.waitForTimeout(3000);
    const fr = p2.frames().find(f => f !== p2.mainFrame());
    if(fr){
      中 = await fr.evaluate(async () => {
        const w = ms => new Promise(r => setTimeout(r, ms));
        const o = {};
        document.getElementById('makeBtn').click(); await w(900);
        o.曲ができた = !!song && song.phrases.length > 0;
        /* ブログの強いCSSが入り込んでいないこと */
        o.見出しの色 = getComputedStyle(document.querySelector('h1')).color;
        o.ボタンの色 = getComputedStyle(document.getElementById('makeBtn')).backgroundColor;
        o.カードの枠 = getComputedStyle(document.getElementById('card1')).borderStyle;
        document.getElementById('songName').value = 'テスト保存';
        document.getElementById('saveBtn').click(); await w(500);
        o.保存できた = /保存しました/.test(document.getElementById('ioStatus').textContent);
        try{ await ensurePlaying(); await w(1000); o.鳴った = Tone.Transport.state === 'started'; stopPlayback(); }
        catch(e){ o.鳴った = false; }
        return o;
      });
      外 = await p2.evaluate(() => {
        const f = document.getElementById('zcnova-frame');
        const de = document.documentElement;
        return { 高さ: parseInt(f.style.height, 10) || 0,
                 横スクロール: de.scrollWidth > de.clientWidth + 2 };
      });
    }
  } finally {
    await p2.close();
    await new Promise(ok => server.close(ok));
  }

  const checks = [];
  checks.push({ ok: !!中 && 中.曲ができた && 中.保存できた && 中.鳴った,
    label: 'ブログの記事の中で、曲ができて・保存できて・音が鳴る', info: JSON.stringify(中) });
  checks.push({ ok: !!中 && 中.ボタンの色 !== 'rgb(238, 238, 238)' && 中.カードの枠 !== 'dashed'
                    && 中.見出しの色 !== 'rgb(0, 128, 0)',
    label: 'ブログ側の強いCSS（button!important・.card・h1）が入り込まない',
    info: 中 ? `ボタン ${中.ボタンの色} / 枠 ${中.カードの枠} / 見出し ${中.見出しの色}` : '' });
  checks.push({ ok: !!外 && 外.高さ > 800 && 外.横スクロール === false,
    label: '中身の高さに合わせて伸び、ブログ側に横スクロールを出さない', info: JSON.stringify(外) });
  checks.push({ ok: 落ちた.length === 0, label: 'ブログ側でJSエラーが出ない', info: 落ちた.join(' / ') });
  return { checks };
}
