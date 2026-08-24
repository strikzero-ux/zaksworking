/* 検査用のかんたんな配信サーバ。
   ------------------------------------------------------------
   ・追加のライブラリは使わない（Node に最初から入っている http だけ）。
   ・/app.html を求められたら本体の HTML を読み、
     Tone.js と lamejs の読み込み先を tests/vendor の控えに差し替える。
     ネットが無い所でも検査が通るようにするため。
     差し替えると中身のハッシュ（SRI）が合わなくなるので integrity は外す。
     ※ SRI の値そのものは cases/03-sri.mjs で別に確かめている。 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..', '..');
export const APP_FILE = path.join(ROOT, 'ZCNOVA_BGM_v5.6.html');
const VENDOR = path.join(ROOT, 'tests', 'vendor');

const TONE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/tone/14.8.49/Tone.js';
const LAME_CDN = 'https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js';

/* 本体の HTML を、検査用に書き換えて返す。
   keepFonts:true のときは字体の <link> を残す（⑬ 字体の待ちの検査で使う）。 */
export function appHtmlForTest(keepFonts){
  let s = fs.readFileSync(APP_FILE, 'utf8');
  s = s.replaceAll(TONE_CDN, '/vendor/Tone.js');
  s = s.replaceAll(LAME_CDN, '/vendor/lame.min.js');
  s = s.replace(/\s*integrity="sha384-[^"]*"/g, '');
  s = s.replace(/\s*s\.integrity\s*=\s*'sha384-[^']*';/g, '');
  /* 外部フォントは検査に関係が無く、ネットが無いと必ずエラーが出るので外す。
     これを残すと「起動時のJSエラー0件」の判定がネットの有無で揺れる。 */
  if(!keepFonts) s = s.replace(/<link[^>]+fonts\.(googleapis|gstatic)\.com[^>]*>/g, '');
  return s;
}

const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
               '.json':'application/json; charset=utf-8' };

export function startServer(port = 8977){
  const html = appHtmlForTest();
  const htmlWithFonts = appHtmlForTest(true);
  const server = http.createServer((req, res) => {
    const url = (req.url || '/').split('?')[0];
    if(url === '/' || url === '/app.html'){
      res.writeHead(200, { 'Content-Type': MIME['.html'] });
      res.end(html);
      return;
    }
    /* 字体の <link> を残したまま返す。⑬ が「字体が届かない環境でも
       画面がすぐ出るか」を確かめるのに使う。 */
    if(url === '/app-fonts.html'){
      res.writeHead(200, { 'Content-Type': MIME['.html'] });
      res.end(htmlWithFonts);
      return;
    }
    if(url.startsWith('/vendor/')){
      const name = path.basename(url);
      const file = path.join(VENDOR, name);
      if(fs.existsSync(file)){
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'text/plain' });
        res.end(fs.readFileSync(file));
        return;
      }
    }
    res.writeHead(404); res.end('not found');
  });
  return new Promise((ok, ng) => {
    server.on('error', ng);
    server.listen(port, '127.0.0.1', () => ok({
      url: `http://127.0.0.1:${port}/app.html`,
      close: () => new Promise(r => server.close(r)),
    }));
  });
}
