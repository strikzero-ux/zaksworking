#!/usr/bin/env node
/* 配布物を組み立てる
   ------------------------------------------------------------
   使い方:
       node build/make-dist.mjs
       ZC_TERSER=/path/to/terser node build/make-dist.mjs   （置き場所を指定するとき）

   作るもの（dist/ の下）:
     1. blogger/zcnova-blogger.html
        Blogger の投稿に「HTMLビュー」でそのまま貼り付ける一式。
        本体は iframe（srcdoc）の中で動かす。ブログ側のCSSと混ざらず、
        変数名もぶつからない。中身は説明（コメント）を外して軽くしてある。
     2. blogger/zcnova-blogger-外部ファイル版.html
        本体をどこかに置いてある場合の、数行だけの貼り付け用。
     3. zip/  … 手元で使う版一式（本体＋権利表記＋説明）
     4. zcnova-bgm-studio-v5.6.zip

   ＋ public/（dist の外）… **URLで公開するときの中身そのもの**
     Netlify・Cloudflare Pages・GitHub Pages などに、このフォルダごと
     置けばそのまま動く。dist/ と違って **git に入れる**（入れないと
     ホスティング側が拾えない）。
       public/index.html   本体（ZCNOVA_BGM_v5.6.html と同じもの）
       public/robots.txt   検索よけをしない印（置かないと扱いが曖昧になる）
       public/_headers     Netlify 用の見出し設定。Cloudflare Pages も読む
       public/ライセンスと利用について.txt

   ⚠️ 中身の削り方について
     JavaScript は terser に「圧縮も名前の付け替えもせず、説明だけ外す」
     設定で通している。名前を付け替えないのは、このファイルが
     **9つの <script> で1つのグローバルを共有している**ため。
     ブロックごとに名前を変えると、別のブロックから呼べなくなる。
     組み立てたファイルには検査一式をそのまま掛けられる：
         ZC_APP=dist/blogger/_app.min.html node tests/run.mjs
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SRC  = path.join(ROOT, 'ZCNOVA_BGM_v5.6.html');
const DIST = path.join(ROOT, 'dist');

/* ---------- terser を探す ---------- */
let minifyJs;
try{
  const mod = await import(process.env.ZC_TERSER || 'terser');
  minifyJs = mod.minify || (mod.default && mod.default.minify);
}catch(e){
  console.error('terser が見つかりません。`npm i -D terser` を入れるか、');
  console.error('ZC_TERSER=/path/to/terser/main.js を指定してください。');
  process.exit(1);
}

const src = fs.readFileSync(SRC, 'utf8');
const NL = src.includes('\r\n') ? '\r\n' : '\n';
const lines = src.split(NL);

/* ---------- 1. 本体から説明（コメント）を外す ---------- */
/* タグは行頭にそろえてあるので、行単位で切り出せば中身を取り違えない。
   （正規表現で <script を探すと、コメントの中の「<script」まで拾う） */
const isOpenScript  = l => /^<script(\s|>)/.test(l);
const isCloseScript = l => l.trim() === '</script>';
const isOpenStyle   = l => l.trim() === '<style>';
const isCloseStyle  = l => l.trim() === '</style>';

/* CSS の説明を外す（文字列の中の / * は触らない） */
function stripCss(css){
  let out = '', i = 0, q = null;
  while(i < css.length){
    const c = css[i];
    if(q){ out += c; if(c === '\\'){ out += css[i+1] || ''; i += 2; continue; } if(c === q) q = null; i++; continue; }
    if(c === '"' || c === "'"){ q = c; out += c; i++; continue; }
    if(c === '/' && css[i+1] === '*'){ const e = css.indexOf('*/', i + 2); i = e < 0 ? css.length : e + 2; continue; }
    out += c; i++;
  }
  return out.split('\n').map(l => l.replace(/\s+$/, '')).filter(l => l.trim()).join('\n');
}

/* HTML の説明を外す */
const stripHtml = html => html
  .replace(/<!--[\s\S]*?-->/g, '')
  .split('\n').map(l => l.replace(/\s+$/, '')).filter(l => l.trim()).join('\n');

const out = [];
let i = 0, jsBlocks = 0, htmlBuf = [];
const flushHtml = () => { if(htmlBuf.length){ const t = stripHtml(htmlBuf.join('\n')); if(t) out.push(t); htmlBuf = []; } };

while(i < lines.length){
  const l = lines[i];
  if(isOpenScript(l)){
    /* 開始タグは複数行にまたがることがある（Tone.js の integrity など） */
    const start = i;
    let head = [];
    while(i < lines.length && !/>\s*$/.test(lines[i]) && !lines[i].includes('></script>')){ head.push(lines[i]); i++; }
    head.push(lines[i]); i++;
    const headText = head.join('\n');
    if(headText.includes('</script>')){        // 外から読むもの（src=）。そのまま
      flushHtml(); out.push(headText); continue;
    }
    const body = [];
    while(i < lines.length && !isCloseScript(lines[i])){ body.push(lines[i]); i++; }
    i++;                                        // </script> を飛ばす
    const code = body.join('\n');
    const r = await minifyJs(code, {
      /* 圧縮も名前の付け替えもしない。9つの <script> が1つのグローバルを
         共有しているので、名前を変えると別のブロックから呼べなくなる。 */
      compress: false, mangle: false,
      format: { comments: false, beautify: false, ascii_only: false },
    });
    if(r.error) throw r.error;
    flushHtml();
    out.push(headText, r.code, '</script>');
    jsBlocks++;
    continue;
  }
  if(isOpenStyle(l)){
    const body = []; i++;
    while(i < lines.length && !isCloseStyle(lines[i])){ body.push(lines[i]); i++; }
    i++;
    flushHtml();
    out.push('<style>', stripCss(body.join('\n')), '</style>');
    continue;
  }
  htmlBuf.push(l); i++;
}
flushHtml();
const min = out.join('\n') + '\n';

/* ---------- 2. Blogger 貼り付け用 ---------- */
/* <script type="text/plain"> の中身は、ブラウザが実体参照を解釈しないので
   書いたままの文字が textContent で戻る。ただし「</script」だけは
   そこでタグが閉じてしまうので、「<\/script」に逃がしておき、
   読み出すときに戻す。 */
const escaped = min.replace(/<\/script/gi, '<\\/script');

/* 画面の高さをブログ側へ伝える小さな仕掛け。本体には手を入れず、
   組み立てるときにだけ足す（本体の検査結果に影響しないようにするため）。 */
const HEIGHT_REPORTER = `<script>
(function(){
  if(window.parent === window) return;
  var last = 0;
  function tell(){
    var h = Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0);
    if(Math.abs(h - last) < 8) return;
    last = h;
    try{ window.parent.postMessage({ zcnovaHeight: h }, '*'); }catch(e){}
  }
  window.addEventListener('load', tell);
  setInterval(tell, 400);
})();
</script>`;
const framed = escaped.replace(/<\/body>/i, HEIGHT_REPORTER.replace(/<\/script/gi, '<\\/script') + '\n</body>');

const CLOSE = '<' + '/script';   // このファイル自身が閉じないように分けて書く
const bloggerFull = `<!-- ============================================================
     ZCnova BGM Studio — Blogger 貼り付け用（この1枚で完結します）
     ------------------------------------------------------------
     入れ方
       1. Blogger の投稿画面をひらく
       2. 左上の「作成」を「HTMLビュー」に切り替える
       3. このファイルの中身をぜんぶ貼り付ける
       4. そのまま公開する
     ⚠️ 貼ったあとで「作成（Compose）ビュー」に戻さないでください。
        戻すとタグが書き換えられて動かなくなります。
     ⚠️ 大きいので、投稿が重いと感じるときは下の「外部ファイル版」を
        お使いください（本体をどこかに置いて、数行だけ貼る形です）。
     ============================================================ -->
<div class="zcnova-embed" style="margin:0 0 1.2em;">
  <iframe id="zcnova-frame" title="ZCnova BGM Studio"
          allow="autoplay; clipboard-write"
          loading="lazy"
          style="width:100%;height:1400px;border:0;display:block;background:#14100c;border-radius:10px;"></iframe>
  <noscript><p>この道具を使うには JavaScript を有効にしてください。</p></noscript>
</div>

<script type="text/plain" id="zcnova-src">
${framed}
${CLOSE}>

<script>
(function(){
  var box = document.getElementById('zcnova-src');
  var frame = document.getElementById('zcnova-frame');
  if(!box || !frame) return;
  /* 逃がしてあった「<\\/script」を元に戻す */
  frame.srcdoc = box.textContent.replace(/<\\\\\\/script/gi, '<' + '/script');
  /* 中の画面の高さに合わせる（ブログの中で二重にスクロールさせない） */
  window.addEventListener('message', function(e){
    if(e.source !== frame.contentWindow) return;
    var h = e.data && e.data.zcnovaHeight;
    if(typeof h === 'number' && h > 200) frame.style.height = (h + 24) + 'px';
  });
})();
${CLOSE}>
`;

const bloggerLite = `<!-- ============================================================
     ZCnova BGM Studio — Blogger 貼り付け用（外部ファイル版）
     ------------------------------------------------------------
     本体（ZCNOVA_BGM_v5.6.html）を、https で読める場所に置いてから使います。
       ・GitHub Pages / Netlify / Cloudflare Pages / 自分のサーバ など
       ・「https://」で始まる場所に置くこと（http:// だと音が鳴りません）
     下の ★ を、置いた場所のアドレスに書き換えて、
     Blogger の投稿を「HTMLビュー」にして貼り付けてください。
     ============================================================ -->
<div class="zcnova-embed" style="margin:0 0 1.2em;">
  <iframe id="zcnova-frame" title="ZCnova BGM Studio"
          src="★ここに本体のアドレス★"
          allow="autoplay; clipboard-write"
          loading="lazy"
          style="width:100%;height:1400px;border:0;display:block;background:#14100c;border-radius:10px;"></iframe>
</div>
<script>
(function(){
  var frame = document.getElementById('zcnova-frame');
  window.addEventListener('message', function(e){
    if(!frame || e.source !== frame.contentWindow) return;
    var h = e.data && e.data.zcnovaHeight;
    if(typeof h === 'number' && h > 200) frame.style.height = (h + 24) + 'px';
  });
})();
${CLOSE}>
`;

/* ---------- 3. 手元で使う版（zip）----------
   権利表記は、アプリの中の「ライセンス・利用について」を**そのまま**
   外に出す。手で書き写すと必ずどちらかが古くなるので、実際に画面へ
   出ている文字（innerText）を取り出して使う。 */
async function licenseText(){
  let chromium;
  try{
    const mod = await import(process.env.ZC_PLAYWRIGHT || 'playwright');
    chromium = mod.chromium || (mod.default && mod.default.chromium);
  }catch(e){ return null; }
  const browser = await chromium.launch({
    executablePath: process.env.ZC_CHROME || undefined, args: ['--no-sandbox'] });
  try{
    const page = await browser.newPage();
    /* 外へは出さない。字体もライブラリも要らない（文字が読めればよい） */
    await page.route('**://*/**', r => r.abort());
    await page.setContent(fs.readFileSync(SRC, 'utf8'), { waitUntil: 'domcontentloaded' });
    return await page.evaluate(() => {
      const 本文 = document.querySelector('#card7 .fold-body');
      if(!本文) return null;
      /* 読み取る前に、文章として読める形へ整える。
         ・見出し（大きめの <b>）に「■」を付けて、前に1行あける
         ・リンクは「文字（アドレス）」の形にして、アドレスを残す
         ・箇条書きの <li> に「・」を付ける */
      本文.querySelectorAll('b').forEach(b => {
        const size = parseFloat(getComputedStyle(b).fontSize) || 0;
        if(size >= 12.4) b.textContent = '\n■ ' + b.textContent.trim();
      });
      本文.querySelectorAll('a[href]').forEach(a => {
        const u = a.getAttribute('href') || '';
        if(!u) return;
        const 文字 = a.textContent.trim();
        const 素 = u.replace(/^https?:\/\//, '').replace(/\/+$/, '');
        /* 見えている文字がアドレスそのもの（http なし）なら、書き換えて
           アドレスを完全な形にする。別の文言ならうしろに括弧で足す。
           足すか書き換えるかを取り違えると
           「lame.sourceforge.net（https://lame.sourceforge.net）」のように二重になる。 */
        a.textContent = (文字 === 素 || 文字 === u) ? u : (文字 + '（' + u + '）');
      });
      本文.querySelectorAll('li').forEach(li => { li.textContent = '・' + li.textContent.trim(); });
      return 本文.innerText
        .split('\n')
        .map(l => l.replace(/[\t 　]+/g, ' ').trim())   // 行頭の字下げと重なった空白を落とす
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    });
  } finally { await browser.close(); }
}

/* ---------- 書き出し ---------- */
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(path.join(DIST, 'blogger'), { recursive: true });
fs.writeFileSync(path.join(DIST, 'blogger', '_app.min.html'), min);
fs.writeFileSync(path.join(DIST, 'blogger', 'zcnova-blogger.html'), bloggerFull);
fs.writeFileSync(path.join(DIST, 'blogger', 'zcnova-blogger-外部ファイル版.html'), bloggerLite);
fs.copyFileSync(path.join(HERE, 'Bloggerへの入れ方.txt'),
                path.join(DIST, 'blogger', 'Bloggerへの入れ方.txt'));


/* zip の中身 */
const ZIPDIR = path.join(DIST, 'zip', 'ZCnova BGM Studio v5.6');
fs.mkdirSync(ZIPDIR, { recursive: true });
fs.copyFileSync(SRC, path.join(ZIPDIR, 'ZCNOVA_BGM_v5.6.html'));
fs.copyFileSync(path.join(HERE, 'はじめにお読みください.txt'),
                path.join(ZIPDIR, 'はじめにお読みください.txt'));

const lic = await licenseText();
if(lic){
  const 見出し = [
    '==========================================================',
    ' ZCnova BGM Studio  v5.6',
    ' ライセンスと利用について',
    '==========================================================',
    '',
    '※ この文書は、アプリの画面いちばん下にある',
    '   「ライセンス・利用について」と同じ内容です。',
    '   （組み立てるときに画面から自動で書き出しています）',
    '',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(ZIPDIR, 'ライセンスと利用について.txt'),
    見出し + lic.replace(/\n/g, '\r\n').replace(/^/, '').replace(/\r?\n/g, '\r\n') + '\r\n');
  console.log('権利表記        画面から書き出しました（' + lic.length + '文字）');
}else{
  console.warn('⚠ 権利表記を書き出せませんでした（playwright が見つかりません）。');
  console.warn('  ZC_PLAYWRIGHT=/path/to/playwright/index.js を指定してください。');
}

/* zip にまとめる（zip コマンドが無ければ、たたまずに置いたままにする） */
const ZIPNAME = 'zcnova-bgm-studio-v5.6.zip';
let zipped = false;
try{
  const { execFileSync } = await import('node:child_process');
  execFileSync('zip', ['-r', '-q', '-X', path.join(DIST, ZIPNAME), 'ZCnova BGM Studio v5.6'],
               { cwd: path.join(DIST, 'zip') });
  zipped = true;
}catch(e){
  console.warn('⚠ zip コマンドが使えないので、たたまずに dist/zip/ に置きました。');
}

/* ---------- 公開用（URLで配るとき） ----------
   ここだけ dist/ の外に置く。dist/ は「組み立て直せるから git に入れない」
   ものだが、public/ は **公開するファイルそのもの**なので git に入れる。
   ホスティング側（Netlify・Cloudflare Pages・GitHub Pages）は
   git にあるファイルしか見ないため、無いとサイトが空になる。 */
const PUB = path.join(ROOT, 'public');
fs.mkdirSync(PUB, { recursive: true });
/* 本体。URLの見え方が短くなるよう index.html にする
   （https://例.com/ だけで開ける） */
fs.writeFileSync(path.join(PUB, 'index.html'), src);

/* 検索よけをしない印。置かないと巡回側の扱いが曖昧になる */
fs.writeFileSync(path.join(PUB, 'robots.txt'),
  'User-agent: *\nAllow: /\n');

/* Netlify の見出し設定（Cloudflare Pages も同じ書き方を読む）。
   ・音を作るのに時間がかかるので、本体は毎回取り直させない
   ・とはいえ更新したらすぐ反映してほしいので、確認だけはさせる */
fs.writeFileSync(path.join(PUB, '_headers'),
  ['/*',
   '  X-Content-Type-Options: nosniff',
   '  Referrer-Policy: no-referrer',
   '',
   '/index.html',
   '  Cache-Control: public, max-age=0, must-revalidate',
   ''].join('\n'));

if(lic){
  fs.writeFileSync(path.join(PUB, 'ライセンスと利用について.txt'),
    fs.readFileSync(path.join(ZIPDIR, 'ライセンスと利用について.txt')));
}
/* 置き方の手順書。組み立てで消えないよう、ここで置き直す */
fs.copyFileSync(path.join(HERE, '公開のしかた.txt'),
                path.join(PUB, '公開のしかた.txt'));

const kb = n => (n / 1024).toFixed(0) + 'KB';
console.log(`本体            ${kb(src.length)}`);
console.log(`説明を外した版  ${kb(min.length)}  （${jsBlocks}個の <script> を通した）`);
console.log(`Blogger 貼り付け ${kb(bloggerFull.length)}`);
console.log(`外部ファイル版   ${kb(bloggerLite.length)}`);
if(zipped) console.log(`zip             ${kb(fs.statSync(path.join(DIST, ZIPNAME)).size)}  → dist/${ZIPNAME}`);
console.log(`公開用          ${kb(src.length)}  → public/index.html（このフォルダごと置けば動く）`);
