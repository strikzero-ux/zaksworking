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

  /* オーケストラ
     ------------------------------------------------------------
     交響楽団の常設パートにピアノは無い（曲が指定したときだけ加わる）。
     前の版では主役側と伴奏の候補にピアノが入っていて、実測40曲中25曲で
     鳴っていた。ピアノは編成「ピアノ」「フルバンド」の担当。 */
  const 弦 = ['violin','viola','cello','strings','contrabassArco','harp'];
  checks.push({ ok: 弦.some(k => 鳴った(r.orch,k) > 0)
             && 木管.some(k => 鳴った(r.orch,k) > 0) && 金管.some(k => 鳴った(r.orch,k) > 0)
             && 打楽器.some(k => 鳴った(r.orch,k) > 0),
    label: 'オーケストラ：弦楽器・木管・金管・打楽器がそろう',
    info: '鳴った楽器: ' + あるもの(r.orch).join(' ') });
  checks.push({ ok: 鳴った(r.orch,'piano') === 0,
    label: `オーケストラ：ピアノが入らない（${鳴った(r.orch,'piano')}/${r.orch.曲}曲）`,
    info: '直す前は 40曲中25曲でピアノが鳴っていた' });

  /* 伴奏の形が、鳴らす楽器に合っているか
     ------------------------------------------------------------
     伴奏の型は曲調だけで決まっていて、それを誰が鳴らすかを見ていなかった。
     実測（7編成×60曲）でどの編成でも型の出方はまったく同じ・刻む形80%。
     金管セクションがギターのようにかき鳴らし、16分でアルペジオを走らせる
     譜面になっていたため、音色が何であれ「ピアノの伴奏を別の音で鳴らして
     いる」ようにしか聞こえなかった。
     息で吹く・弓で擦る楽器に無理な形が残っていないことを見る。
       ・16分で刻み続ける … 息が続かない／弓が返しきれない
       ・かき鳴らし(strum)  … 弦をはじく動作そのもの
       ・走るアルペジオ      … 鍵盤・ハープの形
     4分の刻み・裏打ち・ワルツはそのまま残す（管も弦もふつうに吹く形）。 */
  const 伴奏 = await page.evaluate(() => {
    const 息弓 = new Set(['木管','金管','リード','弦（擦る）','弦（のばす）']);
    const 対象 = ['fam_concert','fam_orchestra','fam_bowedStrings','sax','flute','clarinet','accordion'];
    const 据置 = ['fam_piano','fam_guitar','fam_band','fam_full','piano'];
    const 数える = (list, 息弓だけ) => {
      let 曲 = 0, 対象曲 = 0, 全ph = 0, 無理 = 0;
      const 例 = [];
      list.forEach(pm => {
        for(let i = 0; i < 60; i++){
          let sg; try{ sg = makeSong(MOODS[i % MOODS.length].key, 2, pm, 60, 41000 + i * 71); }catch(e){ continue; }
          曲++;
          const t = sg.tracks.chord;
          const 息 = !!(t && t.on && t.inst && INSTRUMENTS[t.inst] && 息弓.has(INSTRUMENTS[t.inst].fam));
          if(息弓だけ && !息) continue;
          if(息) 対象曲++;
          const CP = chordPatterns(sg);
          sg.phrases.forEach(ph => {
            if(!ph.cpat) return; 全ph++;
            const p = CP[ph.cpat]; if(!p) return;
            if(p.dur === '16n' || p.style === 'strum' || ph.cpat === 'arp' || ph.cpat === 'arpFast'){
              無理++;
              if(例.length < 4) 例.push(`${pm} ${t && t.inst}／${ph.cpat}`);
            }
          });
        }
      });
      return { 曲, 対象曲, 全ph, 無理, 例 };
    };
    return { 息弓: 数える(対象, true), 据置: 数える(据置, false) };
  });
  checks.push({ ok: 伴奏.息弓.無理 === 0 && 伴奏.息弓.全ph > 0,
    label: `管・弦が伴奏のとき、刻み続ける形・かき鳴らし・走るアルペジオが出ない（${伴奏.息弓.無理}/${伴奏.息弓.全ph}フレーズ）`,
    info: 伴奏.息弓.無理 ? 伴奏.息弓.例.join(' / ') : '直す前は 80% が刻む形だった（7編成×60曲）' });
  checks.push({ ok: 伴奏.据置.無理 > 0,
    label: `ピアノ・ギター系の編成は据え置き（刻む形が ${伴奏.据置.無理}/${伴奏.据置.全ph}フレーズ残っている）`,
    info: 'ここまで消すと弾き語り・バンド・ジャズの伴奏がのっぺりする' });

  /* 木管レーン・金管レーンの中身
     ------------------------------------------------------------
     レーンの名前が「木管」「金管」なのだから、そこに入る音色も木管・金管で
     あること。以前は「完全ランダム」が全楽器から選んでいたため、実測で
     **木管レーンにピアノ・鉄琴・シンセ・打楽器、金管レーンにハープや
     バイオリン**が入り、画面に「金管　ハープ」と出ていた。
     曲調ごとの候補（MOODS.inst）にも同じ取り違えが2件あった。
     候補表を機械で洗って、二度と紛れ込まないようにする。 */
  const 変なの = await page.evaluate(() => {
    const fam = k => (INSTRUMENTS[k] || {}).fam || '(不明)';
    const 期待 = { wind1:['木管','リード'], wind2:['金管'] };
    const bad = [];
    const 見る = (どこ, pool) => {
      if(!pool) return;
      ['wind1','wind2'].forEach(t => (pool[t] || []).forEach(k => {
        if(!期待[t].includes(fam(k))) bad.push(`${どこ}.${t}: ${k}（${fam(k)}）`);
      }));
    };
    const F = (window.ZCNOVA_FAMILIES || {}).defs || {};
    Object.keys(F).forEach(fk => 見る('楽器カテゴリ:' + fk, F[fk].pool || (F[fk].poolFn ? F[fk].poolFn() : null)));
    PLAY_MODES.forEach(pm => 見る('編成:' + pm.key, pm.pool));
    MOODS.forEach(m => 見る('曲調:' + m.key, m.inst));
    return [...new Set(bad)];
  });
  checks.push({ ok: 変なの.length === 0,
    label: '木管レーンには木管、金管レーンには金管しか入らない（候補表を全部確認）',
    info: 変なの.join(' / ') });

  /* 実際に作った曲でも同じか（候補表を通らない道が無いことの確認） */
  const 実際 = await page.evaluate(() => {
    const fam = k => (INSTRUMENTS[k] || {}).fam || '(不明)';
    const bad = [];
    ['fam_random_all', 'random', 'fam_concert', 'fam_orchestra', 'full'].forEach(pm => {
      for(let i = 0; i < 30; i++){
        const sg = makeSong(MOODS[i % MOODS.length].key, 2, pm, 120, 700 + i * 31);
        [['wind1', ['木管','リード']], ['wind2', ['金管']]].forEach(([t, ok]) => {
          const tr = sg.tracks[t];
          if(tr && tr.on && tr.inst && !ok.includes(fam(tr.inst))) bad.push(`${pm}.${t}: ${tr.inst}（${fam(tr.inst)}）`);
        });
      }
    });
    return [...new Set(bad)];
  });
  checks.push({ ok: 実際.length === 0,
    label: '作った曲でも同じ（5編成 × 30曲）', info: 実際.join(' / ') });

  return { checks };
}
