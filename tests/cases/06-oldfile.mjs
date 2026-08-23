/* ⑥ 昔の版で保存した曲がそのまま開けるか
   ------------------------------------------------------------
   【なぜこの検査が要るか】
   生成のしくみを直すと、**同じ曲番号を入れ直しても以前と同じ曲は出ない**。
   実際この作業中に3回そうなっている（伴奏の変化 / ベースの乱数 / 進行の
   選び方のバグ修正）。曲番号は「作り方」への入り口なので、作り方が変われば
   出てくる曲も変わる ── これは避けられない。

   だから **気に入った曲を残す手段は .json で保存すること** になる。
   .json には音符そのものが入っていて、読み込みは作り直しをしない。
   ここが壊れたら「保存したのに別の曲になった」という最悪の事故になるので、
   昔の版で作った実物のファイルを控えておいて毎回確かめる。

   fixtures/old-songs.json は
     ・最初の版 (38d9ed9)
     ・進行のバグを直す前 (62dc59e)
   の2つの版で実際に作って書き出したものをそのまま入れてある。 */
import fs from 'node:fs';
import path from 'node:path';

export const name = '⑥ 昔の版で保存した曲が開けるか';

export async function run({ page, root }){
  const file = path.join(root, 'tests', 'fixtures', 'old-songs.json');
  if(!fs.existsSync(file)){
    return { checks: [{ ok: false, label: '控えのファイルが無い', info: file }] };
  }
  const olds = JSON.parse(fs.readFileSync(file, 'utf8'));

  const r = await page.evaluate((olds) => {
    return olds.map(o => {
      const res = { 版: o.版, 曲調: o.曲調, 曲番号: o.曲番号 };
      const src = JSON.parse(o.json);
      /* 読み込みボタンと同じ道を通す */
      let d;
      try{ d = zcUnpackSong(JSON.parse(o.json)); }
      catch(e){ res.読める = '例外: ' + e.message; return res; }
      const 形 = d && typeof d === 'object' && d.phrases && d.tracks && Array.isArray(d.phrases);
      res.読める = 形 ? 'OK' : '形式ちがい';

      /* 音符が1つ残らず同じか */
      const sig = sg => JSON.stringify(sg.phrases.map(p =>
        [p.mel1, p.mel2, p.sub, p.bass, p.wind1, p.wind2, p.chord, p.inv, p.drum, p.se]));
      res.音符が同じ = 形 && sig(d) === sig(src);

      /* 中身が空っぽになっていないか（形だけ通って無音、を防ぐ） */
      res.音が入っている = 形 && d.phrases.some(p => phraseHasNotes(p));

      /* 昔のファイルは「ゆらぎ」を持たない。いつもどおり扱いになること。 */
      res.ゆらぎ = (d && d.spread) ? d.spread : '(無し→いつもどおり)';
      res.ゆらぎが効かない = !d.spread;

      /* 鳴らすのに要る型が、いまの版にも残っているか
         （伴奏の型名を消した／改名したときに気づけるようにする） */
      const CP = chordPatterns(d), BP = bassPatterns(d);
      res.伴奏の型がある = !!CP[d.cpat];
      res.音階がある = !!SCALES[d.scale];
      res.曲調がある = MOODS.some(m => m.key === d.moodKey);
      return res;
    });
  }, olds);

  const checks = [];
  r.forEach(x => {
    const ok = x.読める === 'OK' && x.音符が同じ && x.音が入っている
            && x.ゆらぎが効かない && x.伴奏の型がある && x.音階がある && x.曲調がある;
    const ng = [];
    if(x.読める !== 'OK') ng.push('読めない: ' + x.読める);
    if(!x.音符が同じ) ng.push('★音符が変わっている');
    if(!x.音が入っている) ng.push('音が1つも無い');
    if(!x.ゆらぎが効かない) ng.push('ゆらぎ=' + x.ゆらぎ + '（昔のファイルには効かせない約束）');
    if(!x.伴奏の型がある) ng.push('伴奏の型が今の版に無い');
    if(!x.音階がある) ng.push('音階が今の版に無い');
    if(!x.曲調がある) ng.push('曲調が今の版に無い');
    checks.push({ ok, label: `${x.版} の「${x.曲調}」（曲番号${x.曲番号}）がそのまま開ける`,
                  info: ng.join(' / ') });
  });
  return { checks };
}
