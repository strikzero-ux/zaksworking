/* ③ SRI（改ざん検知のハッシュ）が本物と合っているか
   ------------------------------------------------------------
   HTML に書いてある integrity の値と、tests/vendor に置いた
   配信物そのものの SHA-384 を突き合わせる。

   これが合わないと、ブラウザは読み込みを拒否して**アプリが起動しない**。
   ライブラリの版を上げてハッシュを直し忘れる事故は画面を開くまで
   気づけないので、ここで機械的に止める。

   ・控えのハッシュが HTML の中に書かれているか（＝正しい値が入っているか）
   ・HTML の中に、どの控えとも一致しないハッシュが残っていないか
     （＝版を上げたのに古い値が残っている、を捕まえる）
   の2方向から見る。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const name = '③ SRI ハッシュ（外部ライブラリ）';

const TARGETS = [
  { name: 'Tone.js', file: 'Tone.js',     needle: 'tone/14.8.49/Tone.js' },
  { name: 'lamejs',  file: 'lame.min.js', needle: 'lamejs@1.2.1/lame.min.js' },
];

export async function run({ root }){
  const html = fs.readFileSync(path.join(root, 'ZCNOVA_BGM_v5.6.html'), 'utf8');
  const checks = [];
  const wanted = new Set();

  TARGETS.forEach(t => {
    const bin = fs.readFileSync(path.join(root, 'tests', 'vendor', t.file));
    const want = 'sha384-' + crypto.createHash('sha384').update(bin).digest('base64');
    wanted.add(want);
    const urlOk = html.includes(t.needle);
    checks.push({
      ok: urlOk && html.includes(want),
      label: `${t.name} の integrity が配信物と一致`,
      info: !urlOk ? `HTML の中に ${t.needle} が見つからない`
          : html.includes(want) ? '' : `HTML に書くべき値: ${want}`,
    });
  });

  /* HTML に書かれている sha384 のうち、控えのどれとも合わないもの */
  const inHtml = [...new Set([...html.matchAll(/sha384-[A-Za-z0-9+/=]{40,}/g)].map(m => m[0]))];
  const stale = inHtml.filter(h => !wanted.has(h));
  checks.push({
    ok: stale.length === 0,
    label: `HTML に古い／余分なハッシュが残っていない（${inHtml.length}個を確認）`,
    info: stale.length ? '合致しない値: ' + stale.join(' , ') : '',
  });

  return { checks };
}
