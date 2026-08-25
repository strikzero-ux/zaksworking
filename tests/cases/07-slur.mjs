/* ⑦ スラー（弓を返さずに次の音へ移る）
   ------------------------------------------------------------
   弦が打ち込み臭く聞こえる主因は「音符ごとに必ず弓を当て直していた」こと
   だった。近い音へなめらかに移るときは弓を返さない、という判定を入れてある。

   ここで守りたい約束：
     1. 決めごとを1つも破らない（休みをまたがない／跳躍でつながない／
        強拍の印が付いた音でつながない／同じ音でつながない／
        4音つながったらいったん弓を返す）
     2. 弓で擦る楽器にしか掛からない（ピアノやギターには掛からない）
     3. 何度呼んでも同じ答え（再生と書き出しで音が変わらないための条件）
     4. 曲のデータは1バイトも変えない（＝これは鳴らし方だけの変更）
   ============================================================ */
export const name = '⑦ スラー（弦の弾き方）';

export async function run({ page }){
  const r = await page.evaluate(() => {
    const out = { 違反: [], 弓の音符: 0, スラー: 0, 管の音符: 0, 管のスラー: 0,
                  弓以外に掛かった: 0, 最長の連続: 0 };
    const CASES = [['classic','violinSolo'],['classic','stringTrio'],['sad','violinCello'],
                   ['classic','fam_bowedStrings'],['fantasy','fam_orchestra'],['calm','celloSolo'],
                   ['bright','piano'],['rock','band'],
                   /* 2026-08-25 追加：管楽器。ここが 0% のまま放置されていた */
                   ['bright','fam_concert'],['march','fam_winds'],['march','fam_brass'],
                   ['bright','sax'],['bright','fam_full']];
    CASES.forEach(([mood, pm], ci) => {
      for(let i = 0; i < 6; i++){
        const sg = makeSong(mood, 4, pm, 90, 70000 + ci * 313 + i * 29);
        const nl = sg.noteLen || {};
        sg.phrases.forEach(ph => {
          ['mel1','mel2','sub','wind1','wind2'].forEach(k => {
            const artic = zcArticFamily(sg, k);
            const bow = artic === 'bow', wind = artic === 'wind';
            const ds = zcDurSteps(nl[k] || '8n');
            let runNow = 0;
            for(let s = 0; s < ph[k].length; s++){
              if(!ph[k][s]) continue;
              const sl = zcSlurAt(ph, k, s, ds, artic);
              /* 2. 弓・管以外には掛けない（ピアノやギターは舌も弓も無い） */
              if(!bow && !wind){ if(sl) out.弓以外に掛かった++; continue; }
              if(wind){
                out.管の音符++;
                if(sl){
                  out.管のスラー++;
                  /* 管の決めごと：音程は滑らせない・7半音まで・6音で息継ぎ */
                  let pw = -1;
                  for(let q = s - 1; q >= 0; q--) if(ph[k][q]){ pw = q; break; }
                  if(pw >= 0){
                    const ivw = Math.abs(noteToMidi(ph[k][s]) - noteToMidi(ph[k][pw]));
                    if(ivw === 0) out.違反.push('管：同じ音をつないだ');
                    if(ivw > 7) out.違反.push(`管：跳躍をつないだ（${ivw}半音）`);
                  }
                  if(s - pw > ds) out.違反.push('管：休みをまたいだ');
                  if(ph.acc && ph.acc[k] && ph.acc[k][s]) out.違反.push('管：強拍の印が付いた音をつないだ');
                }
                continue;
              }
              out.弓の音符++;
              if(!sl){ runNow = 0; continue; }
              out.スラー++;
              runNow++;
              if(runNow > out.最長の連続) out.最長の連続 = runNow;
              /* 1. 決めごとの検算 */
              let prev = -1;
              for(let q = s - 1; q >= 0; q--) if(ph[k][q]){ prev = q; break; }
              if(prev < 0){ out.違反.push('直前の音が無いのにスラー'); continue; }
              if(s - prev > ds) out.違反.push(`休みをまたいだ（間隔${s - prev} > 長さ${ds}）`);
              const iv = Math.abs(noteToMidi(ph[k][s]) - noteToMidi(ph[k][prev]));
              if(iv === 0) out.違反.push('同じ音をつないだ');
              if(iv > 4) out.違反.push(`跳躍をつないだ（${iv}半音）`);
              if(ph.acc && ph.acc[k] && ph.acc[k][s]) out.違反.push('強拍の印が付いた音をつないだ');
              if(sl.fromCents !== (noteToMidi(ph[k][prev]) - noteToMidi(ph[k][s])) * 100)
                out.違反.push('指を滑らせる量が直前の音と合っていない');
              if(runNow > 3) out.違反.push(`4音を超えて弓を返さなかった（${runNow}音）`);
            }
          });
        });
      }
    });
    /* 3. 何度呼んでも同じ */
    const sg = makeSong('classic', 4, 'stringTrio', 90, 4321);
    const a = [], c = [];
    sg.phrases.forEach(ph => { for(let s = 0; s < ph.mel1.length; s++){
      a.push(JSON.stringify(zcSlurAt(ph, 'mel1', s, 2)));
      c.push(JSON.stringify(zcSlurAt(ph, 'mel1', s, 2)));
    }});
    out.何度呼んでも同じ = a.join('|') === c.join('|');
    out.違反 = [...new Set(out.違反)];
    return out;
  });

  const rate = Math.round(r.スラー / Math.max(1, r.弓の音符) * 100);
  const wrate = Math.round(r.管のスラー / Math.max(1, r.管の音符) * 100);
  const 実物 = await 音源に本当に届いているか(page);
  return { checks: [
    { ok: r.違反.length === 0,
      label: `決めごとを1つも破らない（弓の音符 ${r.弓の音符}／スラー ${r.スラー}）`,
      info: r.違反.join('\n      ') },
    { ok: r.最長の連続 <= 3,
      label: `4音つながったら弓を返す（いちばん長い連続 ${r.最長の連続}音）` },
    { ok: rate >= 10 && rate <= 60,
      label: `弓の音符のうち ${rate}% がなめらかにつながる（1〜6割なら妥当）` },
    { ok: r.何度呼んでも同じ,
      label: '何度呼んでも同じ答え（再生と書き出しで音が変わらない）' },
    /* ------------------------------------------------------------
       2026-08-25 追加：管楽器
       zcArticFamily は前から 'wind' を返していたのに、playStep が 'bow' しか
       見ておらず、**管楽器は1音残らず舌で切っていた**（実測スラー率 0%）。
       弦について書いてある「1音ごとの当たりが打ち込み臭さの主因」は、
       管では「タ・タ・タ」と全部の音の頭に舌が付く形でそっくり起きていた。
       ------------------------------------------------------------ */
    { ok: wrate >= 10 && wrate <= 60,
      label: `管の音符のうち ${wrate}% がなめらかにつながる（管 ${r.管の音符}音／1〜6割なら妥当）`,
      info: wrate === 0 ? '管に掛かっていない。playStep の setSlur が bow だけを見ていないか'
                        : '直す前は 0%（全部タンギング）だった' },
    ...実物,
  ] };
}

/* 判定が通っても、音源まで届いていなければ音は変わらない。
   書き出し（＝再生と同じ経路）で、音源が実際にスラーを受け取った数を数える。 */
async function 音源に本当に届いているか(page){
  const r = await page.evaluate(async () => {
    const out = {};
    for(const [pm, mood, 名] of [['fam_concert','bright','吹奏楽'],
                                 ['fam_bowedStrings','calm','弦楽器'],
                                 ['fam_piano','bright','ピアノ']]){
      let 全 = 0, スラー = 0;
      const 元 = window.ZCnovaAcoustic.prototype._one;
      window.ZCnovaAcoustic.prototype._one = function(note, duration, time, velocity, chord){
        全++;
        if(!chord && this._slur) スラー++;
        return 元.apply(this, arguments);
      };
      try{
        pickPM = pm; pickMood = mood; pickBars = 2; pickSec = 20;
        makeNewSong(20260825);
        await renderSong(song, null);
      } finally { window.ZCnovaAcoustic.prototype._one = 元; }
      out[名] = { 全, スラー };
    }
    return out;
  });
  const 一覧 = Object.entries(r)
    .map(([k, v]) => `${k} ${v.スラー}/${v.全}音`).join(' / ');
  return [
    { ok: r.吹奏楽.スラー > 0 && r.弦楽器.スラー > 0,
      label: '判定だけでなく、音源まで届いている（書き出しで実測）',
      info: 一覧 + '　／ 直す前は吹奏楽 0音だった' },
    { ok: r.ピアノ.スラー === 0,
      label: 'ピアノには掛からない（舌も弓も無い楽器）',
      info: `ピアノ ${r.ピアノ.スラー}/${r.ピアノ.全}音` },
  ];
}
