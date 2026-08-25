/* ⑲ 「◯◯だけ」の伴奏
   ------------------------------------------------------------
   使う人から「各楽器だけの項目に、ピアノっぽい伴奏が入る」と指摘があった。
   調べると **ピアノは1音も混ざっていなかった**（40曲すべて、伴奏も
   その楽器自身）。原因は音色ではなく、伴奏の置き場所と書き方だった。

       楽器          旋律の高さ  伴奏の高さ
       サックスだけ     65.4       62.0
       フルートだけ     74.4       62.0   ← 12半音も下
       大太鼓だけ       45.9       62.0   ← 逆に上・そもそも音程が無い

   和音は degreeNotes(deg, song, 3, ...) とオクターブ3で作られていて、
   **楽器を一度も見ていなかった**。旋律は上・和音は真ん中に固定＝
   「右手でメロディ・左手で和音」という鍵盤の書き方そのものなので、
   音色が何であれ耳は「ピアノの譜面だ」と判断する。

   ここで守る約束：
     1. 伴奏はその楽器で鳴る（ピアノが混ざらない）
     2. 伴奏の高さが楽器ごとに変わる（全楽器同じ高さに固定されない）
     3. 息・弓の楽器の伴奏は2声（1人1音しか出せないので二重奏になる）
     4. ほぼ音程の無い打楽器には和音を鳴らさない
     5. 「旋律だけ」を選べば本当に旋律だけになる
     6. ほかの編成には一切影響しない
   ============================================================ */
export const name = '⑲ 「◯◯だけ」の伴奏';

export async function run({ page }){
  const r = await page.evaluate(() => {
    const 測る = (pmKey, accomp) => {
      const p = PLAY_MODES.find(x => x.key === pmKey);
      if(!p || !p.solo) return null;
      const 旋律 = [], 伴奏 = [];
      let 曲 = 0, 伴奏ON = 0, ピアノ混入 = 0, はみ出し = 0, 全和音 = 0;
      const 声数 = new Set();
      for(let i = 0; i < 20; i++){
        pickSoloAccomp = accomp;
        const sg = makeSong(MOODS[i % MOODS.length].key, 2, pmKey, 60, 72000 + i * 77);
        曲++;
        const t = sg.tracks.chord;
        if(!(t && t.on)) continue;
        伴奏ON++;
        if(t.inst !== p.solo) ピアノ混入++;          /* その楽器以外が伴奏に来ていないか */
        声数.add(sg.chordTones || 3);
        const rg = zcInstRange(t.inst);
        const 素直 = (sg.moodKey === 'fantasy' || sg.moodKey === 'transparent');
        sg.arrangement.forEach(pi => {
          const ph = sg.phrases[pi]; if(!ph) return;
          (ph.mel1 || []).forEach(n => { if(n){ const m = noteToMidi(n); if(m !== null) 旋律.push(m); } });
          (ph.chord || []).forEach((d, b) => {
            if(d === null || d === undefined) return;
            try{
              let ns = degreeNotes(d, sg, 3, sg.chordTones || 3);
              if(ph.keyShift) ns = ns.map(nm => zcTranspose(nm, ph.keyShift));
              if(ph.inv && !素直) ns = zcInvertNotes(ns, ph.inv[b] || 0);
              const sh = (ph.chordOct && ph.chordOct[b]) || 0;
              const ms = ns.map(noteToMidi).filter(x => x !== null).map(x => x + sh);
              if(!ms.length) return;
              全和音++;
              伴奏.push(ms.reduce((a, x) => a + x, 0) / ms.length);
              if(rg && (Math.min(...ms) < rg[0] || Math.max(...ms) > rg[1])) はみ出し++;
            }catch(e){}
          });
        });
      }
      const 平均 = a => a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : null;
      return { 曲, 伴奏ON, ピアノ混入, 声数:[...声数],
               旋律:平均(旋律), 伴奏:平均(伴奏),
               はみ出し:全和音 ? +(はみ出し / 全和音 * 100).toFixed(1) : 0 };
    };
    const 元 = pickSoloAccomp;
    const out = { あり:{}, なし:{} };
    ['sax','trumpet','flute','clarinet','piano','harp','bassDrum','cymbal'].forEach(k => {
      const a = 測る(k, 'inst'); if(a) out.あり[(PLAY_MODES.find(x => x.key === k) || {}).label || k] = a;
    });
    ['sax','piano'].forEach(k => {
      const b = 測る(k, 'off'); if(b) out.なし[(PLAY_MODES.find(x => x.key === k) || {}).label || k] = b;
    });
    /* 6. ほかの編成に影響していないこと（伴奏の声数が据え置き） */
    pickSoloAccomp = 'inst';
    const よそ = {};
    ['fam_concert','fam_orchestra','random'].forEach(pm => {
      const s = new Set();
      for(let i = 0; i < 10; i++){
        const sg = makeSong(MOODS[i % MOODS.length].key, 2, pm, 60, 73000 + i * 61);
        s.add(sg.chordTones || 3);
      }
      よそ[pm] = [...s].sort();
    });
    pickSoloAccomp = 元;
    return { ...out, よそ };
  });

  const あり = Object.entries(r.あり);
  const 高さ = あり.filter(([, v]) => v.伴奏 !== null).map(([, v]) => v.伴奏);
  const 幅 = 高さ.length ? +(Math.max(...高さ) - Math.min(...高さ)).toFixed(1) : 0;
  const 混入 = あり.filter(([, v]) => v.ピアノ混入 > 0).map(([k, v]) => `${k} ${v.ピアノ混入}曲`);
  const 打楽器 = ['大太鼓だけ','シンバルだけ'].map(k => r.あり[k]).filter(Boolean);
  const 単音 = ['サックスだけ','トランペットだけ','フルートだけ','クラリネットだけ']
    .map(k => r.あり[k]).filter(Boolean);
  const 声数悪い = 単音.filter(v => v.声数.some(n => n > 2))
    .length;
  const 一覧 = あり.map(([k, v]) =>
    `${k} 旋律${v.旋律}/伴奏${v.伴奏 === null ? '無し' : v.伴奏}`).join(' / ');

  return { checks: [
    { ok: 混入.length === 0,
      label: '伴奏もその楽器で鳴る（ほかの楽器が混ざらない）',
      info: 混入.length ? 混入.join(' / ') : '「ピアノっぽい」と言われたが、ピアノは元から1音も入っていない' },
    { ok: 幅 >= 4,
      label: `伴奏の高さが楽器ごとに変わる（いちばん高い所と低い所で ${幅}半音）`,
      info: 幅 >= 4 ? 一覧 + '　／ 直す前は全楽器そろって 62.0（動かなかった）'
                    : 一覧 + '　※全楽器で同じ高さ＝鍵盤の書き方に戻っていないか' },
    { ok: 声数悪い === 0,
      label: '息・弓の楽器の伴奏は2声（1人1音なので二重奏になる）',
      info: 単音.map((v, i) => `${['サックス','トランペット','フルート','クラリネット'][i]} ${v.声数.join(',')}声`).join(' / ') },
    { ok: 打楽器.length > 0 && 打楽器.every(v => v.伴奏ON === 0),
      label: 'ほぼ音程の無い打楽器には和音を鳴らさない',
      info: 打楽器.map((v, i) => `${['大太鼓','シンバル'][i]} ${v.伴奏ON}/${v.曲}曲`).join(' / ') },
    { ok: Object.values(r.なし).every(v => v.伴奏ON === 0),
      label: '「旋律だけ」を選べば本当に旋律だけになる',
      info: Object.entries(r.なし).map(([k, v]) => `${k} 伴奏 ${v.伴奏ON}/${v.曲}曲`).join(' / ') },
    { ok: Object.values(r.よそ).every(a => a.some(n => n >= 3)),
      label: 'ほかの編成の伴奏は据え置き（2声に減らされていない）',
      info: Object.entries(r.よそ).map(([k, v]) => `${k} ${v.join(',')}声`).join(' / ') },
  ] };
}
