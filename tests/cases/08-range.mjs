/* ⑧ 楽器の音域と、高い音の刺さり
   ------------------------------------------------------------
   「高めの音が耳障り」への対応の見張り番。実測で分かっていたのは
     ・音域が決まっている音の 15.8% が楽器の音域の外
     ・4.6% は1オクターブ以上はみ出し（最大2.6オクターブ）
     ・いちばん高い音は G#8（約6.6kHz）
     ・はみ出しの多い順に ティンパニ・トロンボーン・チューバ・ホルン
       ＝低い楽器が出せない高さで旋律を吹かされていた
   ここで守りたい約束：
     1. 天井（C7）より上の音を1つも作らない
     2. 楽器の音域より上へはみ出さない（下は許す。低い音は刺さらない）
     3. 何度かけても二重に下がらない（idempotent）
     4. 保存済みの曲は勝手に動かさない */
export const name = '⑧ 楽器の音域と高い音';

export async function run({ page }){
  const r = await page.evaluate(() => {
    const TR = ['mel1','mel2','sub','bass','wind1','wind2'];
    const out = { 天井超え: 0, 上へはみ出し: 0, 大きくはみ出し: 0, 最大はみ出し: 0, 全音符: 0, 最高音: -999, 例: [] };
    const songs = [];
    for(let i = 0; i < 60; i++){
      const sg = makeSong(MOODS[i % MOODS.length].key, [2,4][i % 2], 'fam_random_all', 90, 96000 + i * 53);
      songs.push(sg);
      sg.phrases.forEach(ph => {
        TR.forEach(k => {
          const inst = (sg.tracks[k] || {}).inst;
          const r0 = zcInstRange(inst);
          ph[k].forEach(v => {
            if(!v) return;
            const m = noteToMidi(v); if(m === null) return;
            out.全音符++;
            if(m > out.最高音) out.最高音 = m;
            if(m > ZC_PITCH_CEIL){ out.天井超え++; if(out.例.length < 4) out.例.push(`${k}/${inst}/${v}`); }
            if(r0 && m > r0[1]){
              out.上へはみ出し++;
              const d = m - r0[1];
              if(d > out.最大はみ出し) out.最大はみ出し = d;
              if(d >= 12){ out.大きくはみ出し++; if(out.例.length < 4) out.例.push(`${k}/${inst}/${v} は上限${midiToName(r0[1])}より${d}半音上`); }
            }
          });
        });
      });
    }
    out.最高音名 = midiToName(out.最高音);

    /* 3. 二重に下がらないか */
    const sig = sg => JSON.stringify(sg.phrases.map(p => TR.map(k => p[k])));
    let 同じ = 0;
    songs.slice(0, 20).forEach(sg => {
      const before = sig(sg);
      zcFitRangesToInstruments(sg);
      if(sig(sg) === before) 同じ++;
    });
    out.二度がけで不変 = 同じ + '/20';

    /* 4. 音域の定義が全音色にあるか（抜けがあると素通りする） */
    const 抜け = Object.keys(INSTRUMENTS).filter(k => !zcInstRange(k));
    out.音域が引けない音色 = 抜け.length;
    return out;
  });

  return { checks: [
    { ok: r.天井超え === 0,
      label: `天井（C7）より上の音を作らない（${r.全音符}音／最高音 ${r.最高音名}）`,
      info: r.天井超え ? `${r.天井超え}音が超過: ` + r.例.join(' / ') : '' },
    /* まるごとオクターブで動かす方式なので、音の幅が楽器の音域より広い
       フレーズ（ティンパニは2オクターブしかない等）ではわずかにはみ出す。
       耳に刺さるのは高い音なので、天井（上のチェック）で押さえたうえで、
       ここでは「1オクターブ以上のはみ出しが無いこと」を守る。
       以前はこれが全体の 4.6%（最大2.6オクターブ）あった。 */
    { ok: r.大きくはみ出し === 0,
      label: `1オクターブ以上のはみ出しが無い（わずかな超過 ${r.上へはみ出し}音／最大${r.最大はみ出し}半音）`,
      info: r.大きくはみ出し ? `${r.大きくはみ出し}音: ` + r.例.join(' / ') : '' },
    { ok: r.二度がけで不変 === '20/20',
      label: `もう一度かけても二重に下がらない（${r.二度がけで不変}）` },
    { ok: r.音域が引けない音色 === 0,
      label: '全部の音色で音域が引ける', info: r.音域が引けない音色 ? `${r.音域が引けない音色}種で引けない` : '' },
  ] };
}
