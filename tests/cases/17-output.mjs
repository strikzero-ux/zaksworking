/* ⑰ 書き出したファイルの音量が使える範囲か
   ------------------------------------------------------------
   音色の音量・音域・揺れをいじると、気づかないうちに
     ・全体が割れる（ピークが1.0に張りつく → バリバリ言う）
     ・逆に小さくなりすぎて、動画に乗せると聞こえない
     ・特定の編成だけ無音になる
   のどれかが起きる。耳で気づく前に数字で止める。

   動画BGMとして扱いやすいのは、ピークが 1.0 に触れず（0.95以下）、
   実効値が 0.05〜0.30 あたり。編成ごとに差が出るのは当たり前なので、
   「範囲に収まっているか」だけを見る。 */
export const name = '⑰ 書き出しの音量';

export async function run({ page }){
  const r = await page.evaluate(async () => {
    const out = [];
    /* 計算に時間がかかるので、性格のいちばん違う3つ・15秒に絞る。
       （6編成×30秒だと3分かかり、検査一式が倍以上になる） */
    const 編成 = [['fam_random_all','完全ランダム'], ['fullband','フルバンド'],
                  ['fam_orchestra','オーケストラ']];
    for(const [pm, 名] of 編成){
      pickPM = pm; pickBars = 1; pickSec = 15; pickMood = 'battle';
      makeNewSong(20260824);
      const res = await renderSong(song, null);
      const d = res.channels[0];
      let peak = 0, sq = 0, 無音 = 0;
      for(let i = 0; i < d.length; i++){
        const a = Math.abs(d[i]);
        if(a > peak) peak = a;
        sq += d[i]*d[i];
        if(a < 0.0005) 無音++;
      }
      out.push({ 編成:名, ピーク:+peak.toFixed(3), 実効値:+Math.sqrt(sq/d.length).toFixed(4),
                 無音:+(無音/d.length*100).toFixed(1) });
    }
    return out;
  });
  const 一覧 = r.map(x => `${x.編成} ピーク${x.ピーク}・実効${x.実効値}`).join(' / ');
  const 割れ   = r.filter(x => x.ピーク > 0.95).map(x => `${x.編成}(${x.ピーク})`);
  const 小さい = r.filter(x => x.実効値 < 0.05).map(x => `${x.編成}(${x.実効値})`);
  const 大きい = r.filter(x => x.実効値 > 0.30).map(x => `${x.編成}(${x.実効値})`);
  const 無音   = r.filter(x => x.無音 > 20).map(x => `${x.編成}(${x.無音}%)`);
  return { checks: [
    { ok: 割れ.length === 0, label: `音が割れていない（ピークが0.95以下）`,
      info: 割れ.length ? '1.0に近い: ' + 割れ.join(' / ') : 一覧 },
    { ok: 小さい.length === 0 && 大きい.length === 0,
      label: '動画に乗せて使える音量（実効値 0.05〜0.30）',
      info: [...小さい.map(s => '小さすぎ ' + s), ...大きい.map(s => '大きすぎ ' + s)].join(' / ') },
    { ok: 無音.length === 0, label: '無音になっている編成が無い',
      info: 無音.join(' / ') },
  ] };
}
