/* ⑩ 曲の一部分だけの書き出し
   ------------------------------------------------------------
   動画に使う人が欲しいのは「イントロだけ」「サビだけ」であって、
   パートごとの書き出し（DAW向け）ではない、という指摘への対応。
   守りたい約束：
     1. 選べる項目が細かすぎない（4秒の項目が40個並ばない）
     2. 切り出しても曲の並びが元に戻る（曲を壊さない）
     3. 切り出した部分どうしの音量がそろう（つないでも段差にならない）
     4. 端から端までが全部いずれかの項目に入っている（抜けが無い） */
export const name = '⑩ 部分だけの書き出し';

export async function run({ page }){
  const r = await page.evaluate(async () => {
    const out = { 曲: [] };
    for(const [mood, sec] of [['battle', 180], ['calm', 60], ['classic', 300]]){
      song = makeSong(mood, 2, 'fam_random_all', sec, 60600);
      const rs = zcSectionRanges(song);
      /* 4. 抜けと重なりが無いか */
      let ok = rs.length > 0 && rs[0].from === 0
            && rs[rs.length - 1].to === song.arrangement.length - 1;
      for(let i = 1; i < rs.length; i++) if(rs[i].from !== rs[i - 1].to + 1) ok = false;
      out.曲.push({ 曲調: mood, 枠: song.arrangement.length, 項目: rs.length,
        いちばん短い項目の秒: Math.round(Math.min(...rs.map(x => x.sec))),
        すきま無し: ok });
    }
    /* 2・3. 実際に切り出す */
    song = makeSong('battle', 2, 'fam_random_all', 90, 60600);
    const rs = zcSectionRanges(song);
    const 並び前 = song.arrangement.slice().join(',');
    const rms = res => { let s = 0, n = 0;
      res.channels.forEach(ch => { for(let i = 0; i < ch.length; i++){ s += ch[i] * ch[i]; n++; } });
      return Math.sqrt(s / n); };
    const a = await renderSection(song, rs[0].from, rs[0].to, () => {});
    const c = await renderSection(song, rs[1].from, rs[1].to, () => {});
    out.並びが戻る = song.arrangement.join(',') === 並び前;
    out.音量の差 = Math.round(Math.abs(rms(a) - rms(c)) / Math.max(1e-6, rms(a)) * 100);
    out.秒数 = [ +(a.channels[0].length / a.sampleRate).toFixed(1),
                 +(c.channels[0].length / c.sampleRate).toFixed(1) ];
    return out;
  });

  const checks = [];
  r.曲.forEach(x => {
    checks.push({ ok: x.すきま無し && x.項目 <= 20 && x.いちばん短い項目の秒 >= 4,
      label: `${x.曲調}：${x.枠}枠が${x.項目}項目にまとまる（最短${x.いちばん短い項目の秒}秒・すきま無し）`,
      info: x.すきま無し ? '' : '★項目のあいだに抜けか重なりがある' });
  });
  checks.push({ ok: r.並びが戻る, label: '切り出したあと、曲の並びが元に戻る' });
  checks.push({ ok: r.音量の差 <= 25,
    label: `切り出した部分どうしの音量がそろう（差 ${r.音量の差}%）` });
  checks.push({ ok: r.秒数.every(s => s > 1), label: `中身のある音が出る（${r.秒数.join('秒 / ')}秒）` });
  return { checks };
}
