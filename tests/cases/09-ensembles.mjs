/* ⑨ 編成の中身（フルバンド／吹奏楽／オーケストラ）
   ------------------------------------------------------------
   使う人が「この編成ならこの楽器が鳴るはず」と思っている中身を守る。
   ここが崩れると「サックスが出ない」「吹奏楽なのにドラムセットが鳴る」
   といった、聴かないと気づけない形で壊れる。

     フルバンド … ジャズ寄り。ピアノ・ギター・ウッドベース・ドラムに
                  **サックスとトランペットが必ず乗る**
     吹奏楽     … 木管・金管・打楽器のみ。**ドラムセットは鳴らさない**
     オーケストラ… ピアノ・木管・金管・打楽器・弦楽器がそろう */
export const name = '⑨ 編成の中身';

export async function run({ page }){
  const r = await page.evaluate(() => {
    const 集める = (pm, n) => {
      const 使われた = {}; let 曲 = 0, ドラムON = 0, 無音 = 0, 全フレーズ = 0;
      for(let i = 0; i < n; i++){
        const sg = makeSong(MOODS[i % MOODS.length].key, 2, pm, 60, 41000 + i * 71);
        曲++;
        if(sg.tracks.drum && sg.tracks.drum.on) ドラムON++;
        /* 同じ音色が2つのトラックに入ることがあるので、
           「その曲で鳴ったか」を曲ごとに1回だけ数える。 */
        const 曲で鳴った = new Set();
        ['mel1','mel2','sub','chord','bass','wind1','wind2'].forEach(k => {
          const t = sg.tracks[k]; if(!t || !t.on || !t.inst) return;
          if(sg.phrases.some(ph => (ph[k] || []).some(v => v))) 曲で鳴った.add(t.inst);
        });
        曲で鳴った.forEach(inst => {
          使われた[inst] = 使われた[inst] || { 鳴った:0 };
          使われた[inst].鳴った++;
        });
        sg.arrangement.forEach(pi => {
          const ph = sg.phrases[pi]; if(!ph) return; 全フレーズ++;
          let c = 0;
          ['mel1','mel2','sub','bass','wind1','wind2'].forEach(k => {
            if(sg.tracks[k] && sg.tracks[k].on) c += (ph[k] || []).filter(v => v).length; });
          if(sg.tracks.chord && sg.tracks.chord.on) c += ph.chord.filter(v => v !== null && v !== undefined).length;
          if(sg.tracks.drum && sg.tracks.drum.on) DRUM_LANES.forEach(d => { c += (ph.drum[d.key] || []).filter(Boolean).length; });
          if(c === 0) 無音++;
        });
      }
      return { 曲, ドラムON, 無音, 全フレーズ, 使われた };
    };
    return { full: 集める('fam_full', 40), concert: 集める('fam_concert', 40), orch: 集める('fam_orchestra', 40) };
  });

  const 鳴った = (d, k) => (d.使われた[k] || {}).鳴った || 0;
  const あるもの = d => Object.keys(d.使われた).filter(k => d.使われた[k].鳴った > 0);
  const checks = [];

  /* フルバンド */
  checks.push({ ok: 鳴った(r.full, 'sax') === r.full.曲 && 鳴った(r.full, 'trumpet') === r.full.曲,
    label: `フルバンド：サックスとトランペットが全曲で鳴る（サックス ${鳴った(r.full,'sax')}/${r.full.曲}・トランペット ${鳴った(r.full,'trumpet')}/${r.full.曲}）` });
  checks.push({ ok: 鳴った(r.full, 'piano') > 0 && (鳴った(r.full,'contrabassPizz') + 鳴った(r.full,'bassString')) >= r.full.曲 && r.full.ドラムON === r.full.曲,
    label: `フルバンド：ピアノ・低音・ドラムがそろう（ピアノ ${鳴った(r.full,'piano')}曲／ドラム ${r.full.ドラムON}/${r.full.曲}）` });

  /* 吹奏楽 */
  const 打楽器 = ['timpani','xylophone','glockenspiel'];
  const 木管 = ['flute','clarinet','oboe','piccolo','sax','bassoon'];
  const 金管 = ['trumpet','horn','trombone','brass','tuba'];
  checks.push({ ok: r.concert.ドラムON === 0,
    label: `吹奏楽：ドラムセットを鳴らさない（${r.concert.ドラムON}/${r.concert.曲}曲）` });
  checks.push({ ok: 打楽器.some(k => 鳴った(r.concert,k) > 0) && 木管.some(k => 鳴った(r.concert,k) > 0) && 金管.some(k => 鳴った(r.concert,k) > 0),
    label: '吹奏楽：木管・金管・打楽器がそろう',
    info: '鳴った楽器: ' + あるもの(r.concert).join(' ') });
  checks.push({ ok: r.concert.無音 === 0,
    label: `吹奏楽：ドラムを外しても無音のフレーズが出ない（${r.concert.無音}/${r.concert.全フレーズ}）` });

  /* オーケストラ */
  const 弦 = ['violin','viola','cello','strings','contrabassArco','harp'];
  checks.push({ ok: 鳴った(r.orch,'piano') > 0 && 弦.some(k => 鳴った(r.orch,k) > 0)
             && 木管.some(k => 鳴った(r.orch,k) > 0) && 金管.some(k => 鳴った(r.orch,k) > 0)
             && 打楽器.some(k => 鳴った(r.orch,k) > 0),
    label: 'オーケストラ：ピアノ・弦楽器・木管・金管・打楽器がそろう',
    info: '鳴った楽器: ' + あるもの(r.orch).join(' ') });

  return { checks };
}
