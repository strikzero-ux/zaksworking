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
  }] };
}
