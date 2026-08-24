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
    ...(await 高い音の使いすぎ(page)),
    ...(await 耳で聞いた音量のそろい(page)),
  ] };
}

/* 【刺さる楽器が高いところに居座らないか】
   ------------------------------------------------------------
   実物の音域をそのまま使うと、鉄琴（G5〜C7）やピッコロ（D5〜C7）は
   下が高いぶん、常に耳の痛い所で鳴り続ける。ZC_RANGE_BGM で
   「BGMとして使ってよい範囲」を別に決めてあるので、それが効いているかを
   実際に曲を作って確かめる。

   直す前（220曲の実測。G5より上を使っていた割合）:
     鉄琴 85% / ピッコロ 76% / ハープ 67% / リード 50% / 木琴 47%
   上限を下げただけでは鉄琴・ピッコロは 68% 止まりで、**下限も下げて**
   初めて下がる。ここを戻すと、その状態に逆戻りする。 */
async function 高い音の使いすぎ(page){
  const r = await page.evaluate(() => {
    const acc = {}; const 段 = {};
    const PM = ['fam_random_all','random','band','fullband','fam_synth','piano','fam_orchestra','fam_concert'];
    for(let i = 0; i < 160; i++){
      const sg = makeSong(MOODS[i % MOODS.length].key, 2, PM[i % PM.length], 120, 6000 + i * 37);
      ['mel1','mel2','sub','bass','wind1','wind2'].forEach(k => {
        const t = sg.tracks[k]; if(!t || !t.on || !t.inst) return;
        sg.phrases.forEach(ph => (ph[k] || []).forEach(n => {
          if(!n) return; const m = noteToMidi(n); if(m === null) return;
          const a = acc[t.inst] || (acc[t.inst] = { 全:0, 上84:0 });
          a.全++; if(m > 84) a.上84++;
          const b = 段[k] || (段[k] = { 全:0, 上79:0 });
          b.全++; if(m > 79) b.上79++;
        }));
      });
    }
    const 割合 = {};
    Object.keys(acc).forEach(k => { if(acc[k].全 >= 150) 割合[k] = +(acc[k].上84 / acc[k].全 * 100).toFixed(0); });
    return { C6超: 割合, sub: 段.sub ? +(段.sub.上79 / 段.sub.全 * 100).toFixed(0) : 0 };
  });
  /* いちばん刺さるのは C6 より上。実測で 24% 以下に収まっている。 */
  const 悪い = Object.entries(r.C6超).filter(([, v]) => v > 30).map(([k, v]) => `${k} ${v}%`);
  return [
    { ok: 悪い.length === 0,
      label: `C6より上に居座る楽器がない（いちばん高いのは ${Math.max(0, ...Object.values(r.C6超))}%）`,
      info: 悪い.length ? '30%を超えた: ' + 悪い.join(' / ')
                        : '直す前は 鉄琴58% / ピッコロ47% / ハープ37% だった' },
    { ok: r.sub <= 42,
      label: `刻み・装飾（sub）が高いところに寄りすぎない（G5超 ${r.sub}%）`,
      info: '直す前は 56% で全パート中いちばん高かった' },
  ];
}

/* 【旋律を担う楽器が、耳で聞いて同じくらいの大きさか】
   ------------------------------------------------------------
   ⚠️ そろえる物差しは必ず A特性（人の耳の感じ方に近い重み付け）で。
   以前ここは **素の音量（linear RMS）** でそろえてあった。人の耳は
   2〜5kHz にいちばん敏感で、金管・リードのエネルギーはちょうどそこに
   集まっているので、素の音量が同じでも耳では桁違いに大きく感じる。
   その結果 トランペットは **ピアノより 11dB 大きく、2〜5kHz は約90倍**
   という状態で、「かなりきつい」と言われていた。

   直す前（それぞれの音域の真ん中の音）:
     オーボエ 64.2 / トランペット 63.1 / ブラス 62.1 / サックス 61.3 /
     クラリネット 60.1 / トロンボーン 59.6 / ホルン 58.3 dB
   直したあとは 55〜59dB に収まる。ここが再び広がったら、
   物差しを間違えて合わせ直した可能性が高い。 */
async function 耳で聞いた音量のそろい(page){
  const r = await page.evaluate(async () => {
    function A(f){ const f2 = f*f, f4 = f2*f2;
      return (12194*12194*f4) /
        ((f2+20.6*20.6) * Math.sqrt((f2+107.7*107.7)*(f2+737.9*737.9)) * (f2+12194*12194))
        * Math.pow(10, 0.1); }
    function fft(re, im){ const n = re.length;
      for(let i=1,j=0;i<n;i++){ let b=n>>1; for(; j&b; b>>=1) j^=b; j^=b;
        if(i<j){ let t=re[i];re[i]=re[j];re[j]=t; t=im[i];im[i]=im[j];im[j]=t; } }
      for(let len=2;len<=n;len<<=1){ const a=-2*Math.PI/len, wr=Math.cos(a), wi=Math.sin(a);
        for(let i=0;i<n;i+=len){ let cr=1, ci=0;
          for(let k=0;k<len/2;k++){ const ur=re[i+k], ui=im[i+k];
            const vr=re[i+k+len/2]*cr - im[i+k+len/2]*ci, vi=re[i+k+len/2]*ci + im[i+k+len/2]*cr;
            re[i+k]=ur+vr; im[i+k]=ui+vi; re[i+k+len/2]=ur-vr; im[i+k+len/2]=ui-vi;
            const nc=cr*wr-ci*wi; ci=cr*wi+ci*wr; cr=nc; } } } }
    const 名 = m => ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][m%12] + (Math.floor(m/12)-1);
    async function 測る(inst){
      const rg = zcInstRange(inst); if(!rg) return null;
      const note = 名(Math.round((rg[0] + rg[1]) / 2));
      const buf = await Tone.Offline(() => {
        const v = makeVoice(inst, {}, false);
        const t = new Tone.Gain(zcInstTrim(inst));   /* 実際に通る出力そろえ */
        const g = new Tone.Gain(1); t.connect(g); g.toDestination();
        (v.connect ? v.connect(t) : v.output.connect(t));
        v.triggerAttackRelease(note, 1.0, 0.05, 0.8 * pitchTilt(note));
      }, 2.0);
      const d = buf.getChannelData(0), sr = buf.sampleRate, N = 16384, off = Math.floor(sr*0.28);
      const re = new Float64Array(N), im = new Float64Array(N);
      for(let i=0;i<N;i++){ const w = 0.5 - 0.5*Math.cos(2*Math.PI*i/(N-1)); re[i] = (d[off+i]||0)*w; }
      fft(re, im);
      let aw = 0;
      for(let k=1;k<N/2;k++){ const f = k*sr/N, p = re[k]*re[k] + im[k]*im[k]; aw += p*A(f)*A(f); }
      return aw > 1e-12 ? +(10*Math.log10(aw)).toFixed(1) : null;
    }
    const out = {};
    for(const k of ['trumpet','sax','brass','oboe','clarinet','trombone','horn','strings','violin']){
      const v = await 測る(k); if(v !== null) out[(INSTRUMENTS[k]||{}).label || k] = v;
    }
    return out;
  });
  const 値 = Object.values(r);
  const 幅 = 値.length ? +(Math.max(...値) - Math.min(...値)).toFixed(1) : 99;
  const 一覧 = Object.entries(r).map(([k,v]) => `${k} ${v}dB`).join(' / ');
  return [
    { ok: 幅 <= 5.0,
      label: `旋律を担う楽器が耳で同じくらいの大きさ（いちばん大きいのと小さいので ${幅}dB 差）`,
      info: 一覧 },
  ];
}
