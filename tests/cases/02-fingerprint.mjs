/* ② 指紋（前と同じ曲が出るか）
   ------------------------------------------------------------
   決まった曲番号で作った曲のパートごとの指紋を fixtures に控えておき、
   次からはそれと突き合わせる。
   「曲調Aを直したら曲調Bが変わってしまった」を機械的に見つけるのが目的。

   ★ 変わったこと自体は失敗ではない。狙って変えたなら控えを更新する：
        ZC_UPDATE=1 node tests/run.mjs
      更新したときは、どのパートがなぜ変わるのかを必ずコミット文に書く。

   パートを分けて指紋を取るのが要点。たとえば「伴奏だけ変えたつもりが
   旋律まで変わっていた」という取りこぼしは、まとめて1つの指紋にすると
   見えない（実際にそれで乱数のズレを1度見落としている）。 */
import fs from 'node:fs';
import path from 'node:path';

export const name = '② 指紋（意図しない変化の検出）';

export async function run({ page, root }){
  const file = path.join(root, 'tests', 'fixtures', 'fingerprint.json');
  const now = await page.evaluate(() => {
    /* 文字列を32bitの数へ潰す（FNV-1a）。控えを小さく保つため。 */
    const h32 = (s) => {
      let h = 0x811c9dc5;
      for(let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
      return (h >>> 0).toString(16).padStart(8, '0');
    };
    const out = {};
    const MODES = ['fam_random_all','band','fullband','brass','woodwind','strings','orchestra','piano'];
    MOODS.forEach((m, mi) => {
      [2, 4].forEach((barCount, bi) => {
        const seed = 20260823 + mi * 1013 + bi * 7;
        const sg = makeSong(m.key, barCount, MODES[(mi + bi) % MODES.length], 150, seed);
        const part = (f) => h32(sg.phrases.map(f).join('|'));
        out[`${m.key}/${barCount}`] = {
          設定:  h32(JSON.stringify([sg.key, sg.scale, sg.bpm, sg.cpat, sg.melStyle, sg.arrange, sg.meter, sg.arrangement])),
          旋律1: part(p => JSON.stringify(p.mel1)),
          旋律2: part(p => JSON.stringify(p.mel2)),
          サブ:  part(p => JSON.stringify(p.sub)),
          管:    part(p => JSON.stringify([p.wind1, p.wind2])),
          進行:  part(p => JSON.stringify([p.chord, p.inv, p.acc.chord])),
          ベース: part(p => JSON.stringify(p.bass)),
          ドラム: part(p => JSON.stringify(p.drum)),
          効果音: part(p => JSON.stringify(p.se)),
        };
      });
    });
    return out;
  });

  const update = process.env.ZC_UPDATE === '1';
  if(!fs.existsSync(file) || update){
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(now, null, 1) + '\n');
    return { checks: [{ ok: true, label: `控えを書き出しました（${Object.keys(now).length}件）`,
      info: update ? '※ ZC_UPDATE=1 で更新したので、この回は比較していません' : '※ 控えが無かったので新規作成しました' }] };
  }

  const before = JSON.parse(fs.readFileSync(file, 'utf8'));
  const diffs = [];
  const parts = {};
  Object.keys(now).forEach(id => {
    const a = before[id], c = now[id];
    if(!a){ diffs.push(`${id}: 控えに無い（曲調が増えた？）`); return; }
    Object.keys(c).forEach(k => {
      if(a[k] !== c[k]){ diffs.push(`${id} の ${k}`); parts[k] = (parts[k] || 0) + 1; }
    });
  });
  Object.keys(before).forEach(id => { if(!now[id]) diffs.push(`${id}: 今回作られなかった（曲調が減った？）`); });

  const total = Object.keys(now).length;
  const sum = Object.entries(parts).map(([k, v]) => `${k}×${v}`).join(' / ');
  return { checks: [{
    ok: diffs.length === 0,
    label: `${total}曲 × 9項目 が控えと一致`,
    info: diffs.length === 0 ? '' :
      `${diffs.length}箇所が変化（${sum}）\n      - ` + diffs.slice(0, 15).join('\n      - ') +
      (diffs.length > 15 ? `\n      - …ほか${diffs.length - 15}件` : '') +
      '\n      狙った変更なら ZC_UPDATE=1 node tests/run.mjs で控えを更新',
  }] };
}
