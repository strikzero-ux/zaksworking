/* ① 生成の健全性
   ------------------------------------------------------------
   全曲調 × 全拍子 × 小節数を回して、「そもそも曲として成立しているか」
   だけを見る。音楽の良し悪しは見ない。ここが落ちたら生成が壊れている。

   ・例外を投げない
   ・1音も入っていないフレーズが無い
   ・まるごと無音の小節が無い
   ・音名が壊れていない（NaN や undefined が音として入っていない）
   ・BPM・長さ・並びが数字として正しい　　　　　　　　　　　　　*/
export const name = '① 生成の健全性（全曲調 × 全拍子）';

export async function run({ page }){
  const r = await page.evaluate(() => {
    const NOTE = /^[A-G]#?-?\d+$/;
    const TRACKS = ['mel1','mel2','sub','bass','wind1','wind2'];
    const bad = [];
    let songs = 0, phrases = 0, bars = 0;
    const origMeter = {};
    MOODS.forEach(m => { origMeter[m.key] = m.meter; });

    try{
      Object.keys(METERS).forEach(meter => {
        MOODS.forEach(m => { m.meter = meter; });
        MOODS.forEach((m, mi) => {
          [2, 4, 8].forEach((barCount, bi) => {
            const seed = 1000 + mi * 37 + bi * 911;
            let sg;
            try{
              sg = makeSong(m.key, barCount, 'fam_random_all', 120, seed);
            }catch(e){
              bad.push(`${m.key}/${meter}/${barCount}小節: 例外 ${e.message}`);
              return;
            }
            songs++;
            const spb = stepsPerBar(sg);
            if(!(sg.bpm > 0)) bad.push(`${m.key}/${meter}: BPM が数字でない (${sg.bpm})`);
            if(!Array.isArray(sg.arrangement) || !sg.arrangement.length)
              bad.push(`${m.key}/${meter}: 並びが空`);
            sg.phrases.forEach((ph, pi) => {
              phrases++;
              if(!phraseHasNotes(ph)) bad.push(`${m.key}/${meter}/${barCount}小節: フレーズ${pi}(${ph.role}) に1音も無い`);
              TRACKS.forEach(t => {
                if(ph[t].length !== ph.bars * spb)
                  bad.push(`${m.key}/${meter}: ${t} の長さが合わない`);
                ph[t].forEach(v => {
                  if(v === null || v === undefined) return;
                  if(typeof v !== 'string' || !NOTE.test(v))
                    bad.push(`${m.key}/${meter}: ${t} に壊れた音 ${JSON.stringify(v)}`);
                });
              });
              for(let bar = 0; bar < ph.bars; bar++){
                bars++;
                let ev = 0;
                for(let k = 0; k < spb; k++){
                  const i = bar * spb + k;
                  TRACKS.forEach(t => { if(ph[t][i]) ev++; });
                  DRUM_LANES.forEach(d => { if(ph.drum[d.key][i]) ev++; });
                }
                if(ev === 0) bad.push(`${m.key}/${meter}/${barCount}小節: フレーズ${pi} の ${bar + 1}小節目が無音`);
              }
            });
          });
        });
      });
    } finally {
      MOODS.forEach(m => { m.meter = origMeter[m.key]; });
    }
    /* 同じ指摘が何百件も出ると読めないので、種類ごとに1件へまとめる */
    const uniq = [...new Set(bad)];
    return { songs, phrases, bars, 件数: bad.length, 例: uniq.slice(0, 12) };
  });

  return { checks: [{
    ok: r.件数 === 0,
    label: `${r.songs}曲 / ${r.phrases}フレーズ / ${r.bars}小節 に異常なし`,
    info: r.件数 === 0 ? '' : `${r.件数}件の異常:\n      - ` + r.例.join('\n      - '),
  }, ...(await 選んだ長さに届くか(page))] };
}

/* 選んだ長さに、ちゃんと届いているか
   ------------------------------------------------------------
   動画に合わせて長さを選ぶ人にとって、**短いのは実害**（末尾が無音になる）。
   曲はフレーズ単位で並べるので秒数ぴったりにはならず、少しの不足は許して
   いる（許さないと1フレーズ29秒の曲が30秒指定で58秒になる）。
   その「少し」が短い曲で効きすぎていた。実測1860曲で
   **15秒を指定して10.0秒**（3分の1不足）まで出ていた。
   いまは不足の上限を「5秒」「1フレーズの半分」「指定の1割」の
   いちばん小さいものにしてある。
     15秒指定 → 1.5秒まで ／ 30秒指定 → 3秒まで ／ 60秒以上 → 5秒まで

   ⚠️ 上限を秒数だけに戻すと、ここが落ちる。 */
async function 選んだ長さに届くか(page){
  const r = await page.evaluate(() => {
    const 秒一覧 = [15, 30, 60, 180], 小節 = [1, 2, 4, 8];
    let 全 = 0, 破り = 0, 最悪 = 0, 例 = null, 最長超過 = 0, 超過例 = null;
    小節.forEach(b => 秒一覧.forEach(t => {
      const 許す = Math.max(0.05, t * 0.1);      // 指定の1割まで（丸め誤差の逃げを少し）
      MOODS.forEach((m, i) => ['fam_full', 'fam_concert', 'fam_piano'].forEach((pm, j) => {
        let sg; try{ sg = makeSong(m.key, b, pm, t, 90000 + i * 131 + j * 17 + t + b * 7); }catch(e){ return; }
        const s = songSeconds(sg); 全++;
        const 不足 = t - s;
        if(不足 > 許す + 0.01){ 破り++; if(不足 > 最悪){ 最悪 = 不足; 例 = `${b}小節・${t}秒指定 ${m.key}×${pm} → ${s.toFixed(1)}秒`; } }
        if(s - t > 最長超過){ 最長超過 = s - t; 超過例 = `${b}小節・${t}秒指定 ${m.key}×${pm} → ${s.toFixed(1)}秒`; }
      }));
    }));
    return { 全, 破り, 最悪:+最悪.toFixed(1), 例, 最長超過:+最長超過.toFixed(1), 超過例 };
  });
  return [
    { ok: r.破り === 0,
      label: `選んだ長さに届く（${r.全}曲・不足は指定の1割まで）`,
      info: r.破り ? `${r.破り}曲が1割以上足りない。いちばん悪いもの: ${r.例}`
                   : '直す前は 15秒指定で10.0秒（3分の1不足）まで出ていた' },
    { ok: r.最長超過 <= 30.5,
      label: `長すぎにもならない（いちばん長くて +${r.最長超過}秒）`,
      info: `${r.超過例}　／ 8小節は1かたまりが大きいぶん振れる。秒数を合わせたい人には画面で1〜2小節をすすめている` },
  ];
}
