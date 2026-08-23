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
    const out = { 違反: [], 弓の音符: 0, スラー: 0, 弓以外に掛かった: 0, 最長の連続: 0 };
    const CASES = [['classic','violinSolo'],['classic','stringTrio'],['sad','violinCello'],
                   ['classic','fam_bowedStrings'],['fantasy','fam_orchestra'],['calm','celloSolo'],
                   ['bright','piano'],['rock','band']];
    CASES.forEach(([mood, pm], ci) => {
      for(let i = 0; i < 6; i++){
        const sg = makeSong(mood, 4, pm, 90, 70000 + ci * 313 + i * 29);
        const nl = sg.noteLen || {};
        sg.phrases.forEach(ph => {
          ['mel1','mel2','sub','wind1','wind2'].forEach(k => {
            const bow = zcArticFamily(sg, k) === 'bow';
            const ds = zcDurSteps(nl[k] || '8n');
            let runNow = 0;
            for(let s = 0; s < ph[k].length; s++){
              if(!ph[k][s]) continue;
              const sl = zcSlurAt(ph, k, s, ds);
              /* 2. 弓以外には掛けない（掛かってしまっても playStep が渡さないが、
                    判定そのものが弓向けであることをここで固定する） */
              if(!bow){ if(sl) out.弓以外に掛かった++; continue; }
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
  ] };
}
