/* ⑳ 公開用フォルダ（URLで配るとき）
   ------------------------------------------------------------
   ブログに貼り付ける形（⑭）とは別に、**URLを1つ配る**形を用意してある。
   `public/` をそのままホスティング（Netlify・Cloudflare Pages・
   GitHub Pages など）へ置けば動く、という約束を守る。

   ここで見るのは4つ。
     1. public/ が組み立てられていて、中身がそろっている
     2. `/` を開くだけでアプリが出る（index.html になっている）
     3. 本当に動く（曲ができて・鳴る）
     4. git に入る（.gitignore で外されていない）
        ★ ここが抜けると、手元では動くのに公開したサイトが空になる。
          dist/ は「組み立て直せるから git に入れない」ものなので、
          同じ扱いにしてしまう間違いが起きやすい。

   ★ 先に `node build/make-dist.mjs` で組み立てておくこと。 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';

export const name = '⑳ 公開用フォルダ・説明書';

export async function run({ page, root }){
  const PUB = path.join(root, 'public');
  if(!fs.existsSync(PUB)){
    return { checks: [{ ok: true, label: '未組み立てのため飛ばした',
      info: '確かめるには先に `node build/make-dist.mjs` を実行してください' }] };
  }
  const checks = [];

  /* 1. 中身がそろっているか */
  const 要る = ['index.html', 'robots.txt', '_headers'];
  const 足りない = 要る.filter(f => !fs.existsSync(path.join(PUB, f)));
  const ある = fs.readdirSync(PUB);
  checks.push({ ok: 足りない.length === 0,
    label: `公開用フォルダの中身がそろっている（${ある.length}個）`,
    info: 足りない.length ? '足りない: ' + 足りない.join(' ') : ある.join(' / ') });

  /* 4. git に入るか（.gitignore で外されていないか） */
  let 外れ = null;
  try{
    const r = execFileSync('git', ['check-ignore', '-v', 'public/index.html'],
                           { cwd: root, encoding: 'utf8' }).trim();
    外れ = r;                       /* 何か返る＝除外されている */
  }catch(e){ 外れ = null; }         /* 終了コード1＝除外されていない（正常） */
  checks.push({ ok: 外れ === null,
    label: '公開用フォルダが git に入る（.gitignore で外されていない）',
    info: 外れ === null
      ? 'ホスティングは git にあるファイルしか見ない。外すとサイトが空になる'
      : '.gitignore が外している: ' + 外れ });

  /* 2〜3. 実際にサーバーへ置いて開く */
  const vendor = path.join(root, 'tests', 'vendor');
  const TYPE = { '.html':'text/html; charset=utf-8', '.txt':'text/plain; charset=utf-8',
                 '.js':'text/javascript; charset=utf-8' };
  const server = http.createServer((q, r) => {
    let u = decodeURIComponent((q.url || '/').split('?')[0]);
    if(u.startsWith('/vendor/')){
      const f = path.join(vendor, path.basename(u));
      if(fs.existsSync(f)){ r.writeHead(200, { 'Content-Type':TYPE['.js'] }); return r.end(fs.readFileSync(f)); }
    }
    if(u === '/') u = '/index.html';
    const f = path.join(PUB, u.replace(/^\//, ''));
    if(!f.startsWith(PUB) || !fs.existsSync(f)){ r.writeHead(404); return r.end('404'); }
    let body = fs.readFileSync(f);
    if(u === '/index.html'){
      const port = server.address().port;
      body = Buffer.from(body.toString('utf8').replace(
        /https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/tone\/[\d.]+\/Tone\.js/g,
        `http://127.0.0.1:${port}/vendor/Tone.js`));
    }
    r.writeHead(200, { 'Content-Type': TYPE[path.extname(f)] || 'application/octet-stream' });
    r.end(body);
  });
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  const base = 'http://127.0.0.1:' + server.address().port;

  const p2 = await page.context().newPage();
  const errs = [];
  p2.on('pageerror', e => errs.push(e.message));
  let 結果 = null, 応答 = null;
  try{
    const res = await p2.goto(base + '/', { waitUntil:'load', timeout:20000 });
    応答 = res.status();
    await p2.waitForFunction(() => typeof window.makeSong === 'function', null, { timeout:20000 });
    await p2.waitForTimeout(1200);
    結果 = await p2.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const b = document.getElementById('makeBtn')
        || [...document.querySelectorAll('button')].find(x => /この設定で作る/.test(x.textContent));
      b.click(); await wait(1200);
      document.getElementById('playBtn').click(); await wait(2000);
      const 鳴っている = Tone.Transport.state === 'started';
      try{ stopPlayback(); }catch(e){}
      return { 曲ができた:!!song, 鳴った:鳴っている,
               ボタン数:document.querySelectorAll('button').length };
    });
  }catch(e){
    結果 = { 落ちた: e.message.slice(0, 100) };
  }finally{
    await p2.close();
    server.close();
  }

  checks.push({ ok: 応答 === 200,
    label: `「/」を開くだけでアプリが出る（応答 ${応答}）`,
    info: 応答 === 200 ? 'index.html にしてあるので、URLは https://例.com/ だけで済む'
                       : 'index.html が無いか、置き場所が違う' });
  checks.push({ ok: !!(結果 && 結果.曲ができた && 結果.鳴った),
    label: '置いたフォルダの中で、本当に曲ができて鳴る',
    info: JSON.stringify(結果) });
  checks.push({ ok: errs.length === 0,
    label: '公開用でJSエラーが出ない',
    info: errs.slice(0, 3).join('\n      ') });

  checks.push(...説明書がWindowsで読めるか(root));
  return { checks };
}

/* 日本語の説明書が Windows で読めるか
   ------------------------------------------------------------
   zip を Windows で開いて説明書を読むと**文字化けしていた**。原因は2つ。

     ① BOM が無い
        UTF-8 で書いてあっても、先頭に印（EF BB BF）が無いと
        Windows のメモ帳や多くの日本語エディタは **Shift-JIS だと
        思い込んで**開く。日本語が全部化ける。
        HTML は <meta charset> で自分で名乗れるが、.txt には
        名乗る場所が無いので BOM を付けるしかない。

     ② 改行が LF だけ
        Windows の古いメモ帳は LF だけの改行を改行と見なさない。
        65行の説明書が**1行にべったり**表示される。

   「Linux で作って Windows で読む」ときの定番の落とし穴なので、
   組み立てたものを機械で見張る。

   ★ HTML と robots.txt には BOM を付けないこと。
     HTML は charset で名乗れるうえ、BOM があると先頭に見えない文字が
     入って表示が崩れることがある。robots.txt は BOM があると
     巡回側が1行目を読み損なう。 */
function 説明書がWindowsで読めるか(root){
  const BOM = Buffer.from([0xEF, 0xBB, 0xBF]);
  const 見る = [];
  const 集める = (dir) => {
    if(!fs.existsSync(dir)) return;
    fs.readdirSync(dir, { withFileTypes:true }).forEach(e => {
      const f = path.join(dir, e.name);
      if(e.isDirectory()) return 集める(f);
      if(e.name.endsWith('.txt')) 見る.push(f);
    });
  };
  ['public', path.join('dist', 'blogger'), path.join('dist', 'zip')]
    .forEach(d => 集める(path.join(root, d)));

  if(!見る.length){
    return [{ ok:true, label:'説明書は未組み立てのため飛ばした',
              info:'確かめるには先に `node build/make-dist.mjs` を実行してください' }];
  }
  /* 日本語を含むものだけが対象。robots.txt のような英字だけのものは別扱い */
  const 化ける = [], LFだけ = [], 一覧 = [];
  見る.forEach(f => {
    const b = fs.readFileSync(f);
    const 名 = path.relative(root, f);
    const bom = b.subarray(0, 3).equals(BOM);
    const body = bom ? b.subarray(3) : b;
    const t = body.toString('utf8');
    const 日本語 = /[぀-ヿ一-鿿]/.test(t);
    const crlf = (t.match(/\r\n/g) || []).length;
    const 単独 = (t.match(/\n/g) || []).length - crlf;
    if(!日本語){
      /* robots.txt などは BOM を**付けない**のが正しい */
      if(bom) 化ける.push(`${名}（英字だけなのに BOM が付いている）`);
      return;
    }
    一覧.push(`${path.basename(名)} ${bom ? 'BOM✓' : 'BOM✗'} CRLF${crlf}/LF${単独}`);
    if(!bom) 化ける.push(`${名}（BOM が無い → Shift-JIS と誤解されて化ける）`);
    if(単独 > 0) LFだけ.push(`${名}（LF だけの改行が ${単独}箇所 → 1行に見える）`);
  });

  return [
    { ok: 化ける.length === 0,
      label: `日本語の説明書に UTF-8 の印（BOM）が付いている（${一覧.length}個）`,
      info: 化ける.length ? 化ける.join('\n      ')
                          : 一覧.join(' / ') + '　／ 直す前は全部 BOM 無しで、Windows のメモ帳で化けていた' },
    { ok: LFだけ.length === 0,
      label: '説明書の改行が Windows の形（CRLF）になっている',
      info: LFだけ.length ? LFだけ.join('\n      ')
                          : '直す前は「はじめにお読みください」が LF だけで、1行にべったり出ていた' },
  ];
}
